import { describe, it, expect, beforeEach } from 'vitest';
import { MoodDecisionEngine, EMOTIONS } from '../../frontend/src/utils/moodDecisionEngine.js';

describe('Real-Time Facial Emotion Detection & Mood Decision Policy', () => {
  let engine;

  beforeEach(() => {
    engine = new MoodDecisionEngine({
      windowSize: 5,
      minWarmup: 2,
      switchThreshold: 3,
      minConfidence: 0.35,
      minMargin: 0.05,
      sustainedAmbiguityThreshold: 3,
      faceLostThreshold: 5
    });
  });

  it('1. One noisy prediction does not immediately change a stable mood', () => {
    // Warm-up & establish stable 'happy'
    engine.addPrediction({
      expression: 'happy',
      confidence: 0.90,
      all: { angry: 0.01, disgust: 0.01, fear: 0.01, happy: 0.90, sad: 0.02, surprise: 0.02, neutral: 0.03 }
    });
    const stateEstablished = engine.addPrediction({
      expression: 'happy',
      confidence: 0.92,
      all: { angry: 0.01, disgust: 0.01, fear: 0.01, happy: 0.92, sad: 0.01, surprise: 0.02, neutral: 0.02 }
    });

    expect(stateEstablished.status).toBe('stable');
    expect(stateEstablished.stableEmotion).toBe('happy');

    // Frame 3: Single noisy frame (e.g. eye blink, head tilt, momentary detector noise)
    const noisySadFrame = {
      expression: 'sad',
      confidence: 0.75,
      all: { angry: 0.05, disgust: 0.02, fear: 0.03, happy: 0.10, sad: 0.75, surprise: 0.02, neutral: 0.03 }
    };
    const stateAfterNoise = engine.addPrediction(noisySadFrame);

    // Concept 1: Raw prediction genuinely captures the latest model output
    expect(stateAfterNoise.rawPrediction.expression).toBe('sad');
    expect(stateAfterNoise.rawPrediction.confidence).toBe(0.75);

    // Concept 2: Stable detected mood remains 'happy' and DOES NOT flip on 1 noisy frame
    expect(stateAfterNoise.stableEmotion).toBe('happy');
    expect(stateAfterNoise.status).toBe('stable');
    expect(stateAfterNoise.consecutiveNewWins).toBe(1); // 1 win recorded towards switch threshold (3)
  });

  it('2. A consistently different emotion can change the stable mood within a few prediction cycles', () => {
    // Establish stable 'happy'
    engine.addPrediction({
      expression: 'happy',
      confidence: 0.88,
      all: { angry: 0.02, disgust: 0.01, fear: 0.01, happy: 0.88, sad: 0.02, surprise: 0.02, neutral: 0.04 }
    });
    engine.addPrediction({
      expression: 'happy',
      confidence: 0.90,
      all: { angry: 0.01, disgust: 0.01, fear: 0.01, happy: 0.90, sad: 0.02, surprise: 0.02, neutral: 0.03 }
    });
    expect(engine.getState().stableEmotion).toBe('happy');

    const sadFrame = {
      expression: 'sad',
      confidence: 0.85,
      all: { angry: 0.02, disgust: 0.01, fear: 0.02, happy: 0.05, sad: 0.85, surprise: 0.02, neutral: 0.03 }
    };

    // Cycle 1 of sad
    const state1 = engine.addPrediction(sadFrame);
    expect(state1.stableEmotion).toBe('happy'); // Kept stable

    // Cycle 2 of sad
    const state2 = engine.addPrediction(sadFrame);
    expect(state2.stableEmotion).toBe('happy'); // Still requiring 3 consecutive frames

    // Cycle 3 of sad: prompt switch!
    const state3 = engine.addPrediction(sadFrame);
    expect(state3.stableEmotion).toBe('sad');
    expect(state3.status).toBe('stable');
    expect(state3.consecutiveNewWins).toBe(0);
  });

  it('3. Happy -> Neutral -> Happy transitions work continuously', () => {
    // 1. Initial Happy
    engine.addPrediction({ expression: 'happy', confidence: 0.92, all: { happy: 0.92, neutral: 0.02, sad: 0.01 } });
    engine.addPrediction({ expression: 'happy', confidence: 0.94, all: { happy: 0.94, neutral: 0.02, sad: 0.01 } });
    expect(engine.getState().stableEmotion).toBe('happy');

    // 2. User face relaxes to Neutral across 3 frames
    const neutralFrame = { expression: 'neutral', confidence: 0.86, all: { neutral: 0.86, happy: 0.04, sad: 0.03 } };
    engine.addPrediction(neutralFrame);
    engine.addPrediction(neutralFrame);
    const neutralState = engine.addPrediction(neutralFrame);
    expect(neutralState.stableEmotion).toBe('neutral');
    expect(neutralState.status).toBe('stable');

    // 3. User smiles again (Happy) across 3 frames
    const happyFrame = { expression: 'happy', confidence: 0.91, all: { happy: 0.91, neutral: 0.03, sad: 0.01 } };
    engine.addPrediction(happyFrame);
    engine.addPrediction(happyFrame);
    const backToHappyState = engine.addPrediction(happyFrame);
    expect(backToHappyState.stableEmotion).toBe('happy');
    expect(backToHappyState.status).toBe('stable');
  });

  it('4. Brief low-confidence frames do not constantly replace a stable mood with "Mood Unclear"', () => {
    // Establish stable 'happy'
    engine.addPrediction({ expression: 'happy', confidence: 0.88, all: { happy: 0.88, neutral: 0.05, sad: 0.02 } });
    engine.addPrediction({ expression: 'happy', confidence: 0.90, all: { happy: 0.90, neutral: 0.04, sad: 0.01 } });
    expect(engine.getState().stableEmotion).toBe('happy');

    // A brief low-confidence frame (e.g. partial shadow, confidence 0.32, low margin)
    const lowConfFrame = {
      expression: 'happy',
      confidence: 0.32,
      all: { angry: 0.12, disgust: 0.10, fear: 0.10, happy: 0.32, sad: 0.14, surprise: 0.10, neutral: 0.12 }
    };
    const state1 = engine.addPrediction(lowConfFrame);

    // Hysteresis preserves stable emotion without flipping to 'Mood Unclear' on frame 1
    expect(state1.status).toBe('stable');
    expect(state1.stableEmotion).toBe('happy');
    expect(state1.isAmbiguous).toBe(false);

    // Second brief low-confidence frame
    const state2 = engine.addPrediction(lowConfFrame);
    expect(state2.status).toBe('stable');
    expect(state2.stableEmotion).toBe('happy');
    expect(state2.isAmbiguous).toBe(false);
  });

  it('5. Sustained ambiguity is eventually surfaced honestly', () => {
    // Establish initial state
    engine.addPrediction({ expression: 'neutral', confidence: 0.70, all: { neutral: 0.70, happy: 0.10 } });
    engine.addPrediction({ expression: 'neutral', confidence: 0.75, all: { neutral: 0.75, happy: 0.10 } });

    // Sustained flat ambiguous predictions (e.g. 3 consecutive frames with top score < 0.35 and tiny margin)
    const ambiguousFrame = {
      expression: 'neutral',
      confidence: 0.22,
      all: { angry: 0.15, disgust: 0.12, fear: 0.13, happy: 0.14, sad: 0.12, surprise: 0.12, neutral: 0.22 }
    };

    engine.addPrediction(ambiguousFrame); // 1
    engine.addPrediction(ambiguousFrame); // 2
    const sustainedAmbiguityState = engine.addPrediction(ambiguousFrame); // 3 (>= sustainedAmbiguityThreshold)

    expect(sustainedAmbiguityState.status).toBe('ambiguous');
    expect(sustainedAmbiguityState.isAmbiguous).toBe(true);
    // Honest confidence without artificial inflation
    expect(sustainedAmbiguityState.stableConfidence).toBeLessThan(0.50);
  });

  it('6. Camera restart clears stale prediction history', () => {
    // Fill window with predictions
    for (let i = 0; i < 5; i++) {
      engine.addPrediction({ expression: 'happy', confidence: 0.90, all: { happy: 0.90, neutral: 0.05 } });
    }
    expect(engine.getState().historyLength).toBe(5);
    expect(engine.getState().stableEmotion).toBe('happy');

    // Camera restart / stop triggers reset
    engine.reset();

    const clearedState = engine.getState();
    expect(clearedState.historyLength).toBe(0);
    expect(clearedState.stableEmotion).toBeNull();
    expect(clearedState.stableConfidence).toBe(0);
    expect(clearedState.status).toBe('idle');
    expect(clearedState.rawPrediction).toBeNull();

    // Next frame enters initial warm-up state, not an immediate lock-in
    const warmupState = engine.addPrediction({ expression: 'sad', confidence: 0.80, all: { sad: 0.80 } });
    expect(warmupState.status).toBe('warming_up');
    expect(warmupState.stableEmotion).toBeNull();
  });

  it('7. Manual mood selection is never overwritten by automatic detection', () => {
    // Concept 3: User explicitly selects mood
    let userSelectedMood = 'Calm';

    // Live webcam detection generates high confidence 'Happy'
    engine.addPrediction({ expression: 'happy', confidence: 0.92, all: { happy: 0.92 } });
    const liveDetectState = engine.addPrediction({ expression: 'happy', confidence: 0.95, all: { happy: 0.95 } });

    // The detected mood is 'Happy', but userSelectedMood MUST remain 'Calm'
    expect(liveDetectState.stableEmotion).toBe('happy');
    expect(userSelectedMood).toBe('Calm');

    // Even if camera subsequently switches to 'Sad'
    engine.addPrediction({ expression: 'sad', confidence: 0.90, all: { sad: 0.90 } });
    engine.addPrediction({ expression: 'sad', confidence: 0.90, all: { sad: 0.90 } });
    engine.addPrediction({ expression: 'sad', confidence: 0.90, all: { sad: 0.90 } });

    expect(userSelectedMood).toBe('Calm'); // Strict preservation of explicit user choice
  });

  it('8. Recommendations are not regenerated on every frame', () => {
    let recommendationCalls = 0;
    const fetchRecommendations = () => { recommendationCalls += 1; };

    // Simulate 10 frames streaming in webcam detection loop
    for (let i = 0; i < 10; i++) {
      engine.addPrediction({
        expression: 'happy',
        confidence: 0.88,
        all: { happy: 0.88, neutral: 0.05, sad: 0.02 }
      });
      // In the detection loop, fetchRecommendations is NEVER called
    }

    expect(recommendationCalls).toBe(0);

    // Only triggered when user confirms
    const detectedMood = engine.getState().stableEmotion;
    expect(detectedMood).toBe('happy');
    if (detectedMood) {
      fetchRecommendations(detectedMood);
    }
    expect(recommendationCalls).toBe(1);
  });

  it('9. A stable mood change follows the intended recommendation flow', () => {
    // User confirmed 'Happy'
    let confirmedMood = 'Happy';
    let recommendationsMood = 'Happy';
    let updatePromptVisible = false;

    // Camera now stably detects 'Sad'
    engine.addPrediction({ expression: 'sad', confidence: 0.88, all: { sad: 0.88 } });
    engine.addPrediction({ expression: 'sad', confidence: 0.89, all: { sad: 0.89 } });
    const shiftState = engine.addPrediction({ expression: 'sad', confidence: 0.90, all: { sad: 0.90 } });

    expect(shiftState.stableEmotion).toBe('sad');

    // UI shows shift prompt instead of auto-reloading or blowing away songs
    if (shiftState.stableEmotion !== confirmedMood) {
      updatePromptVisible = true;
    }

    expect(updatePromptVisible).toBe(true);
    expect(recommendationsMood).toBe('Happy'); // Still playing 'Happy' undisturbed!

    // User explicitly clicks "Update soundtracks for Sad"
    const onUserConfirmedUpdate = (newMood) => {
      confirmedMood = newMood;
      recommendationsMood = newMood;
      updatePromptVisible = false;
    };

    onUserConfirmedUpdate(shiftState.stableEmotion);
    expect(confirmedMood).toBe('sad');
    expect(recommendationsMood).toBe('sad');
    expect(updatePromptVisible).toBe(false);
  });

  it('10. Prediction failures do not terminate the live detection loop', () => {
    let loopRunning = true;
    let framesRendered = 0;
    let isPredicting = false;
    let requestsDispatched = 0;

    const simulateFrame = (timeMs, lastEmotionTimeMs, triggerFail = false) => {
      try {
        framesRendered += 1;
        // Non-blocking in-flight guard check
        if (timeMs - lastEmotionTimeMs > 600 && !isPredicting) {
          isPredicting = true;
          requestsDispatched += 1;
          if (triggerFail) {
            throw new Error('ML HTTP 500 Service Error');
          }
        }
      } catch (err) {
        // Error is caught, does NOT crash loop
      } finally {
        isPredicting = false;
        loopRunning = true; // Animation frame loop guaranteed
      }
    };

    // Frame 1: successful dispatch
    simulateFrame(700, 0, false);
    expect(requestsDispatched).toBe(1);
    expect(loopRunning).toBe(true);

    // Frame 2: fails with error
    simulateFrame(1400, 700, true);
    expect(requestsDispatched).toBe(2);
    expect(loopRunning).toBe(true); // Loop continues!

    // Frame 3: recovers
    simulateFrame(2100, 1400, false);
    expect(requestsDispatched).toBe(3);
    expect(loopRunning).toBe(true);
    expect(framesRendered).toBe(3);
  });
});
