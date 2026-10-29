import { useState, useEffect, useRef, useCallback } from 'react';
import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';
import { loadEmotionModel, predictEmotionFromVideo } from '../utils/emotionClassifier';
import { MoodDecisionEngine, EMOTIONS } from '../utils/moodDecisionEngine';

export const useFaceDetector = () => {
  const [isDetecting, setIsDetecting] = useState(false);
  const [error, setError] = useState(null);
  const [cameraStatus, setCameraStatus] = useState('idle'); // 'idle' | 'starting' | 'active' | 'permission-denied' | 'no-device' | 'in-use' | 'error'
  const [faceDetected, setFaceDetected] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [mlServiceError, setMlServiceError] = useState(null);

  // Concept 1: Raw prediction (latest model output directly from inference)
  const [rawPrediction, setRawPrediction] = useState(null);

  // Concept 2: Stable detected mood (evaluated across rolling window with decision policy)
  const [stableEmotion, setStableEmotion] = useState(null);
  const [stableConfidence, setStableConfidence] = useState(0);
  const [detectionStatus, setDetectionStatus] = useState('idle'); // 'idle' | 'warming_up' | 'stable' | 'ambiguous'
  const [isAmbiguous, setIsAmbiguous] = useState(false);
  const [detectionStats, setDetectionStats] = useState(null);

  // Backward-compatible aliases (reflect stable detected values, avoiding raw 1-frame flickering)
  const [emotion, setEmotion] = useState(null);
  const [emotionConfidence, setEmotionConfidence] = useState(0);

  // Confidence & probabilities states
  const [isLowConfidence, setIsLowConfidence] = useState(false);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.50);
  const [classProbabilities, setClassProbabilities] = useState(null);
  const [modelVersion, setModelVersion] = useState(null);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const detectorRef = useRef(null);
  const streamRef = useRef(null);
  const requestRef = useRef(null);

  const isDetectingRef = useRef(false);
  const isPredictingRef = useRef(false);
  const consecutiveErrorsRef = useRef(0);
  const sessionIdRef = useRef(0);
  const lastVideoTimeRef = useRef(-1);
  const lastEmotionTimeRef = useRef(0);
  const lastCropRef = useRef(null);
  const diagnosticHistoryRef = useRef([]);
  const predictCountRef = useRef(0);

  // Deterministic Mood Decision Engine
  const engineRef = useRef(new MoodDecisionEngine({
    windowSize: 5,
    minWarmup: 2,
    switchThreshold: 3,
    minConfidence: 0.35,
    minMargin: 0.05,
    sustainedAmbiguityThreshold: 3,
    faceLostThreshold: 5
  }));

  useEffect(() => {
    let isCancelled = false;

    const initializeDetector = async () => {
      setIsModelLoading(true);
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.15/wasm"
        );
        
        let detector = null;
        try {
          // Attempt GPU delegate first
          detector = await FaceDetector.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
              delegate: "GPU"
            },
            runningMode: "VIDEO"
          });
        } catch (gpuErr) {
          console.warn("GPU delegate for FaceDetector failed, falling back to CPU delegate:", gpuErr);
          // Fallback to CPU delegate if GPU delegate is unsupported or fails
          detector = await FaceDetector.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
              delegate: "CPU"
            },
            runningMode: "VIDEO"
          });
        }

        if (!isCancelled) {
          detectorRef.current = detector;
          setIsModelLoading(false);
        }
      } catch (err) {
        console.error("Failed to initialize FaceDetector:", err);
        if (!isCancelled) {
          setError("Failed to load face detection model. Please ensure network connectivity or select your mood manually.");
          setIsModelLoading(false);
        }
      }
    };

    initializeDetector();
    loadEmotionModel();

    return () => {
      isCancelled = true;
      stopCamera();
      if (detectorRef.current) {
        try {
          detectorRef.current.close();
        } catch (e) {
          console.warn("Error closing detector:", e);
        }
      }
    };
  }, []);

  const stopCamera = useCallback(() => {
    sessionIdRef.current += 1;
    isPredictingRef.current = false;
    consecutiveErrorsRef.current = 0;
    lastCropRef.current = null;
    diagnosticHistoryRef.current = [];
    predictCountRef.current = 0;
    isDetectingRef.current = false;
    setIsDetecting(false);
    setCameraStatus('idle');
    setFaceDetected(false);
    setMlServiceError(null);

    // Reset decision engine & clear stale prediction history
    engineRef.current.reset();
    setRawPrediction(null);
    setStableEmotion(null);
    setStableConfidence(0);
    setDetectionStatus('idle');
    setIsAmbiguous(false);
    setDetectionStats(null);
    setEmotion(null);
    setEmotionConfidence(0);
    setIsLowConfidence(false);
    setConfidenceThreshold(0.50);
    setClassProbabilities(null);
    setModelVersion(null);

    // Safely stop all tracks on the active stream
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach(track => {
          track.stop();
        });
      } catch (e) {
        console.warn("Error stopping stream tracks:", e);
      }
      streamRef.current = null;
    }

    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      } catch (e) {
        console.warn("Error clearing video srcObject:", e);
      }
    }

    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
      requestRef.current = null;
    }

    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
  }, []);

  const predictWebcam = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !isDetectingRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Ensure canvas dimensions match live video dimensions
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
    }

    try {
      if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0 && detectorRef.current) {
        let startTimeMs = performance.now();
        if (lastVideoTimeRef.current !== video.currentTime) {
          lastVideoTimeRef.current = video.currentTime;
          const detections = detectorRef.current.detectForVideo(video, startTimeMs);
          
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          if (detections && detections.detections && detections.detections.length > 0) {
            setFaceDetected(true);
            ctx.lineWidth = 4;
            ctx.strokeStyle = '#B7D957';
            
            for (const detection of detections.detections) {
              const bbox = detection.boundingBox;
              if (bbox) {
                ctx.strokeRect(bbox.originX, bbox.originY, bbox.width, bbox.height);
              }
            }

            // Periodic prediction dispatch (every 600ms, non-blocking in-flight guard)
            if (startTimeMs - lastEmotionTimeRef.current > 600 && !isPredictingRef.current) {
              const currentSessionId = sessionIdRef.current;
              const primaryDetection = detections.detections[0];
              if (primaryDetection && primaryDetection.boundingBox) {
                lastEmotionTimeRef.current = startTimeMs;
                isPredictingRef.current = true;
                const reqStart = performance.now();

                predictEmotionFromVideo(video, primaryDetection.boundingBox)
                  .then(result => {
                    // Stale check: ignore response if session changed or camera stopped
                    if (sessionIdRef.current !== currentSessionId || !isDetectingRef.current) {
                      return;
                    }

                    if (result && result.expression) {
                      const httpDurationMs = performance.now() - reqStart;
                      consecutiveErrorsRef.current = 0;
                      setMlServiceError(null);
                      predictCountRef.current += 1;

                      // Evaluate model probabilities through the Mood Decision Engine
                      const engineState = engineRef.current.addPrediction(result);

                      // Update React states for distinct concepts
                      setRawPrediction(engineState.rawPrediction);
                      setStableEmotion(engineState.stableEmotion);
                      setStableConfidence(engineState.stableConfidence);
                      setDetectionStatus(engineState.status);
                      setIsAmbiguous(engineState.isAmbiguous);
                      setDetectionStats({
                        margin: engineState.margin,
                        topTwo: engineState.topTwo,
                        historyLength: engineState.historyLength,
                        candidateNewEmotion: engineState.candidateNewEmotion,
                        consecutiveNewWins: engineState.consecutiveNewWins
                      });

                      // Backward-compatible aliases
                      setEmotion(engineState.stableEmotion);
                      setEmotionConfidence(engineState.stableConfidence);

                      // Emotion confidence states
                      setIsLowConfidence(engineState.isLowConfidence);
                      setConfidenceThreshold(engineState.confidenceThreshold);
                      setClassProbabilities(engineState.classProbabilities);
                      setModelVersion(engineState.modelVersion);

                      // Development-only bounded diagnostic telemetry
                      if (import.meta.env.DEV) {
                        const crop = result.cropInfo || {};
                        const prevCrop = lastCropRef.current;
                        const cropChanged = !prevCrop || prevCrop.sx !== crop.sx || prevCrop.sy !== crop.sy || prevCrop.width !== crop.width || prevCrop.height !== crop.height || prevCrop.videoTime !== crop.videoTime;
                        lastCropRef.current = crop;

                        const diagEntry = {
                          seq: predictCountRef.current,
                          timestamp: new Date().toISOString(),
                          sessionId: currentSessionId,
                          faceDetected: true,
                          crop: `${crop.width}x${crop.height} (at x=${crop.sx}, y=${crop.sy}, t=${crop.videoTime?.toFixed(2)}s)`,
                          cropChangedFromPrevious: cropChanged,
                          httpLatencyMs: Math.round(httpDurationMs),
                          rawWinning: `${result.expression} (${(result.confidence * 100).toFixed(1)}%)`,
                          stableWinning: engineState.stableEmotion ? `${engineState.stableEmotion} (${(engineState.stableConfidence * 100).toFixed(1)}%)` : `Warming up (${engineState.historyLength}/5)`,
                          status: engineState.status,
                          margin: (engineState.margin * 100).toFixed(1) + '%'
                        };

                        diagnosticHistoryRef.current.push(diagEntry);
                        if (diagnosticHistoryRef.current.length > 20) {
                          diagnosticHistoryRef.current.shift();
                        }

                        console.info(`[Moodify Live Predict #${diagEntry.seq}] Raw: ${diagEntry.rawWinning} -> Stable: ${diagEntry.stableWinning} | Status: ${diagEntry.status} | Margin: ${diagEntry.margin}`);
                      }
                    }
                  })
                  .catch(err => {
                    if (sessionIdRef.current !== currentSessionId || !isDetectingRef.current) {
                      return;
                    }
                    console.warn("ML emotion service error:", err);
                    consecutiveErrorsRef.current += 1;

                    if (err.status === 503 || err.message?.includes('not ready')) {
                      setMlServiceError("Emotion model is not ready. Please select your mood manually.");
                    } else if (consecutiveErrorsRef.current >= 4) {
                      setMlServiceError(`Emotion detection service unavailable (${err.message || 'error'}). Please select your mood manually.`);
                    }
                  })
                  .finally(() => {
                    // Always release in-flight guard
                    isPredictingRef.current = false;
                  });
              }
            }
          } else {
            // Face lost on this frame
            const engineState = engineRef.current.onFaceLost();
            if (engineState.status === 'idle') {
              setFaceDetected(false);
              setRawPrediction(null);
              setStableEmotion(null);
              setStableConfidence(0);
              setDetectionStatus('idle');
              setIsAmbiguous(false);
              setEmotion(null);
              setEmotionConfidence(0);
              setIsLowConfidence(false);
              setConfidenceThreshold(0.50);
              setClassProbabilities(null);
              setModelVersion(null);
            }
          }
        }
      }
    } catch (err) {
      console.warn("Frame analysis error:", err);
    } finally {
      // Guaranteed continuous animation loop: will never terminate prematurely
      if (isDetectingRef.current) {
        requestRef.current = requestAnimationFrame(predictWebcam);
      }
    }
  }, []);

  const startCamera = async () => {
    sessionIdRef.current += 1;
    isPredictingRef.current = false;
    consecutiveErrorsRef.current = 0;
    lastCropRef.current = null;
    diagnosticHistoryRef.current = [];
    predictCountRef.current = 0;
    setError(null);
    setMlServiceError(null);
    setCameraStatus('starting');

    // Reset decision engine & clear stale prediction history
    engineRef.current.reset();
    setRawPrediction(null);
    setStableEmotion(null);
    setStableConfidence(0);
    setDetectionStatus('idle');
    setIsAmbiguous(false);
    setDetectionStats(null);
    setEmotion(null);
    setEmotionConfidence(0);
    setIsLowConfidence(false);
    setConfidenceThreshold(0.50);
    setClassProbabilities(null);
    setModelVersion(null);

    // Prevent duplicate camera streams
    if (isDetectingRef.current || streamRef.current) {
      stopCamera();
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraStatus('error');
      setError("Camera access is not supported by your browser. Please ensure you are using a secure connection (HTTPS or localhost).");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 640 }, 
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: false
      });

      streamRef.current = stream;

      if (videoRef.current) {
        const video = videoRef.current;
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        video.muted = true;

        // Ensure video playback starts explicitly
        video.onloadedmetadata = async () => {
          try {
            await video.play();
            setCameraStatus('active');
            isDetectingRef.current = true;
            setIsDetecting(true);
            predictWebcam();
          } catch (playErr) {
            console.warn("Video playback call failed:", playErr);
            video.muted = true;
            try {
              await video.play();
              setCameraStatus('active');
              isDetectingRef.current = true;
              setIsDetecting(true);
              predictWebcam();
            } catch (retryErr) {
              setCameraStatus('error');
              setError("Video playback could not start automatically. Please click Retry.");
            }
          }
        };
      }
    } catch (err) {
      console.error("Camera access error:", err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraStatus('permission-denied');
        setError("Camera permission denied. Please allow camera access in your browser address bar.");
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraStatus('no-device');
        setError("No camera device found. Please connect a webcam or select your mood manually.");
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setCameraStatus('in-use');
        setError("Camera is currently in use by another application. Please close other camera apps and retry.");
      } else {
        setCameraStatus('error');
        setError(`Camera initialization failed: ${err.message || 'Access unavailable'}.`);
      }
      isDetectingRef.current = false;
      setIsDetecting(false);
    }
  };

  const retryCamera = () => {
    stopCamera();
    setTimeout(() => {
      startCamera();
    }, 200);
  };

  return {
    videoRef,
    canvasRef,
    isDetecting,
    error,
    cameraStatus,
    isModelLoading,
    mlServiceError,
    faceDetected,
    // Distinct concepts (Goal 1 & 2):
    rawPrediction,      // Concept 1: Raw model output & probabilities
    stableEmotion,      // Concept 2: Evaluated stable emotion
    stableConfidence,   // Evaluated stable confidence
    detectionStatus,    // 'idle' | 'warming_up' | 'stable' | 'ambiguous'
    isAmbiguous,        // True when evidence is sustained ambiguous
    detectionStats,     // Margin, topTwo, historyLength, etc.
    emotion,            // Backward-compatible alias for stableEmotion
    emotionConfidence,  // Backward-compatible alias for stableConfidence
    isLowConfidence,    // Flag indicating confidence is below threshold or ambiguous
    confidenceThreshold,// Configured confidence threshold (e.g. 0.50)
    classProbabilities, // Full probability distribution across all 7 classes
    modelVersion,       // ResNet18 model version tag
    startCamera,
    stopCamera,
    retryCamera
  };
};
