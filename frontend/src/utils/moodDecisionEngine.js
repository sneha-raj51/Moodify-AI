/**
 * Moodify AI — Real-Time Mood Decision Engine
 *
 * Implements a stable, responsive decision policy:
 * 1. Maintains a rolling window of recent valid predictions (default: 5 frames).
 * 2. Computes genuine aggregated probability distribution across all 7 emotions.
 * 3. Requires consistency before establishing or switching the stable detected mood.
 * 4. Filters transient noise (a single noisy frame cannot flip a stable emotion).
 * 5. Requires consecutive evidence (~3 frames) to switch emotions promptly when expressions genuinely change.
 * 6. Evaluates margin and confidence with hysteresis to prevent rapid flickering between emotion and "Mood Unclear".
 * 7. Honestly surfaces sustained ambiguity without fabricating confidence.
 * 8. Clears stale prediction history when camera stops, restarts, or face tracking is lost.
 */

export const EMOTIONS = ['angry', 'disgust', 'fear', 'happy', 'sad', 'surprise', 'neutral'];

export class MoodDecisionEngine {
  constructor(options = {}) {
    this.windowSize = options.windowSize ?? 5;
    this.minWarmup = options.minWarmup ?? 2;
    this.switchThreshold = options.switchThreshold ?? 3;
    this.minConfidence = options.minConfidence ?? 0.35;
    this.minMargin = options.minMargin ?? 0.05;
    this.sustainedAmbiguityThreshold = options.sustainedAmbiguityThreshold ?? 3;
    this.faceLostThreshold = options.faceLostThreshold ?? 5;
    this.confidenceThreshold = options.confidenceThreshold ?? 0.50;

    this.reset();
  }

  /**
   * Resets all history and state. Call when camera stops, restarts, or tracking is lost.
   */
  reset() {
    this.history = [];
    this.stableEmotion = null;
    this.stableConfidence = 0;
    this.status = 'idle'; // 'idle' | 'warming_up' | 'stable' | 'ambiguous'
    this.candidateNewEmotion = null;
    this.consecutiveNewWins = 0;
    this.consecutiveAmbiguousFrames = 0;
    this.consecutiveFaceLostFrames = 0;
    this.lastRawPrediction = null;
    this.isLowConfidence = false;
    this.modelVersion = null;
  }

  /**
   * Signals that face tracking was lost on the current video frame.
   * Tolerates momentary single-frame dropouts, but resets history on sustained loss.
   */
  onFaceLost() {
    this.consecutiveFaceLostFrames += 1;
    if (this.consecutiveFaceLostFrames >= this.faceLostThreshold) {
      this.reset();
      this.status = 'idle';
    }
    return this.getState();
  }

  /**
   * Ingests a new valid prediction from the model.
   * @param {Object} raw - { expression: string, confidence: number, scores?: Object, all?: Object }
   * @returns {Object} Updated decision engine state
   */
  addPrediction(raw) {
    if (!raw || !raw.expression) {
      return this.getState();
    }

    this.consecutiveFaceLostFrames = 0;

    // Extract genuine probability scores for all 7 emotions
    const rawScores = {};
    if (raw.all && typeof raw.all === 'object') {
      EMOTIONS.forEach(emo => {
        rawScores[emo] = typeof raw.all[emo] === 'number' ? raw.all[emo] : 0;
      });
    } else if (raw.scores && typeof raw.scores === 'object') {
      EMOTIONS.forEach(emo => {
        rawScores[emo] = typeof raw.scores[emo] === 'number' ? raw.scores[emo] : 0;
      });
    } else {
      EMOTIONS.forEach(emo => {
        rawScores[emo] = (raw.expression === emo) ? (raw.confidence || 0) : 0;
      });
    }

    const rawRanked = [...EMOTIONS].map(emo => ({
      emotion: emo,
      score: rawScores[emo] || 0
    })).sort((a, b) => b.score - a.score);

    const rawTop = rawRanked[0];
    const rawSecond = rawRanked[1] || { emotion: null, score: 0 };
    const rawMargin = rawTop ? rawTop.score - rawSecond.score : 0;

    if (typeof raw.confidence_threshold === 'number') {
      this.confidenceThreshold = raw.confidence_threshold;
    }
    if (raw.model_version) {
      this.modelVersion = raw.model_version;
    }

    const rawEntry = {
      expression: raw.expression,
      confidence: typeof raw.confidence === 'number' ? raw.confidence : (rawScores[raw.expression] || 0),
      scores: rawScores,
      classProbabilities: raw.class_probabilities || rawScores,
      low_confidence: Boolean(raw.low_confidence ?? ((raw.confidence || 0) < this.confidenceThreshold)),
      confidenceThreshold: this.confidenceThreshold,
      modelVersion: this.modelVersion,
      timestamp: Date.now()
    };
    this.lastRawPrediction = rawEntry;

    // Maintain rolling window of the latest valid predictions
    this.history.push(rawEntry);
    if (this.history.length > this.windowSize) {
      this.history.shift();
    }

    // Compute aggregated probability distribution across the window
    const aggregated = {};
    EMOTIONS.forEach(emo => {
      let sum = 0;
      for (const h of this.history) {
        sum += h.scores[emo] || 0;
      }
      aggregated[emo] = sum / this.history.length;
    });

    // Rank emotions by aggregated probability
    const ranked = [...EMOTIONS].map(emo => ({
      emotion: emo,
      score: aggregated[emo] || 0
    })).sort((a, b) => b.score - a.score);

    const top = ranked[0];
    const second = ranked[1] || { emotion: null, score: 0 };
    const margin = top.score - second.score;

    // Evaluate ambiguity: evaluate both incoming raw frame and rolling aggregated distribution
    const isRawAmbiguous = rawTop.score < this.minConfidence || rawMargin < this.minMargin;
    const isAggAmbiguous = top.score < this.minConfidence || margin < this.minMargin;
    const isFrameAmbiguous = isRawAmbiguous || isAggAmbiguous;

    if (isFrameAmbiguous) {
      this.consecutiveAmbiguousFrames += 1;
    } else {
      this.consecutiveAmbiguousFrames = 0;
    }

    // Phase 1: Initial camera warm-up
    if (this.history.length < this.minWarmup) {
      this.status = 'warming_up';
      return this.getState(aggregated, ranked, margin);
    }

    // Phase 2: No stable emotion established yet
    if (!this.stableEmotion) {
      if (!isFrameAmbiguous) {
        this.stableEmotion = top.emotion;
        this.stableConfidence = top.score;
        this.status = 'stable';
        this.candidateNewEmotion = null;
        this.consecutiveNewWins = 0;
      } else {
        // Sustained ambiguity during startup
        if (this.history.length >= this.windowSize || this.consecutiveAmbiguousFrames >= this.sustainedAmbiguityThreshold) {
          this.status = 'ambiguous';
        } else {
          this.status = 'warming_up';
        }
      }
      return this.getState(aggregated, ranked, margin);
    }

    // Phase 3: Stable emotion is already established
    const rawWinner = rawEntry.expression;

    if (rawWinner !== this.stableEmotion) {
      if (rawWinner === this.candidateNewEmotion) {
        this.consecutiveNewWins += 1;
      } else {
        this.candidateNewEmotion = rawWinner;
        this.consecutiveNewWins = 1;
      }

      // Check if candidate consistently won enough consecutive predictions to switch
      if (this.consecutiveNewWins >= this.switchThreshold && !isRawAmbiguous) {
        this.stableEmotion = this.candidateNewEmotion;
        this.stableConfidence = aggregated[this.candidateNewEmotion] || top.score;
        this.status = 'stable';
        this.consecutiveNewWins = 0;
        this.candidateNewEmotion = null;
        this.consecutiveAmbiguousFrames = 0;
      } else {
        // Noise rejection: Keep current stable emotion active!
        this.stableConfidence = aggregated[this.stableEmotion] || this.stableConfidence;
      }
    } else {
      // Incoming raw winner confirms stableEmotion
      this.candidateNewEmotion = null;
      this.consecutiveNewWins = 0;
      this.stableConfidence = aggregated[this.stableEmotion] || top.score;
    }

    // Phase 4: Ambiguity hysteresis evaluation
    // If ambiguity is sustained across multiple consecutive cycles, honestly reflect uncertainty
    if (this.consecutiveAmbiguousFrames >= this.sustainedAmbiguityThreshold) {
      this.status = 'ambiguous';
    } else if (this.status === 'ambiguous' && !isFrameAmbiguous && (rawWinner === this.stableEmotion || this.consecutiveNewWins >= 2)) {
      this.status = 'stable';
    }

    return this.getState(aggregated, ranked, margin);
  }

  /**
   * Retrieves the current immutable snapshot of the decision engine.
   */
  getState(aggregated = {}, ranked = [], margin = 0) {
    if (ranked.length === 0 && this.history.length > 0) {
      const agg = {};
      EMOTIONS.forEach(emo => {
        let sum = 0;
        for (const h of this.history) {
          sum += h.scores[emo] || 0;
        }
        agg[emo] = sum / this.history.length;
      });
      aggregated = agg;
      ranked = [...EMOTIONS].map(emo => ({
        emotion: emo,
        score: aggregated[emo] || 0
      })).sort((a, b) => b.score - a.score);
      margin = ranked[0].score - (ranked[1]?.score || 0);
    }

    const effectiveConfidence = Math.max(0, Math.min(1, this.stableConfidence));
    const isLowConfidence = Boolean(
      this.status === 'ambiguous' || 
      (effectiveConfidence > 0 && effectiveConfidence < this.confidenceThreshold) ||
      (this.lastRawPrediction && this.lastRawPrediction.low_confidence)
    );

    return {
      rawPrediction: this.lastRawPrediction,
      stableEmotion: this.stableEmotion,
      stableConfidence: effectiveConfidence,
      status: this.status, // 'idle' | 'warming_up' | 'stable' | 'ambiguous'
      isAmbiguous: this.status === 'ambiguous',
      isStable: this.status === 'stable',
      isLowConfidence,
      confidenceThreshold: this.confidenceThreshold,
      modelVersion: this.modelVersion,
      margin: Math.max(0, margin),
      topTwo: ranked.slice(0, 2),
      aggregatedScores: aggregated,
      classProbabilities: aggregated,
      historyLength: this.history.length,
      consecutiveNewWins: this.consecutiveNewWins,
      candidateNewEmotion: this.candidateNewEmotion
    };
  }
}
