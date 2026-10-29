import React, { useState, useEffect } from 'react';
import { 
  Shield, Camera, Trash2, RotateCcw, AlertTriangle, CheckCircle2, 
  Lock, EyeOff, Server, HardDrive, RefreshCw, Sliders, ChevronRight, Info
} from 'lucide-react';
import * as api from '../services/api';

const PrivacySettings = ({ user, setCurrentView }) => {
  const [dataStats, setDataStats] = useState({
    moodCount: 0,
    historyCount: 0,
    inferredCount: 0
  });
  const [loading, setLoading] = useState(true);
  const [clearingMoods, setClearingMoods] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [resettingTaste, setResettingTaste] = useState(false);
  const [statusMessage, setStatusMessage] = useState({ type: '', text: '' });
  const [cameraActive, setCameraActive] = useState(false);

  // Check if camera stream is currently active in browser
  useEffect(() => {
    const checkCamera = () => {
      // Check if any video element is currently playing stream
      const videos = document.querySelectorAll('video');
      let active = false;
      videos.forEach(v => {
        if (v.srcObject && v.srcObject.active) active = true;
      });
      setCameraActive(active);
    };

    checkCamera();
    const interval = setInterval(checkCamera, 2000);
    return () => clearInterval(interval);
  }, []);

  // Fetch counts of user-isolated data
  const fetchDataStats = async () => {
    try {
      setLoading(true);
      const [moods, history, taste] = await Promise.all([
        api.getMoods().catch(() => []),
        api.getHistory().catch(() => []),
        api.getTasteProfile().catch(() => null)
      ]);

      const inferredGenres = taste?.inferred?.frequentlyLikedGenres?.length || 0;
      const inferredArtists = taste?.inferred?.frequentlyLikedArtists?.length || 0;

      setDataStats({
        moodCount: Array.isArray(moods) ? moods.length : 0,
        historyCount: Array.isArray(history) ? history.length : 0,
        inferredCount: inferredGenres + inferredArtists
      });
    } catch (err) {
      console.warn('Error fetching data stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchDataStats();
    }
  }, [user]);

  // Instant camera termination action
  const handleStopCamera = () => {
    try {
      const videos = document.querySelectorAll('video');
      videos.forEach(v => {
        if (v.srcObject && v.srcObject.getTracks) {
          v.srcObject.getTracks().forEach(track => track.stop());
          v.srcObject = null;
        }
      });
      setCameraActive(false);
      setStatusMessage({ type: 'success', text: 'Camera hardware stopped immediately. Video stream released.' });
      setTimeout(() => setStatusMessage({ type: '', text: '' }), 4000);
    } catch (err) {
      console.error('Failed to stop camera stream:', err);
    }
  };

  // Clear mood history
  const handleClearMoods = async () => {
    if (!window.confirm('Are you sure you want to delete all your recorded moods and journal reflections? This cannot be undone.')) {
      return;
    }
    setClearingMoods(true);
    try {
      await api.clearMoodHistory();
      setStatusMessage({ type: 'success', text: 'All mood logs and journal reflections cleared successfully.' });
      await fetchDataStats();
      setTimeout(() => setStatusMessage({ type: '', text: '' }), 4000);
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Failed to clear mood history. Please try again.' });
    } finally {
      setClearingMoods(false);
    }
  };

  // Clear listening history
  const handleClearHistory = async () => {
    if (!window.confirm('Are you sure you want to clear your entire listening history? This will remove all played track records.')) {
      return;
    }
    setClearingHistory(true);
    try {
      await api.clearHistory();
      setStatusMessage({ type: 'success', text: 'Listening history cleared successfully.' });
      await fetchDataStats();
      setTimeout(() => setStatusMessage({ type: '', text: '' }), 4000);
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Failed to clear listening history. Please try again.' });
    } finally {
      setClearingHistory(false);
    }
  };

  // Reset inferred taste profile
  const handleResetTaste = async () => {
    if (!window.confirm('Reset all inferred music tastes? Your explicit favorite genres and artists will be preserved.')) {
      return;
    }
    setResettingTaste(true);
    try {
      await api.resetInferredTaste();
      setStatusMessage({ type: 'success', text: 'Inferred taste preferences reset successfully.' });
      await fetchDataStats();
      setTimeout(() => setStatusMessage({ type: '', text: '' }), 4000);
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Failed to reset taste profile. Please try again.' });
    } finally {
      setResettingTaste(false);
    }
  };

  return (
    <div className="pb-32">
      <div className="max-w-5xl mx-auto px-6 md:px-8 py-8 space-y-10">

        {/* Page Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-mood-black/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-mood-forest text-mood-lime flex items-center justify-center shadow-xs">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-3xl font-black tracking-tight text-mood-forest">Privacy & Data Controls</h2>
              <p className="text-sm text-mood-black/60 font-medium">
                Manage your camera privacy, review stored listening logs, and delete your personal data anytime.
              </p>
            </div>
          </div>
          <button
            onClick={fetchDataStats}
            disabled={loading}
            className="flex items-center gap-2 bg-mood-black/5 hover:bg-mood-black/10 text-mood-forest px-4 py-2 rounded-xl text-xs font-bold transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Data Status
          </button>
        </header>

        {statusMessage.text && (
          <div className={`p-4 rounded-2xl border text-sm font-semibold flex items-center gap-2 animate-in fade-in ${
            statusMessage.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}>
            {statusMessage.type === 'error' ? <AlertTriangle className="w-4 h-4 text-rose-600" /> : <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
            {statusMessage.text}
          </div>
        )}

        {/* 1. Camera Privacy & Biometric Controls (Feature 7) */}
        <section className="bg-white rounded-3xl p-6 md:p-8 border border-mood-black/5 shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-mood-black/5 pb-4">
            <div className="flex items-center gap-2.5">
              <Camera className="w-5 h-5 text-mood-cobalt" />
              <h3 className="text-lg font-bold text-mood-forest">Camera Privacy & Real-Time Security</h3>
            </div>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
              cameraActive
                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
            }`}>
              <span className={`w-2 h-2 rounded-full ${cameraActive ? 'bg-amber-600 animate-ping' : 'bg-emerald-600'}`}></span>
              {cameraActive ? 'Camera Live In Browser' : 'Camera Inactive / Secured'}
            </span>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Architecture guarantee */}
            <div className="bg-mood-black/[0.02] p-5 rounded-2xl border border-mood-black/5 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-mood-forest uppercase tracking-wider">
                <Lock className="w-4 h-4 text-emerald-600" />
                Zero Persistent Biometric Storage
              </div>
              <p className="text-xs text-mood-black/70 leading-relaxed font-medium">
                Moodify AI performs facial expression detection strictly in-memory. MediaPipe computes landmarks in your browser RAM, and ephemeral cropped frames are processed synchronously by our local ML service. 
              </p>
              <div className="flex items-center gap-2 text-[11px] font-bold text-emerald-800 bg-emerald-50 px-3 py-2 rounded-xl border border-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>No video frames, face photographs, or biometric hashes are ever written to disk or sent to cloud servers.</span>
              </div>
            </div>

            {/* Quick Privacy Actions */}
            <div className="bg-mood-black/[0.02] p-5 rounded-2xl border border-mood-black/5 space-y-4">
              <span className="text-xs font-bold text-mood-forest uppercase tracking-wider block">
                Instant Hardware & Mood Controls
              </span>

              <div className="space-y-3">
                <button
                  onClick={handleStopCamera}
                  className="w-full flex items-center justify-between p-3 bg-white hover:bg-rose-50 border border-mood-black/10 hover:border-rose-300 text-mood-forest hover:text-rose-700 rounded-xl text-xs font-bold transition-all shadow-xs"
                >
                  <span className="flex items-center gap-2">
                    <EyeOff className="w-4 h-4 text-rose-500" />
                    Instant Stop Camera Stream
                  </span>
                  <span className="text-[10px] bg-mood-black/5 px-2 py-0.5 rounded">Force Release Hardware</span>
                </button>

                <button
                  onClick={() => setCurrentView && setCurrentView('mood-studio')}
                  className="w-full flex items-center justify-between p-3 bg-white hover:bg-mood-cobalt/5 border border-mood-black/10 hover:border-mood-cobalt/30 text-mood-forest hover:text-mood-cobalt rounded-xl text-xs font-bold transition-all shadow-xs"
                >
                  <span className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-mood-cobalt" />
                    Use Manual Mood Picker
                  </span>
                  <span className="text-[10px] bg-mood-black/5 px-2 py-0.5 rounded flex items-center gap-1">
                    No Camera Required <ChevronRight className="w-3 h-3" />
                  </span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* 2. User Data Review & Right to Be Forgotten (Feature 7) */}
        <section className="bg-white rounded-3xl p-6 md:p-8 border border-mood-black/5 shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-mood-black/5 pb-4">
            <div className="flex items-center gap-2.5">
              <HardDrive className="w-5 h-5 text-mood-cobalt" />
              <h3 className="text-lg font-bold text-mood-forest">Data Review & Deletion (Right to Be Forgotten)</h3>
            </div>
            <span className="text-xs font-semibold text-mood-black/50">Strict User Isolation</span>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-mood-black/[0.02] border border-mood-black/5 space-y-1">
              <span className="text-[11px] font-bold text-mood-black/50 uppercase">Recorded Mood Logs</span>
              <p className="text-2xl font-black text-mood-forest">{dataStats.moodCount}</p>
              <p className="text-[11px] text-mood-black/40">Includes reflections & detections</p>
            </div>

            <div className="p-4 rounded-2xl bg-mood-black/[0.02] border border-mood-black/5 space-y-1">
              <span className="text-[11px] font-bold text-mood-black/50 uppercase">Listening History Entries</span>
              <p className="text-2xl font-black text-mood-cobalt">{dataStats.historyCount}</p>
              <p className="text-[11px] text-mood-black/40">Tracks played & logged</p>
            </div>

            <div className="p-4 rounded-2xl bg-mood-black/[0.02] border border-mood-black/5 space-y-1">
              <span className="text-[11px] font-bold text-mood-black/50 uppercase">Inferred Taste Signals</span>
              <p className="text-2xl font-black text-purple-700">{dataStats.inferredCount}</p>
              <p className="text-[11px] text-mood-black/40">Implicit genres & artists learned</p>
            </div>
          </div>

          <div className="space-y-4 pt-2">
            <h4 className="text-xs font-bold text-mood-forest uppercase tracking-wider">Data Removal Actions</h4>

            <div className="grid md:grid-cols-3 gap-4">
              {/* Clear Mood Logs */}
              <div className="p-4 rounded-2xl border border-mood-black/10 bg-white space-y-3 flex flex-col justify-between">
                <div>
                  <h5 className="font-bold text-sm text-mood-forest">Clear Mood History</h5>
                  <p className="text-xs text-mood-black/60 mt-1">
                    Deletes all recorded moods, emotion confidence logs, and written journal reflections.
                  </p>
                </div>
                <button
                  onClick={handleClearMoods}
                  disabled={clearingMoods || dataStats.moodCount === 0}
                  className="flex items-center justify-center gap-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {clearingMoods ? 'Clearing...' : 'Delete Mood History'}
                </button>
              </div>

              {/* Clear Listening History */}
              <div className="p-4 rounded-2xl border border-mood-black/10 bg-white space-y-3 flex flex-col justify-between">
                <div>
                  <h5 className="font-bold text-sm text-mood-forest">Clear Listening History</h5>
                  <p className="text-xs text-mood-black/60 mt-1">
                    Deletes all history logs of songs played, completion records, and recap listening data.
                  </p>
                </div>
                <button
                  onClick={handleClearHistory}
                  disabled={clearingHistory || dataStats.historyCount === 0}
                  className="flex items-center justify-center gap-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {clearingHistory ? 'Clearing...' : 'Delete Listening History'}
                </button>
              </div>

              {/* Reset Inferred Taste */}
              <div className="p-4 rounded-2xl border border-mood-black/10 bg-white space-y-3 flex flex-col justify-between">
                <div>
                  <h5 className="font-bold text-sm text-mood-forest">Reset Inferred Taste</h5>
                  <p className="text-xs text-mood-black/60 mt-1">
                    Erases automatic behavior-based genre and artist inferences without removing manual preferences.
                  </p>
                </div>
                <button
                  onClick={handleResetTaste}
                  disabled={resettingTaste || dataStats.inferredCount === 0}
                  className="flex items-center justify-center gap-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {resettingTaste ? 'Resetting...' : 'Reset Inferred Taste'}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* 3. Transparent Privacy Policy & Data Architecture Section (Feature 7) */}
        <section className="bg-mood-black/[0.02] rounded-3xl p-6 md:p-8 border border-mood-black/10 space-y-4">
          <div className="flex items-center gap-2.5">
            <Info className="w-5 h-5 text-mood-forest" />
            <h3 className="text-base font-bold text-mood-forest">Moodify AI Transparent Privacy Policy & Architecture</h3>
          </div>

          <div className="grid md:grid-cols-2 gap-4 text-xs text-mood-black/70 leading-relaxed font-medium">
            <div className="space-y-2 bg-white p-4 rounded-2xl border border-mood-black/5">
              <h4 className="font-bold text-mood-forest">What Data We Persist</h4>
              <ul className="space-y-1 list-disc list-inside">
                <li>Your account credentials (bcrypt salted password hash).</li>
                <li>Your explicitly chosen playlists, favorites, and custom taste genres.</li>
                <li>Self-reported or confirmed mood log timestamps and notes.</li>
                <li>Playback listening history strictly scoped to your private user ID.</li>
              </ul>
            </div>

            <div className="space-y-2 bg-white p-4 rounded-2xl border border-mood-black/5">
              <h4 className="font-bold text-mood-forest">What We NEVER Collect or Store</h4>
              <ul className="space-y-1 list-disc list-inside">
                <li>Never persist camera video recordings or photographic files.</li>
                <li>Never construct biometric recognition databases or identify individuals.</li>
                <li>Never transmit facial data to external advertisers or third parties.</li>
                <li>Never sell your listening history or emotional reflection logs.</li>
              </ul>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
};

export default PrivacySettings;
