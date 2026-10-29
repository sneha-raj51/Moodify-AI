import React, { useEffect, useState, useRef } from 'react';
import { 
  Camera, CameraOff, AlertCircle, CheckCircle, HelpCircle, 
  Play, Heart, Sparkles, Loader, ArrowRight, Plus, RefreshCw, ThumbsUp, ThumbsDown,
  ChevronDown, ChevronUp, Sliders, ShieldCheck, Info
} from 'lucide-react';
import { useFaceDetector } from '../hooks/useFaceDetector';
import { getAiRecommendations } from '../services/api';
import SongCover from '../components/SongCover';
import WhyThisSongModal from '../components/WhyThisSongModal';
import ListeningModeSelector from '../components/ListeningModeSelector';

const MoodStudio = ({ 
  globalMood, 
  setGlobalMood, 
  setCurrentView, 
  songs = [], 
  favorites = new Set(), 
  setCurrentSong, 
  setQueue,
  currentSong,
  toggleFavorite,
  listeningHistory = [],
  onOpenAddToPlaylist
}) => {
  const {
    videoRef,
    canvasRef,
    isDetecting,
    error,
    cameraStatus,
    mlServiceError,
    retryCamera,
    faceDetected,
    rawPrediction,
    stableEmotion,
    stableConfidence,
    detectionStatus,
    isAmbiguous,
    isLowConfidence,
    confidenceThreshold,
    classProbabilities,
    modelVersion,
    detectionStats,
    emotion,
    emotionConfidence,
    startCamera,
    stopCamera
  } = useFaceDetector();

  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiSongs, setAiSongs] = useState([]);
  const [aiSource, setAiSource] = useState(null);
  const [aiProvider, setAiProvider] = useState(null);
  const [aiError, setAiError] = useState(null);
  const [languageFilter, setLanguageFilter] = useState('');
  const [listeningMode, setListeningMode] = useState(null);
  
  // Mood Confirmation & Manual Correction Flow State
  const [confirmedMood, setConfirmedMood] = useState(null);
  const [modelPredictedMood, setModelPredictedMood] = useState(null);
  const [modelConfidenceVal, setModelConfidenceVal] = useState(null);
  const [isManualOverride, setIsManualOverride] = useState(false);
  const [showManualSelection, setShowManualSelection] = useState(false);
  const [showProbabilities, setShowProbabilities] = useState(false);
  const [detectedMoodState, setDetectedMoodState] = useState(null); // { mood, expression, confidence, isLowConfidence, classProbabilities }
  const [songForExplanation, setSongForExplanation] = useState(null);
  
  // Deduplication & scroll refs
  const isRequestingRef = useRef(false);
  const lastRequestedKeyRef = useRef('');
  const recommendationsRef = useRef(null);
  const manualPickerRef = useRef(null);

  // All 7 FER-2013 supported categories
  const moods = ['Angry', 'Disgust', 'Fear', 'Happy', 'Sad', 'Surprise', 'Neutral'];

  // Map ML expression to app moods accurately (1:1 with FER-2013 classes)
  const mapEmotionToMood = (expr) => {
    if (!expr) return null;
    const clean = String(expr).toLowerCase().trim();
    switch (clean) {
      case 'angry': return 'Angry';
      case 'disgust': return 'Disgust';
      case 'fear': return 'Fear';
      case 'happy': return 'Happy';
      case 'sad': return 'Sad';
      case 'surprise':
      case 'surprised':
        return 'Surprise';
      case 'neutral': return 'Neutral';
      default: return 'Neutral';
    }
  };

  // Update detected mood state smoothly while camera detects faces according to decision policy
  useEffect(() => {
    if (isDetecting && faceDetected) {
      const activeProbabilities = classProbabilities || rawPrediction?.classProbabilities || rawPrediction?.scores || null;
      const thresholdVal = Math.round((confidenceThreshold || 0.50) * 100);

      if (detectionStatus === 'warming_up') {
        setDetectedMoodState({
          status: 'warming_up',
          mood: null,
          expression: null,
          confidence: 0,
          confidenceThreshold: thresholdVal,
          isWarmingUp: true,
          isAmbiguous: false,
          isLowConfidence: false,
          isStable: false,
          classProbabilities: null,
          modelVersion: modelVersion || rawPrediction?.modelVersion
        });
      } else if (detectionStatus === 'ambiguous' || isLowConfidence) {
        const rawScore = typeof stableConfidence === 'number' && stableConfidence > 0 
          ? stableConfidence 
          : (rawPrediction?.confidence || 0);
        const confPercent = Math.round(rawScore * 100);
        const expr = stableEmotion || rawPrediction?.expression || 'neutral';
        const mood = mapEmotionToMood(expr);

        setDetectedMoodState({
          status: 'low_confidence',
          mood: mood,
          expression: expr,
          confidence: confPercent,
          confidenceThreshold: thresholdVal,
          isWarmingUp: false,
          isAmbiguous: true,
          isLowConfidence: true,
          isStable: false,
          classProbabilities: activeProbabilities,
          modelVersion: modelVersion || rawPrediction?.modelVersion
        });
      } else if (detectionStatus === 'stable' && stableEmotion) {
        const mood = mapEmotionToMood(stableEmotion);
        if (mood) {
          const confPercent = Math.round((stableConfidence || 0) * 100);
          setDetectedMoodState({
            status: 'stable',
            mood,
            expression: stableEmotion,
            confidence: confPercent,
            confidenceThreshold: thresholdVal,
            isWarmingUp: false,
            isAmbiguous: false,
            isLowConfidence: false,
            isStable: true,
            classProbabilities: activeProbabilities,
            modelVersion: modelVersion || rawPrediction?.modelVersion
          });
        }
      }
    } else if (!isDetecting) {
      // Clear detected state when camera stops to ensure no stale confidence values display
      setDetectedMoodState(null);
    }
  }, [
    isDetecting, 
    faceDetected, 
    detectionStatus, 
    stableEmotion, 
    stableConfidence, 
    isLowConfidence, 
    confidenceThreshold, 
    classProbabilities, 
    modelVersion, 
    rawPrediction
  ]);

  // Clean up camera when leaving view
  useEffect(() => {
    return () => {
      if (isDetecting) {
        stopCamera();
      }
    };
  }, [isDetecting, stopCamera]);

  // Request recommendations using existing recommendation service
  const fetchRecommendationsForMood = async (targetMood, forced = false, modeOverride = undefined) => {
    if (!targetMood || targetMood === 'All') return;
    const effectiveMode = modeOverride !== undefined ? modeOverride : listeningMode;
    const reqKey = `${targetMood}_${languageFilter}_${effectiveMode || 'none'}`;
    if (!forced && isRequestingRef.current) return;
    if (!forced && lastRequestedKeyRef.current === reqKey && aiSongs.length > 0) return;

    isRequestingRef.current = true;
    lastRequestedKeyRef.current = reqKey;
    setIsAiLoading(true);
    setAiError(null);

    try {
      const favSongs = (songs || []).filter(s => favorites && (favorites.has(s._id) || favorites.has(s.id) || favorites.has(String(s._id))));
      const favGenres = [...new Set(favSongs.map(s => s.genre).filter(Boolean))];
      const favArtists = [...new Set(favSongs.map(s => s.artist).filter(Boolean))];
      
      const recentHistory = (listeningHistory || []).slice(0, 15).map(h => ({
        id: h.songId || h.id,
        title: h.title,
        artist: h.artist,
        genre: h.genre,
        skipped: Boolean(h.skipped),
        completed: Boolean(h.completed),
        listenedDuration: h.listenedDuration || 0
      }));

      const data = await getAiRecommendations(
        targetMood, 
        favGenres, 
        favorites ? [...favorites] : [], 
        recentHistory, 
        languageFilter,
        favArtists,
        effectiveMode
      );

      setAiSongs(data.recommendations || []);
      setAiSource(data.source);
      setAiProvider(data.provider);

      // Smoothly scroll down so user immediately sees results without manual scrolling
      setTimeout(() => {
        if (recommendationsRef.current) {
          recommendationsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 150);
    } catch (err) {
      console.error('Mood recommendations error:', err);
      setAiError(err.message || 'Failed to fetch recommendations for this mood.');
    } finally {
      setIsAiLoading(false);
      isRequestingRef.current = false;
    }
  };

  // Action 1: User confirms the detected mood ("Yes, that's my mood")
  // Action 1: User confirms the detected mood ("Confirm Mood")
  const handleConfirmDetectedMood = async (moodToUse) => {
    const finalMood = moodToUse || detectedMoodState?.mood;
    if (!finalMood) return;

    // Immediately stop camera and establish mood so later frames never overwrite
    stopCamera();
    setConfirmedMood(finalMood);
    setGlobalMood(finalMood);
    setModelPredictedMood(finalMood);
    setModelConfidenceVal(detectedMoodState?.confidence ?? null);
    setIsManualOverride(false);

    // Request recommendations without triggering music playback
    await fetchRecommendationsForMood(finalMood);
  };

  // Action 2: User rejects the detected mood ("Change mood")
  const handleRejectDetectedMood = () => {
    if (detectedMoodState?.mood) {
      setModelPredictedMood(detectedMoodState.mood);
      setModelConfidenceVal(detectedMoodState.confidence ?? null);
    }
    stopCamera();
    setShowManualSelection(true);
    setDetectedMoodState(null);
    if (manualPickerRef.current) {
      manualPickerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // Action 3: User keeps their current mood when a camera shift is detected
  const handleKeepCurrentMood = () => {
    stopCamera();
    setDetectedMoodState(null);
  };

  // Manual mood selection fallback & user correction
  const handleManualMoodSelect = async (mood) => {
    // If camera is running, stop it so camera detections never overwrite explicit user choices
    if (isDetecting) {
      stopCamera();
    }
    const isOverride = Boolean(modelPredictedMood && modelPredictedMood !== mood);
    setIsManualOverride(isOverride);
    setConfirmedMood(mood);
    setGlobalMood(mood);
    setShowManualSelection(true);
    await fetchRecommendationsForMood(mood, true);
  };

  const handleLanguageChange = (newLang) => {
    setLanguageFilter(newLang);
    const activeMood = confirmedMood || (globalMood !== 'All' ? globalMood : null);
    if (activeMood) {
      fetchRecommendationsForMood(activeMood, true);
    }
  };

  const handleSelectListeningMode = (newMode) => {
    setListeningMode(newMode);
    const activeMood = confirmedMood || (globalMood !== 'All' ? globalMood : null);
    if (activeMood) {
      fetchRecommendationsForMood(activeMood, true, newMode);
    }
  };

  const activeMoodToDisplay = confirmedMood || (globalMood !== 'All' ? globalMood : null);

  return (
    <div className="pb-32">
      <div className="max-w-5xl mx-auto px-6 md:px-8 py-10 space-y-8">
        
        {/* Header */}
        <header className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-mood-forest/5 text-mood-forest text-xs font-bold tracking-wide uppercase">
            <Sparkles className="w-3.5 h-3.5 text-mood-cobalt" />
            Facial Mood Detection
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-mood-forest tracking-tight">
            Mood Studio
          </h2>
          <p className="text-mood-black/70 max-w-2xl text-base md:text-lg">
            Detect your mood using your webcam, confirm your emotion, and get music recommendations matched to how you feel.
          </p>
        </header>

        <div className="grid md:grid-cols-3 gap-8 items-start">
          
          {/* Left 2 Cols: Camera & Live Detection */}
          <div className="md:col-span-2 space-y-5">
            <div className="bg-white rounded-3xl p-6 border border-mood-black/5 shadow-sm space-y-4">
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Camera className="w-5 h-5 text-mood-cobalt" />
                  <h3 className="font-bold text-mood-forest text-lg">Live Mood Detection</h3>
                </div>
                {cameraStatus === 'starting' && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-amber-50 text-amber-800 border border-amber-200/60 rounded-full text-xs font-bold">
                    <div className="w-2 h-2 rounded-full border border-amber-600 border-t-transparent animate-spin" />
                    Camera Starting
                  </div>
                )}
                {cameraStatus === 'active' && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200/60 rounded-full text-xs font-bold">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    Camera Active
                  </div>
                )}
                {cameraStatus === 'permission-denied' && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-rose-50 text-rose-700 border border-rose-200/60 rounded-full text-xs font-bold">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Camera Permission Denied
                  </div>
                )}
                {cameraStatus === 'no-device' && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200/60 rounded-full text-xs font-bold">
                    <AlertCircle className="w-3.5 h-3.5" />
                    No Camera Device Found
                  </div>
                )}
                {cameraStatus === 'error' && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-rose-50 text-rose-700 border border-rose-200/60 rounded-full text-xs font-bold">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Camera Error
                  </div>
                )}
                {(cameraStatus === 'idle' || !cameraStatus) && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-mood-black/5 text-mood-black/60 rounded-full text-xs font-medium">
                    <CameraOff className="w-3.5 h-3.5" />
                    Camera Off
                  </div>
                )}
              </div>

              {/* Video & Canvas Container */}
              <div className="relative w-full aspect-video bg-mood-black/5 rounded-2xl overflow-hidden flex items-center justify-center border border-mood-black/10 shadow-inner">
                {cameraStatus === 'starting' && (
                  <div className="text-center space-y-3 p-6 z-20">
                    <div className="w-12 h-12 rounded-full border-3 border-mood-cobalt/30 border-t-mood-cobalt animate-spin mx-auto" />
                    <div>
                      <p className="text-mood-forest font-bold text-sm">Camera starting...</p>
                      <p className="text-mood-black/60 text-xs mt-0.5">Initializing camera stream and emotion detector...</p>
                    </div>
                  </div>
                )}

                {cameraStatus !== 'starting' && !isDetecting && !error && (
                  <div className="text-center space-y-3 p-6">
                    <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm border border-mood-black/5">
                      <Camera className="w-7 h-7 text-mood-forest" />
                    </div>
                    <div>
                      <p className="text-mood-forest font-bold text-sm">Camera is inactive</p>
                      <p className="text-mood-black/50 text-xs mt-0.5">Click "Start Camera Detection" below to initiate private facial mood detection.</p>
                    </div>
                  </div>
                )}
                
                {error && cameraStatus !== 'starting' && (
                  <div className="text-center space-y-3 px-6 max-w-md z-20">
                    <AlertCircle className="w-10 h-10 text-amber-600 mx-auto" />
                    <div>
                      <p className="text-mood-forest font-bold text-sm">{error}</p>
                      <p className="text-xs text-mood-black/60 mt-1">
                        {cameraStatus === 'permission-denied'
                          ? 'Camera permission is required. You can also select your mood manually from the panel on the right.'
                          : cameraStatus === 'no-device'
                          ? 'No webcam detected. You can select your mood manually from the panel on the right.'
                          : 'Camera initialization failed. Click Retry Camera below, or choose your mood manually.'}
                      </p>
                    </div>
                    <div className="flex items-center justify-center gap-2.5 pt-2">
                      <button
                        type="button"
                        onClick={retryCamera}
                        className="px-4 py-2 bg-mood-cobalt text-white rounded-xl text-xs font-bold hover:bg-mood-cobalt/90 transition-all shadow-sm flex items-center gap-1.5"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Retry Camera
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowManualSelection(true);
                          if (manualPickerRef.current) {
                            manualPickerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }
                        }}
                        className="px-4 py-2 bg-white text-mood-forest border border-mood-black/15 rounded-xl text-xs font-bold hover:bg-mood-black/5 transition-all"
                      >
                        Select Mood Manually
                      </button>
                    </div>
                  </div>
                )}

                <video 
                  ref={videoRef}
                  autoPlay 
                  playsInline 
                  muted 
                  className={`absolute inset-0 w-full h-full object-cover ${!isDetecting ? 'hidden' : ''}`}
                  style={{ transform: 'scaleX(-1)' }}
                />
                <canvas 
                  ref={canvasRef}
                  className={`absolute inset-0 w-full h-full object-cover z-10 ${!isDetecting ? 'hidden' : ''}`}
                  style={{ transform: 'scaleX(-1)' }}
                />
              </div>

              {/* Emotion Detection Service Warning if ML service is unreachable */}
              {mlServiceError && (
                <div className="p-3.5 bg-amber-50 text-amber-900 rounded-2xl border border-amber-200 text-xs flex items-center justify-between gap-3 animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                    <span><strong>Emotion detection service unavailable:</strong> {mlServiceError}</span>
                  </div>
                  <button 
                    type="button"
                    onClick={() => {
                      setShowManualSelection(true);
                      if (manualPickerRef.current) {
                        manualPickerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }
                    }}
                    className="px-3 py-1.5 bg-amber-600 text-white rounded-lg font-bold text-[11px] shrink-0 hover:bg-amber-700"
                  >
                    Select Mood Manually
                  </button>
                </div>
              )}

              {/* Live Status or Camera Button */}
              <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                <div className="flex items-center gap-2">
                  {isDetecting && !detectedMoodState && (
                    faceDetected ? (
                      <div className="flex items-center gap-2 text-xs font-semibold text-mood-forest bg-mood-forest/5 px-3 py-1.5 rounded-xl">
                        <div className="w-3 h-3 border-2 border-mood-forest/40 border-t-mood-forest rounded-full animate-spin" />
                        Analyzing facial expression...
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-xs font-semibold text-amber-800 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200/50">
                        <HelpCircle className="w-4 h-4 text-amber-600" />
                        No face detected in frame. Look toward the camera.
                      </div>
                    )
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {error && !isDetecting && (
                    <button 
                      type="button"
                      onClick={retryCamera}
                      className="px-4 py-2.5 rounded-xl bg-white border border-mood-black/15 text-mood-forest font-bold text-xs hover:bg-mood-black/5 transition-all flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Retry Camera
                    </button>
                  )}
                  {isDetecting ? (
                    <button 
                      type="button"
                      onClick={stopCamera}
                      className="px-5 py-2.5 rounded-xl bg-mood-black/5 text-mood-forest font-bold text-xs hover:bg-mood-black/10 transition-colors"
                    >
                      Stop Camera
                    </button>
                  ) : (
                    <button 
                      type="button"
                      onClick={startCamera}
                      className="px-6 py-2.5 rounded-xl bg-mood-cobalt text-white font-extrabold text-sm hover:bg-mood-cobalt/90 transition-all shadow-md flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <Camera className="w-4 h-4" />
                      {cameraStatus === 'starting' ? 'Starting...' : 'Start Camera Detection'}
                    </button>
                  )}
                </div>
              </div>

              {/* AUTOMATIC MOOD CONFIRMATION FLOW (PHASES 3, 4, 5) */}
              {isDetecting && detectedMoodState && (
                <div className={`p-5 rounded-2xl border transition-all animate-in fade-in slide-in-from-top-3 ${
                  detectedMoodState.isWarmingUp
                    ? 'bg-mood-forest/5 border-mood-forest/20 text-mood-forest'
                    : detectedMoodState.isLowConfidence
                    ? 'bg-gradient-to-r from-amber-950/95 to-[#2a1b0d] border-amber-500/40 text-white shadow-xl ring-1 ring-amber-500/20'
                    : 'bg-gradient-to-r from-mood-forest to-[#1c3a21] border-mood-lime/30 text-white shadow-lg'
                }`}>
                  <div className="space-y-4">
                    
                    {/* Header line & Status Badge */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {detectedMoodState.isWarmingUp ? (
                          <div className="w-3.5 h-3.5 border-2 border-mood-forest/40 border-t-mood-forest rounded-full animate-spin" />
                        ) : detectedMoodState.isLowConfidence ? (
                          <AlertCircle className="w-4 h-4 text-amber-400" />
                        ) : (
                          <Sparkles className="w-4 h-4 text-mood-lime" />
                        )}
                        <span className={`text-[11px] font-extrabold uppercase tracking-wider ${
                          detectedMoodState.isWarmingUp 
                            ? 'text-mood-forest/80' 
                            : detectedMoodState.isLowConfidence 
                            ? 'text-amber-300' 
                            : 'text-mood-lime'
                        }`}>
                          {detectedMoodState.isWarmingUp 
                            ? 'Evaluating Facial Expressions...' 
                            : detectedMoodState.isLowConfidence 
                            ? `Prediction Uncertain (< ${detectedMoodState.confidenceThreshold || 50}% Threshold)` 
                            : (confirmedMood && confirmedMood !== detectedMoodState.mood)
                            ? 'Mood Shift Detected'
                            : 'Facial Expression Detected'}
                        </span>
                      </div>

                      {detectedMoodState.modelVersion && (
                        <span className="text-[10px] text-white/50 font-mono">
                          {detectedMoodState.modelVersion}
                        </span>
                      )}
                    </div>

                    {/* Expression & Confidence Text */}
                    {detectedMoodState.isWarmingUp ? (
                      <p className="text-sm font-medium text-mood-forest/80 leading-relaxed">
                        Evaluating facial expressions across recent video frames... Please face the camera.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-sm">
                          <div>
                            <span className="text-white/70 font-medium">Detected Expression: </span>
                            <span className="font-extrabold text-white text-base capitalize tracking-wide">
                              {detectedMoodState.expression || detectedMoodState.mood}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-white/70 font-medium">Model Confidence: </span>
                            <span className={`font-extrabold text-base ${
                              detectedMoodState.isLowConfidence ? 'text-amber-300' : 'text-mood-lime'
                            }`}>
                              {detectedMoodState.confidence}%
                            </span>
                            <span className="text-[11px] text-white/50">
                              (Threshold: {detectedMoodState.confidenceThreshold || 50}%)
                            </span>
                          </div>
                        </div>

                        {/* Visual Confidence Indicator / Meter Bar */}
                        <div className="space-y-1.5 py-1">
                          <div className="w-full h-2.5 bg-black/40 rounded-full overflow-hidden relative border border-white/10">
                            <div 
                              className={`h-full rounded-full transition-all duration-300 ${
                                detectedMoodState.isLowConfidence ? 'bg-amber-400' : 'bg-mood-lime'
                              }`}
                              style={{ width: `${Math.min(100, Math.max(4, detectedMoodState.confidence))}%` }}
                            />
                            {/* Threshold Marker Indicator */}
                            <div 
                              className="absolute top-0 bottom-0 w-0.5 bg-white/80 z-10 shadow-sm"
                              style={{ left: `${detectedMoodState.confidenceThreshold || 50}%` }}
                              title={`Confidence threshold: ${detectedMoodState.confidenceThreshold || 50}%`}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-white/50 font-medium">
                            <span>0%</span>
                            <span className="text-white/70 font-semibold">
                              Threshold: {detectedMoodState.confidenceThreshold || 50}%
                            </span>
                            <span>100%</span>
                          </div>
                        </div>

                        {/* Low-confidence Alert & Guidance */}
                        {detectedMoodState.isLowConfidence && (
                          <div className="p-3 bg-amber-500/20 border border-amber-400/30 rounded-xl text-xs text-amber-100 flex items-start gap-2.5">
                            <AlertCircle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                            <div className="space-y-0.5 leading-relaxed">
                              <p className="font-bold text-amber-200">
                                Model confidence ({detectedMoodState.confidence}%) is below the {detectedMoodState.confidenceThreshold || 50}% threshold.
                              </p>
                              <p className="text-amber-100/90 text-[11px]">
                                The model detected hints of <strong>{detectedMoodState.mood}</strong>, but certainty is low. Facial expressions are complex and uncalibrated. Please confirm if this matches your mood, or select your mood manually below.
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Softmax Calibration Disclaimer */}
                        <p className="text-[10px] text-white/60 italic pt-0.5">
                          * Model confidence estimates visible facial-expression categories, not your true internal emotional state.
                        </p>

                        {/* Optional 7-Class Probabilities Disclosure */}
                        {detectedMoodState.classProbabilities && (
                          <div className="pt-1">
                            <button
                              type="button"
                              onClick={() => setShowProbabilities(prev => !prev)}
                              className="text-[11px] font-bold text-mood-lime/90 hover:text-mood-lime flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              {showProbabilities ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              {showProbabilities ? 'Hide Class Probabilities' : 'Show All 7 Emotion Probabilities'}
                            </button>

                            {showProbabilities && (
                              <div className="mt-2.5 p-3 rounded-xl bg-black/30 border border-white/10 space-y-2 animate-in fade-in">
                                <div className="text-[10px] uppercase font-bold text-white/60 tracking-wider">
                                  ResNet18 FER-2013 Probability Distribution
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                  {['angry', 'disgust', 'fear', 'happy', 'sad', 'surprise', 'neutral'].map(emo => {
                                    const prob = detectedMoodState.classProbabilities[emo] ?? 0;
                                    const pct = Math.round(prob * 100);
                                    const isTop = (detectedMoodState.expression || '').toLowerCase() === emo;
                                    return (
                                      <div 
                                        key={emo} 
                                        className={`p-2 rounded-lg border text-xs ${
                                          isTop 
                                            ? 'bg-white/15 border-mood-lime/50' 
                                            : 'bg-white/5 border-white/5'
                                        }`}
                                      >
                                        <div className="flex justify-between items-center text-[11px] capitalize">
                                          <span className={isTop ? 'font-bold text-mood-lime' : 'text-white/80'}>{emo}</span>
                                          <span className="font-extrabold text-white">{pct}%</span>
                                        </div>
                                        <div className="w-full h-1 bg-white/10 rounded-full mt-1 overflow-hidden">
                                          <div 
                                            className={`h-full ${isTop ? 'bg-mood-lime' : 'bg-white/40'}`} 
                                            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} 
                                          />
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2.5 pt-1">
                      {detectedMoodState.isWarmingUp ? (
                        <button
                          type="button"
                          onClick={() => {
                            setShowManualSelection(true);
                            if (manualPickerRef.current) {
                              manualPickerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                          }}
                          className="px-4 py-2 bg-mood-forest/10 hover:bg-mood-forest/20 text-mood-forest rounded-xl font-bold text-xs transition-all"
                        >
                          Select Mood Manually
                        </button>
                      ) : (confirmedMood && confirmedMood !== detectedMoodState.mood) ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleConfirmDetectedMood(detectedMoodState.mood)}
                            disabled={isAiLoading}
                            className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl font-extrabold text-sm transition-all shadow-md flex items-center justify-center gap-2 bg-mood-lime text-mood-forest hover:bg-[#c6e866] hover:scale-105 active:scale-95"
                          >
                            {isAiLoading ? (
                              <Loader className="w-4 h-4 animate-spin" />
                            ) : (
                              <RefreshCw className="w-4 h-4" />
                            )}
                            Update for {detectedMoodState.mood}
                          </button>
                          <button
                            type="button"
                            onClick={handleKeepCurrentMood}
                            className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-1.5 bg-white/10 hover:bg-white/20 text-white border border-white/10"
                          >
                            Keep {confirmedMood}
                          </button>
                        </>
                      ) : (
                        <>
                          {/* Confirm Mood Button */}
                          <button
                            type="button"
                            onClick={() => handleConfirmDetectedMood(detectedMoodState.mood)}
                            disabled={isAiLoading}
                            className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl font-extrabold text-sm transition-all shadow-md flex items-center justify-center gap-2 ${
                              detectedMoodState.isLowConfidence 
                                ? 'bg-amber-400 hover:bg-amber-300 text-amber-950 hover:scale-105' 
                                : 'bg-mood-lime hover:bg-[#c6e866] text-mood-forest hover:scale-105'
                            } active:scale-95`}
                          >
                            {isAiLoading ? (
                              <Loader className="w-4 h-4 animate-spin" />
                            ) : (
                              <CheckCircle className="w-4 h-4" />
                            )}
                            Confirm Mood ({detectedMoodState.mood})
                          </button>

                          {/* Change Mood Button */}
                          <button
                            type="button"
                            onClick={handleRejectDetectedMood}
                            disabled={isAiLoading}
                            className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-1.5 bg-white/10 hover:bg-white/20 text-white border border-white/10"
                          >
                            Change Mood
                          </button>
                        </>
                      )}
                    </div>

                  </div>
                </div>
              )}

            </div>

            {/* Privacy Guarantee Note (Phase 6) */}
            <div className="bg-mood-forest/5 p-4 rounded-2xl border border-mood-black/5 flex gap-3.5 items-start">
              <ShieldCheck className="w-5 h-5 text-mood-cobalt shrink-0 mt-0.5" />
              <div className="space-y-0.5 text-xs text-mood-black/70 leading-relaxed">
                <span className="font-bold text-mood-forest">On-Device Privacy & Facial Analysis Disclaimer:</span>{' '}
                Face detection is performed directly within your browser. Video frames are never recorded, transmitted, or stored on external servers or external LLMs. Visible facial expressions estimate visible patterns and do not guarantee internal emotional state. You always have full manual control to choose or correct your mood anytime.
              </div>
            </div>
          </div>

          {/* Right Col: Manual Mood Selection & Correction (Phase 5) */}
          <div ref={manualPickerRef} className="space-y-6">
            <div className={`rounded-3xl p-6 text-mood-offwhite shadow-md relative overflow-hidden transition-all duration-300 ${
              showManualSelection ? 'ring-4 ring-mood-cobalt bg-mood-forest' : 'bg-mood-forest'
            }`}>
              <div className="absolute -right-10 -top-10 w-40 h-40 bg-mood-lime/10 rounded-full blur-2xl"></div>
              
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-xl">Select Your Mood</h3>
                  {isManualOverride ? (
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-mood-cobalt text-white rounded-full">
                      User Corrected
                    </span>
                  ) : showManualSelection ? (
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-mood-lime text-mood-forest rounded-full">
                      Manual Pick
                    </span>
                  ) : null}
                </div>

                <p className="text-mood-offwhite/80 text-xs mb-3">
                  {modelPredictedMood ? (
                    <>
                      Model predicted: <strong className="text-mood-lime">{modelPredictedMood}</strong>
                      {typeof modelConfidenceVal === 'number' ? ` (${modelConfidenceVal}% confidence)` : ''}.
                      {' '}Feel free to select your actual mood below.
                    </>
                  ) : (
                    'Choose any of the 7 supported moods below to immediately generate curated playlists.'
                  )}
                </p>

                {isManualOverride && confirmedMood && (
                  <div className="mb-4 p-2.5 bg-mood-cobalt/20 border border-mood-cobalt/40 rounded-xl text-xs text-mood-offwhite flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-mood-lime shrink-0" />
                    <span>
                      Active mood corrected to <strong>{confirmedMood}</strong> (Model predicted: {modelPredictedMood})
                    </span>
                  </div>
                )}
                
                <div className="space-y-2">
                  {moods.map(mood => {
                    const isSelected = activeMoodToDisplay === mood;
                    const isPredicted = modelPredictedMood === mood;
                    return (
                      <button
                        key={mood}
                        type="button"
                        onClick={() => handleManualMoodSelect(mood)}
                        className={`w-full text-left px-4 py-3 rounded-2xl font-bold transition-all flex items-center justify-between group ${
                          isSelected
                            ? 'bg-mood-lime text-mood-forest shadow-md scale-[1.02]'
                            : 'bg-white/10 hover:bg-white/20 text-mood-offwhite'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{mood}</span>
                          {isPredicted && !isSelected && (
                            <span className="text-[9px] uppercase px-1.5 py-0.5 rounded-full bg-white/20 text-white/80 font-bold">
                              Predicted
                            </span>
                          )}
                          {isSelected && isManualOverride && (
                            <span className="text-[9px] uppercase px-1.5 py-0.5 rounded-full bg-mood-forest text-mood-lime font-bold">
                              Corrected
                            </span>
                          )}
                        </div>
                        {isSelected ? (
                          <CheckCircle className="w-5 h-5 text-mood-forest" />
                        ) : (
                          <ArrowRight className="w-4 h-4 opacity-40 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* AI Recommendations Area (Automatically populated & displayed below detection) */}
        {activeMoodToDisplay && (
          <div ref={recommendationsRef} className="space-y-6 pt-8 border-t border-mood-black/10 scroll-mt-6">
            
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-mood-cobalt mb-1">
                  <Sparkles className="w-4 h-4" />
                  Instant AI Soundtracks
                </div>
                <h3 className="text-2xl md:text-3xl font-extrabold text-mood-forest flex items-center gap-3 flex-wrap">
                  <span>Soundtracks for your <span className="text-mood-cobalt capitalize">{activeMoodToDisplay}</span> Mood</span>
                  {isManualOverride && (
                    <span className="px-2.5 py-0.5 rounded-full bg-mood-cobalt/10 text-mood-cobalt text-xs font-bold border border-mood-cobalt/20">
                      User-Corrected Mood
                    </span>
                  )}
                  {!isManualOverride && modelPredictedMood && (
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-xs font-bold border border-emerald-200">
                      Model Confirmed ({modelConfidenceVal}%)
                    </span>
                  )}
                </h3>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <select 
                  value={languageFilter}
                  onChange={(e) => handleLanguageChange(e.target.value)}
                  className="px-3.5 py-2 bg-white border border-mood-black/10 rounded-xl text-xs font-bold text-mood-forest focus:outline-none focus:border-mood-cobalt cursor-pointer shadow-sm"
                >
                  <option value="">All Languages</option>
                  <option value="English">English</option>
                  <option value="Hindi">Hindi</option>
                  <option value="Punjabi">Punjabi</option>
                </select>

                <button 
                  type="button"
                  onClick={() => fetchRecommendationsForMood(activeMoodToDisplay, true)}
                  disabled={isAiLoading}
                  className="flex items-center gap-1.5 px-4 py-2 bg-mood-cobalt text-white rounded-xl text-xs font-bold hover:bg-mood-cobalt/90 transition-all shadow-sm disabled:opacity-50"
                  title="Refresh recommendations"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isAiLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>

                <button
                  type="button"
                  onClick={() => setCurrentView && setCurrentView('mood-transition')}
                  className="flex items-center gap-1.5 px-4 py-2 bg-mood-forest text-mood-offwhite rounded-xl text-xs font-bold hover:bg-mood-forest/90 transition-all"
                >
                  Mood Transition <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Smart Listening Modes Selector */}
            <div className="bg-white p-4 rounded-3xl border border-mood-black/5 shadow-xs">
              <ListeningModeSelector 
                activeMode={listeningMode}
                onSelectMode={handleSelectListeningMode}
                setCurrentSong={setCurrentSong}
                setQueue={setQueue}
                favorites={favorites}
                listeningHistory={listeningHistory}
                currentSong={currentSong}
              />
            </div>

            {/* Error Message */}
            {aiError && (
              <div className="w-full p-4 bg-red-50 text-red-700 rounded-2xl border border-red-200 text-sm flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 shrink-0 text-red-600" />
                  <span>{aiError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => fetchRecommendationsForMood(activeMoodToDisplay, true)}
                  className="text-xs font-bold text-red-800 underline hover:no-underline shrink-0"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Loading State */}
            {isAiLoading && (
              <div className="py-20 flex flex-col items-center justify-center text-center bg-white rounded-3xl border border-mood-black/5 shadow-sm space-y-3">
                <div className="w-12 h-12 rounded-full border-3 border-mood-cobalt/20 border-t-mood-cobalt animate-spin" />
                <div>
                  <h4 className="font-bold text-mood-forest text-base">Curating Verified Soundtracks...</h4>
                  <p className="text-xs text-mood-black/50 mt-1">Analyzing mood affinity, recent listening, and verified stream sources</p>
                </div>
              </div>
            )}

            {/* Empty State */}
            {!isAiLoading && !aiError && aiSongs.length === 0 && (
              <div className="py-16 text-center bg-white rounded-3xl border border-mood-black/5 p-8 space-y-3 shadow-sm">
                <HelpCircle className="w-10 h-10 text-mood-black/30 mx-auto" />
                <h4 className="font-bold text-mood-forest text-base">No tracks found for this mood filter</h4>
                <p className="text-xs text-mood-black/60 max-w-sm mx-auto">
                  Try switching the language dropdown to "All Languages" or select a different mood above.
                </p>
              </div>
            )}

            {/* Curated Recommendations Cards */}
            {!isAiLoading && aiSongs.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-mood-black/50 font-semibold px-1">
                  <span className="flex items-center gap-1.5 text-mood-cobalt">
                    <Sparkles className="w-3.5 h-3.5" />
                    {aiProvider === 'gemini' ? 'Gemini AI Curated Selection' : 'Moodify Adaptive Selection'}
                  </span>
                  <span>{aiSongs.length} verified tracks</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5">
                  {aiSongs.map((song, sIdx) => {
                    const songId = song._id || song.id;
                    const hasAudio = Boolean(song.audioUrl || song.previewUrl || song.isPlayable);
                    const isFav = favorites && (
                      favorites.has(songId) || 
                      favorites.has(String(songId)) || 
                      (song._id && favorites.has(String(song._id))) ||
                      (song.id && favorites.has(String(song.id)))
                    );

                    return (
                      <div 
                        key={songId || sIdx}
                        className="group bg-white rounded-3xl p-4 border border-mood-black/5 hover:border-mood-black/15 hover:shadow-lg transition-all flex flex-col justify-between"
                      >
                        <div className="space-y-3">
                          <div className="relative aspect-square w-full rounded-2xl overflow-hidden bg-mood-black/5">
                            <SongCover 
                              src={song.cover || song.albumArt} 
                              title={song.title} 
                              artist={song.artist}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                            <button 
                              type="button"
                              onClick={() => {
                                if (setQueue) setQueue(aiSongs);
                                if (setCurrentSong) setCurrentSong(song);
                              }}
                              className="absolute inset-0 bg-mood-forest/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                              title="Play Track"
                            >
                              <div className="w-12 h-12 bg-mood-lime rounded-full flex items-center justify-center shadow-lg transform translate-y-2 group-hover:translate-y-0 transition-all">
                                <Play className="w-6 h-6 text-mood-forest ml-0.5 fill-current" />
                              </div>
                            </button>
                          </div>
                          
                          <div>
                            <h4 
                              onClick={() => {
                                if (setQueue) setQueue(aiSongs);
                                if (setCurrentSong) setCurrentSong(song);
                              }}
                              className="font-bold text-mood-forest text-sm truncate hover:text-mood-cobalt cursor-pointer"
                              title={song.title}
                            >
                              {song.title}
                            </h4>
                            <p className="text-xs text-mood-black/60 truncate mt-0.5">{song.artist}</p>
                            
                            <div className="flex flex-wrap items-center gap-1.5 mt-2">
                              {/* Provider Source Badge */}
                              <span className={`inline-block px-1.5 py-0.2 rounded text-[9px] font-bold border ${
                                song.provider === 'audius'
                                  ? 'text-purple-700 bg-purple-50 border-purple-200'
                                  : song.provider === 'jamendo'
                                  ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                                  : song.provider === 'itunes'
                                  ? 'text-blue-700 bg-blue-50 border-blue-200'
                                  : 'text-slate-700 bg-slate-50 border-slate-200'
                              }`}>
                                {song.sourceLabel || (song.provider === 'audius' ? 'Audius' : song.provider === 'jamendo' ? 'Jamendo' : song.provider === 'itunes' ? 'iTunes' : 'Moodify')}
                              </span>

                              {song.isFullAudio || (song.playbackType === 'full' && hasAudio) ? (
                                <span className="inline-block px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded text-[9px] font-bold border border-emerald-300/60">
                                  Full Track
                                </span>
                              ) : hasAudio ? (
                                <span className="inline-block px-1.5 py-0.2 bg-mood-cobalt/10 text-mood-cobalt rounded text-[9px] font-bold border border-mood-cobalt/20">
                                  30-sec Preview
                                </span>
                              ) : (
                                <span className="inline-block px-1.5 py-0.2 bg-mood-black/5 text-mood-black/50 rounded text-[9px] font-medium border border-mood-black/10">
                                  Track Info
                                </span>
                              )}

                              {song.genre && (
                                <span className="inline-block px-1.5 py-0.2 bg-mood-black/5 rounded text-[9px] text-mood-black/60 truncate max-w-[80px]">
                                  {song.genre}
                                </span>
                              )}
                            </div>

                            {song.explanation && (
                              <div className="mt-2 space-y-1">
                                <p className="text-[11px] text-mood-forest/80 font-medium italic leading-tight line-clamp-2 bg-mood-forest/5 p-1.5 rounded-lg">
                                  "{song.explanation}"
                                </p>
                                <button
                                  type="button"
                                  onClick={() => setSongForExplanation(song)}
                                  className="text-[11px] font-bold text-mood-cobalt hover:underline flex items-center gap-1 cursor-pointer"
                                >
                                  <Sparkles className="w-3 h-3 text-mood-cobalt" /> Why this song?
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="pt-3 mt-3 border-t border-mood-black/5 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {onOpenAddToPlaylist ? (
                              <button
                                type="button"
                                onClick={() => onOpenAddToPlaylist(song)}
                                className="text-xs font-semibold text-mood-cobalt hover:underline flex items-center gap-1"
                              >
                                <Plus className="w-3.5 h-3.5" /> Playlist
                              </button>
                            ) : null}

                            {!song.explanation && (
                              <button
                                type="button"
                                onClick={() => setSongForExplanation(song)}
                                className="text-xs font-semibold text-mood-cobalt hover:underline flex items-center gap-1"
                              >
                                <Sparkles className="w-3.5 h-3.5" /> Why this song?
                              </button>
                            )}
                          </div>

                          <button 
                            type="button"
                            onClick={(e) => toggleFavorite && toggleFavorite(song, e)}
                            className="p-1.5 rounded-full hover:bg-mood-black/5 text-mood-black/30 hover:text-mood-mustard transition-colors shrink-0"
                            title={isFav ? "Remove from Favorites" : "Add to Favorites"}
                          >
                            <Heart className={`w-4 h-4 ${isFav ? 'fill-mood-mustard text-mood-mustard' : ''}`} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>
        )}

        {/* Why this song modal */}
        <WhyThisSongModal 
          song={songForExplanation}
          isOpen={Boolean(songForExplanation)}
          onClose={() => setSongForExplanation(null)}
          onPlay={(s) => {
            if (setQueue) setQueue(aiSongs);
            if (setCurrentSong) setCurrentSong(s);
          }}
        />

      </div>
    </div>
  );
};

export default MoodStudio;
