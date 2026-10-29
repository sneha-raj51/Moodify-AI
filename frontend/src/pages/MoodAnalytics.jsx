import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart2, Heart, Clock, AlertCircle, Info, Play, Music, 
  Calendar, BookOpen, PlusCircle, Trash2, ThumbsUp, ThumbsDown, 
  Sparkles, CheckCircle2, RefreshCw, X, Tag
} from 'lucide-react';
import SongCover from '../components/SongCover';
import * as api from '../services/api';

const MOOD_OPTIONS = ['Happy', 'Calm', 'Energetic', 'Sad', 'Focused', 'Relaxed', 'Romantic', 'Melancholic'];

const MoodAnalytics = ({ songs = [], favorites = new Set(), moodHistory = [], listeningHistory = [], setCurrentSong, setQueue }) => {
  const [selectedRange, setSelectedRange] = useState('7d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [activeTab, setActiveTab] = useState('insights'); // 'insights' or 'journal'
  const [journalData, setJournalData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);
  const [modalError, setModalError] = useState('');
  const [newMood, setNewMood] = useState('Calm');
  const [newNote, setNewNote] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [standaloneReflections, setStandaloneReflections] = useState([]);

  // Fetch all persistent mood reflections from MongoDB
  const fetchAllReflections = async () => {
    try {
      const moods = await api.getMoods();
      if (Array.isArray(moods)) {
        setStandaloneReflections(moods.map(m => ({
          id: m._id || m.id,
          _id: m._id || m.id,
          mood: m.mood,
          note: m.note || '',
          source: m.source || 'manual',
          createdAt: m.createdAt,
          correlatedTracks: []
        })));
      }
    } catch (err) {
      console.warn('Could not load standalone mood history:', err);
    }
  };

  useEffect(() => {
    fetchAllReflections();
  }, []);

  // Fetch server-aggregated mood journal & insights
  const fetchJournal = async (range, from = '', to = '') => {
    setLoading(true);
    try {
      const data = await api.getMoodJournal({ range, from, to });
      if (data) {
        setJournalData(data);
      }
    } catch (err) {
      console.warn('Failed to fetch journal data, using local state:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedRange === 'custom') {
      if (customFrom && customTo) {
        fetchJournal('custom', customFrom, customTo);
      }
    } else {
      fetchJournal(selectedRange);
    }
  }, [selectedRange, customFrom, customTo]);

  const handleCreateEntry = async (e) => {
    e.preventDefault();
    if (submittingNote) return;

    if (!newMood || !MOOD_OPTIONS.includes(newMood)) {
      setModalError('Please select a mood from the options.');
      return;
    }

    const trimmed = typeof newNote === 'string' ? newNote.trim() : '';
    if (trimmed.length > 500) {
      setModalError('Reflection note cannot exceed 500 characters.');
      return;
    }

    setSubmittingNote(true);
    setModalError('');

    try {
      const savedRecord = await api.addMoodJournalEntry({
        mood: newMood,
        note: trimmed,
        source: 'journal-entry'
      });

      const createdTimelineItem = {
        id: savedRecord?._id || `temp-${Date.now()}`,
        _id: savedRecord?._id || `temp-${Date.now()}`,
        mood: savedRecord?.mood || newMood,
        note: savedRecord?.note !== undefined ? savedRecord.note : trimmed,
        source: savedRecord?.source || 'journal-entry',
        createdAt: savedRecord?.createdAt || new Date().toISOString(),
        correlatedTracks: []
      };

      // Optimistically update journal data
      setJournalData(prev => {
        const existingTimeline = prev?.journalTimeline || [];
        return {
          ...prev,
          hasData: true,
          totalMoodEntries: (prev?.totalMoodEntries || 0) + 1,
          journalTimeline: [createdTimelineItem, ...existingTimeline.filter(item => (item.id || item._id) !== createdTimelineItem.id)]
        };
      });

      // Also update standalone persistent reflections
      setStandaloneReflections(prev => [createdTimelineItem, ...prev.filter(item => (item.id || item._id) !== createdTimelineItem.id)]);

      setStatusMessage('Mood reflection saved successfully to your journal.');
      setShowLogModal(false);
      setNewNote('');

      // Refresh in background
      await fetchJournal(selectedRange);
      setTimeout(() => setStatusMessage(''), 4000);
    } catch (err) {
      console.error('Error logging mood reflection:', err);
      setModalError(err.message || 'Could not save mood reflection. Please try again.');
    } finally {
      setSubmittingNote(false);
    }
  };

  const handleDeleteEntry = async (id) => {
    if (!window.confirm('Are you sure you want to delete this journal entry?')) return;
    try {
      // Optimistically remove entry
      setJournalData(prev => prev ? {
        ...prev,
        journalTimeline: (prev.journalTimeline || []).filter(item => (item.id || item._id) !== id)
      } : prev);
      setStandaloneReflections(prev => prev.filter(item => (item.id || item._id) !== id));

      await api.deleteMoodEntry(id);
      await fetchJournal(selectedRange);
    } catch (err) {
      console.error('Failed to delete mood entry:', err);
      setStatusMessage('Failed to delete reflection entry. Please try again.');
      setTimeout(() => setStatusMessage(''), 3000);
    }
  };

  const handlePlaySong = (song) => {
    if (!setCurrentSong) return;
    const songObj = {
      id: song.songId || song.id || song._id,
      _id: song.songId || song.id || song._id,
      title: song.title,
      artist: song.artist,
      cover: song.cover || song.albumArt,
      genre: song.genre,
      mood: song.mood,
      audioUrl: song.audioUrl,
      isPlayable: Boolean(song.audioUrl || song.isPlayable)
    };
    setCurrentSong(songObj);
    if (setQueue) {
      setQueue([songObj]);
    }
  };

  // Helper formatting for durations
  const formatDuration = (seconds = 0) => {
    if (seconds < 60) return `${Math.floor(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const hrs = Math.floor(mins / 60);
    if (hrs > 0) return `${hrs}h ${mins % 60}m`;
    return `${mins}m`;
  };

  const formatDateTime = (timestamp) => {
    if (!timestamp) return { date: 'Recently', time: '' };
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return { date: 'Recently', time: '' };
    return {
      date: d.toLocaleDateString(undefined, { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      }),
      time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
  };

  const getMoodBadgeStyle = (mood) => {
    const clean = String(mood || '').toLowerCase();
    switch (clean) {
      case 'happy':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      case 'sad':
      case 'melancholic':
        return 'bg-blue-50 text-blue-800 border-blue-200';
      case 'calm':
      case 'relaxed':
        return 'bg-teal-50 text-teal-800 border-teal-200';
      case 'energetic':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'focused':
        return 'bg-purple-50 text-purple-800 border-purple-200';
      case 'romantic':
        return 'bg-rose-50 text-rose-800 border-rose-200';
      default:
        return 'bg-mood-forest/5 text-mood-forest border-mood-forest/20';
    }
  };

  // Safe fallback metrics if journalData not loaded
  const topMoods = journalData?.topMoods || [];
  const mostFrequentMood = journalData?.mostFrequentMood || (topMoods[0]?.mood || 'Not enough data');
  const listeningMetrics = journalData?.listeningMetrics || {
    totalListens: listeningHistory.length,
    totalDurationSeconds: 0,
    completionRate: 0,
    skipRate: 0,
    feedback: { likes: 0, dislikes: 0, skips: 0, completes: 0 }
  };
  const genreCorrelations = journalData?.genreMoodCorrelations || {};
  const topArtistsByMood = journalData?.topArtistsByMood || {};
  const journalTimeline = journalData?.journalTimeline || [];

  // Unified persistent reflections sorted descending by date
  const allReflections = useMemo(() => {
    const map = new Map();
    journalTimeline.forEach(item => {
      const idKey = String(item.id || item._id);
      map.set(idKey, item);
    });
    standaloneReflections.forEach(item => {
      const idKey = String(item.id || item._id);
      if (!map.has(idKey)) {
        map.set(idKey, item);
      }
    });
    (moodHistory || []).forEach(m => {
      const idKey = String(m._id || m.id || `${m.mood}-${m.createdAt}`);
      if (!map.has(idKey)) {
        map.set(idKey, {
          id: idKey,
          _id: idKey,
          mood: m.mood,
          note: m.note || '',
          source: m.source || 'manual',
          createdAt: m.createdAt || m.timestamp || new Date().toISOString(),
          correlatedTracks: []
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [journalTimeline, standaloneReflections, moodHistory]);

  const hasData = Boolean(journalData?.hasData || allReflections.length > 0 || listeningHistory.length > 0);

  return (
    <div className="pb-32">
      <div className="max-w-6xl mx-auto px-6 md:px-8 py-8 space-y-8">
        
        {/* Header with Range Selector & Log Action */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-mood-black/10">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-mood-forest text-mood-lime flex items-center justify-center shadow-xs">
                <BarChart2 className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-3xl font-black tracking-tight text-mood-forest">Mood Journal & Music Insights</h2>
                <p className="text-sm text-mood-black/60 font-medium">Track your emotional state, listening correlations, and music habits</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Time Range Pills */}
            <div className="bg-mood-black/5 p-1 rounded-2xl flex flex-wrap items-center border border-mood-black/5 gap-1">
              {[
                { label: '7 Days (Weekly)', value: '7d' },
                { label: '30 Days (Monthly)', value: '30d' },
                { label: 'All Time', value: 'all' },
                { label: 'Custom', value: 'custom' }
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setSelectedRange(opt.value)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    selectedRange === opt.value
                      ? 'bg-mood-forest text-mood-offwhite shadow-xs'
                      : 'text-mood-black/70 hover:text-mood-forest'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {selectedRange === 'custom' && (
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-2xl border border-mood-black/10 text-xs shadow-xs">
                <input 
                  type="date"
                  value={customFrom}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="bg-transparent text-mood-forest font-semibold outline-hidden"
                />
                <span className="text-mood-black/40 font-bold">to</span>
                <input 
                  type="date"
                  value={customTo}
                  onChange={e => setCustomTo(e.target.value)}
                  className="bg-transparent text-mood-forest font-semibold outline-hidden"
                />
              </div>
            )}

            {/* Quick Log Mood Button */}
            <button
              onClick={() => setShowLogModal(true)}
              className="flex items-center gap-2 bg-mood-cobalt text-white px-4 py-2 rounded-2xl text-xs font-bold hover:bg-mood-cobalt/90 transition-all shadow-xs"
            >
              <PlusCircle className="w-4 h-4" />
              Log Reflection
            </button>
          </div>
        </header>

        {statusMessage && (
          <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-4 py-3 rounded-2xl text-sm font-semibold flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            {statusMessage}
          </div>
        )}

        {/* View Tabs: Insights vs Journal */}
        <div className="flex items-center gap-3 border-b border-mood-black/5 pb-2">
          <button
            onClick={() => setActiveTab('insights')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'insights'
                ? 'bg-mood-forest/10 text-mood-forest'
                : 'text-mood-black/60 hover:text-mood-forest'
            }`}
          >
            <BarChart2 className="w-4 h-4" />
            Music Insights & Patterns
          </button>
          <button
            onClick={() => setActiveTab('journal')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'journal'
                ? 'bg-mood-forest/10 text-mood-forest'
                : 'text-mood-black/60 hover:text-mood-forest'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Mood Reflection Journal ({allReflections.length})
          </button>
        </div>

        {/* ===================== TAB 1: MUSIC INSIGHTS ===================== */}
        {activeTab === 'insights' && (
          <div className="space-y-8">
            {/* Top Insight KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-3xl border border-mood-black/5 shadow-xs space-y-1">
                <span className="text-[11px] font-bold text-mood-black/50 uppercase tracking-wider">Top Mood</span>
                <p className="text-2xl font-black text-mood-forest">{mostFrequentMood}</p>
                <p className="text-xs text-mood-black/50 font-medium">
                  {topMoods[0] ? `${topMoods[0].percentage}% of logs` : 'Record moods to analyze'}
                </p>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-mood-black/5 shadow-xs space-y-1">
                <span className="text-[11px] font-bold text-mood-black/50 uppercase tracking-wider">Listening Time</span>
                <p className="text-2xl font-black text-mood-cobalt">{formatDuration(listeningMetrics.totalDurationSeconds)}</p>
                <p className="text-xs text-mood-black/50 font-medium">{listeningMetrics.totalListens} total plays recorded</p>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-mood-black/5 shadow-xs space-y-1">
                <span className="text-[11px] font-bold text-mood-black/50 uppercase tracking-wider">Completion Rate</span>
                <p className="text-2xl font-black text-mood-lime mix-blend-multiply">{listeningMetrics.completionRate}%</p>
                <p className="text-xs text-mood-black/50 font-medium">{listeningMetrics.completedCount} full track listens</p>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-mood-black/5 shadow-xs space-y-1">
                <span className="text-[11px] font-bold text-mood-black/50 uppercase tracking-wider">Feedback & Favs</span>
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-black text-mood-mustard mix-blend-multiply">{listeningMetrics.feedback?.likes || 0}</p>
                  <span className="text-xs text-mood-black/50">likes / {listeningMetrics.feedback?.favorites || 0} favs</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-mood-black/60 pt-0.5 font-semibold">
                  <span className="flex items-center gap-1 text-emerald-600">
                    <ThumbsUp className="w-3 h-3" /> {listeningMetrics.feedback?.likes || 0}
                  </span>
                  <span className="flex items-center gap-1 text-rose-500">
                    <ThumbsDown className="w-3 h-3" /> {listeningMetrics.feedback?.dislikes || 0}
                  </span>
                  <span className="text-[10px] text-mood-black/40">
                    {listeningMetrics.feedback?.skips || 0} skips
                  </span>
                </div>
              </div>
            </div>

            {/* Recent Mood Reflections Section */}
            <section className="bg-white rounded-3xl p-6 md:p-8 border border-mood-black/5 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-mood-black/5 pb-4">
                <div className="flex items-center gap-2.5">
                  <BookOpen className="w-5 h-5 text-mood-cobalt" />
                  <div>
                    <h3 className="text-lg font-bold text-mood-forest">Recent Reflections</h3>
                    <p className="text-xs text-mood-black/60 font-medium">Your saved mood notes and reflections</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => {
                      setModalError('');
                      setShowLogModal(true);
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-mood-cobalt text-white rounded-xl text-xs font-bold hover:bg-mood-cobalt/90 transition-all shadow-xs"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    Log Reflection
                  </button>
                  {allReflections.length > 0 && (
                    <button
                      onClick={() => setActiveTab('journal')}
                      className="text-xs font-bold text-mood-forest hover:text-mood-cobalt transition-colors px-2 py-1"
                    >
                      View Full Journal ({allReflections.length}) →
                    </button>
                  )}
                </div>
              </div>

              {allReflections.length > 0 ? (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {allReflections.slice(0, 6).map((entry) => {
                    const { date, time } = formatDateTime(entry.createdAt);
                    return (
                      <div
                        key={entry.id || entry._id}
                        className="p-4 rounded-2xl bg-mood-black/[0.02] border border-mood-black/5 hover:border-mood-cobalt/20 transition-all space-y-3 flex flex-col justify-between"
                      >
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`px-2.5 py-1 rounded-lg text-xs font-black border ${getMoodBadgeStyle(entry.mood)}`}>
                              {entry.mood}
                            </span>
                            <button
                              onClick={() => handleDeleteEntry(entry.id || entry._id)}
                              title="Delete entry"
                              className="p-1 text-mood-black/30 hover:text-rose-600 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {entry.note ? (
                            <p className="text-xs text-mood-black/80 font-medium italic line-clamp-3 leading-relaxed bg-white/60 p-2.5 rounded-xl border border-mood-black/5">
                              "{entry.note}"
                            </p>
                          ) : (
                            <p className="text-xs text-mood-black/40 italic">No written note provided.</p>
                          )}
                        </div>

                        <div className="pt-2 border-t border-mood-black/5 flex items-center justify-between text-[11px] text-mood-black/50 font-medium">
                          <span>{date}</span>
                          <span>{time}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center space-y-2">
                  <BookOpen className="w-8 h-8 text-mood-black/20" />
                  <p className="text-xs font-bold text-mood-forest">No mood reflections recorded yet</p>
                  <p className="text-[11px] text-mood-black/50 max-w-sm">
                    Record your mood and an optional reflection note to start tracking your thoughts alongside your music.
                  </p>
                  <button
                    onClick={() => {
                      setModalError('');
                      setShowLogModal(true);
                    }}
                    className="mt-2 px-4 py-2 bg-mood-forest text-mood-offwhite text-xs font-bold rounded-xl hover:bg-mood-forest/90 transition-all shadow-xs"
                  >
                    Record Your First Reflection
                  </button>
                </div>
              )}
            </section>

            {/* Middle Section: Mood Distribution & Mood-to-Genre Correlations */}
            <div className="grid md:grid-cols-2 gap-8">
              {/* Mood Distribution */}
              <section className="bg-white rounded-3xl p-6 md:p-8 border border-mood-black/5 shadow-xs space-y-6">
                <div className="flex items-center justify-between border-b border-mood-black/5 pb-4">
                  <h3 className="text-lg font-bold text-mood-forest">Mood Selection Distribution</h3>
                  <span className="text-xs font-semibold text-mood-black/50">{topMoods.length} moods recorded</span>
                </div>

                {topMoods.length > 0 ? (
                  <div className="space-y-4">
                    {topMoods.map(({ mood, count, percentage }) => (
                      <div key={mood} className="space-y-1.5">
                        <div className="flex justify-between text-xs font-bold text-mood-forest">
                          <span>{mood}</span>
                          <span>{count} logs ({percentage}%)</span>
                        </div>
                        <div className="w-full h-3 bg-mood-black/5 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-mood-cobalt rounded-full transition-all duration-700"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Clock className="w-10 h-10 text-mood-black/20 mb-3" />
                    <p className="text-mood-black/60 font-bold text-sm">No mood logs in this range</p>
                    <p className="text-xs text-mood-black/40 mt-1 max-w-xs">
                      Log your mood or scan your face in Mood Studio to see your emotional distribution.
                    </p>
                    <button
                      onClick={() => setShowLogModal(true)}
                      className="mt-4 px-4 py-2 bg-mood-forest text-mood-offwhite text-xs font-bold rounded-xl"
                    >
                      Record Your Mood
                    </button>
                  </div>
                )}
              </section>

              {/* Mood-to-Genre Correlations */}
              <section className="bg-white rounded-3xl p-6 md:p-8 border border-mood-black/5 shadow-xs space-y-6">
                <div className="flex items-center justify-between border-b border-mood-black/5 pb-4">
                  <h3 className="text-lg font-bold text-mood-forest">Mood-to-Genre Correlations</h3>
                  <span className="text-xs font-semibold text-mood-cobalt">Auditory Patterns</span>
                </div>

                {Object.keys(genreCorrelations).length > 0 ? (
                  <div className="space-y-5">
                    {Object.entries(genreCorrelations).map(([mood, genres]) => (
                      <div key={mood} className="bg-mood-black/[0.02] p-4 rounded-2xl border border-mood-black/5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-mood-forest uppercase tracking-wider">When feeling {mood}:</span>
                          <span className="text-[10px] font-semibold text-mood-black/40">Preferred Genres</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {genres.map(({ genre, count, percentage }) => (
                            <span 
                              key={genre}
                              className="inline-flex items-center gap-1.5 px-3 py-1 bg-mood-forest text-mood-offwhite rounded-xl text-xs font-semibold"
                            >
                              <span>{genre}</span>
                              <span className="text-[10px] opacity-70">({percentage}%)</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Music className="w-10 h-10 text-mood-black/20 mb-3" />
                    <p className="text-mood-black/60 font-bold text-sm">No correlations mapped yet</p>
                    <p className="text-xs text-mood-black/40 mt-1 max-w-xs">
                      As you stream music while experiencing different moods, Moodify AI links your musical tastes to your emotional patterns.
                    </p>
                  </div>
                )}
              </section>
            </div>

            {/* Top Artists Per Mood */}
            {Object.keys(topArtistsByMood).length > 0 && (
              <section className="bg-white rounded-3xl p-6 md:p-8 border border-mood-black/5 shadow-xs space-y-6">
                <h3 className="text-lg font-bold text-mood-forest border-b border-mood-black/5 pb-4">
                  Go-To Artists By Mood
                </h3>
                <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {Object.entries(topArtistsByMood).map(([mood, artists]) => (
                    <div key={mood} className="bg-mood-black/[0.02] p-4 rounded-2xl border border-mood-black/5 space-y-2">
                      <p className="text-xs font-bold text-mood-forest uppercase tracking-wider">Mood: {mood}</p>
                      <ul className="space-y-1.5">
                        {artists.slice(0, 3).map(({ artist, count }) => (
                          <li key={artist} className="flex justify-between items-center text-xs font-semibold text-mood-black/80">
                            <span className="truncate pr-2">{artist}</span>
                            <span className="text-[10px] text-mood-black/40">{count} plays</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {/* Weekly & Monthly Detailed Summaries */}
            <div className="grid md:grid-cols-2 gap-8">
              {/* Weekly Summary Card */}
              {journalData?.weeklySummary && (
                <section className="bg-white rounded-3xl p-6 md:p-8 border border-mood-black/5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-mood-black/5 pb-3">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-mood-cobalt">Weekly Insights</span>
                      <h3 className="text-base font-bold text-mood-forest">Weekly Summary ({journalData.weeklySummary.periodLabel})</h3>
                    </div>
                    <span className="text-xs font-semibold px-2.5 py-1 bg-mood-forest/5 text-mood-forest rounded-xl">
                      {journalData.weeklySummary.entriesCount} reflections
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-mood-black/[0.02] p-3 rounded-2xl border border-mood-black/5">
                      <span className="text-[10px] text-mood-black/50 font-bold uppercase">Top Mood</span>
                      <p className="text-sm font-black text-mood-forest">{journalData.weeklySummary.mostFrequentMood || 'None'}</p>
                    </div>
                    <div className="bg-mood-black/[0.02] p-3 rounded-2xl border border-mood-black/5">
                      <span className="text-[10px] text-mood-black/50 font-bold uppercase">Tracks Liked</span>
                      <p className="text-sm font-black text-emerald-600">{journalData.weeklySummary.tracksLiked || 0}</p>
                    </div>
                    <div className="bg-mood-black/[0.02] p-3 rounded-2xl border border-mood-black/5">
                      <span className="text-[10px] text-mood-black/50 font-bold uppercase">Tracks Favorited</span>
                      <p className="text-sm font-black text-mood-cobalt">{journalData.weeklySummary.tracksFavorited || 0}</p>
                    </div>
                  </div>

                  {/* Daily Mood Progression across Week */}
                  {journalData.weeklySummary.moodChangesAcrossWeek?.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <span className="text-xs font-bold text-mood-forest/80">Daily Mood Progression:</span>
                      <div className="flex flex-wrap gap-2">
                        {journalData.weeklySummary.moodChangesAcrossWeek.map((day, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 px-2.5 py-1 bg-mood-forest/5 rounded-xl border border-mood-forest/10 text-xs">
                            <span className="text-[10px] font-bold text-mood-black/50">{day.date.slice(5)}:</span>
                            <span className="font-bold text-mood-forest">{day.dominantMood}</span>
                            <span className="text-[10px] text-mood-black/40">({day.entriesCount})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Listening Modes Used */}
                  {journalData.weeklySummary.listeningModesUsed?.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <span className="text-xs font-bold text-mood-forest/80">Listening Modes Used:</span>
                      <div className="flex flex-wrap gap-2">
                        {journalData.weeklySummary.listeningModesUsed.map(({ mode, count }) => (
                          <span key={mode} className="px-2.5 py-1 bg-mood-cobalt/10 text-mood-cobalt text-xs font-semibold rounded-xl capitalize">
                            {mode}: {count}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              )}

              {/* Monthly Summary Card */}
              {journalData?.monthlySummary && (
                <section className="bg-white rounded-3xl p-6 md:p-8 border border-mood-black/5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-mood-black/5 pb-3">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-mood-cobalt">Monthly Trends</span>
                      <h3 className="text-base font-bold text-mood-forest">Monthly Summary ({journalData.monthlySummary.periodLabel})</h3>
                    </div>
                    <span className="text-xs font-semibold px-2.5 py-1 bg-mood-forest/5 text-mood-forest rounded-xl">
                      {journalData.monthlySummary.totalEntries} entries
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <span className="text-xs font-bold text-mood-forest/80">Top Liked Genres This Month:</span>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {journalData.monthlySummary.frequentlyLikedGenres?.length > 0 ? (
                          journalData.monthlySummary.frequentlyLikedGenres.map(({ genre, count }) => (
                            <span key={genre} className="px-2.5 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold rounded-xl">
                              {genre} ({count})
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-mood-black/40 italic">Like tracks to track monthly preferences</span>
                        )}
                      </div>
                    </div>

                    <div>
                      <span className="text-xs font-bold text-mood-forest/80">Top Liked Artists This Month:</span>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {journalData.monthlySummary.frequentlyLikedArtists?.length > 0 ? (
                          journalData.monthlySummary.frequentlyLikedArtists.map(({ artist, count }) => (
                            <span key={artist} className="px-2.5 py-0.5 bg-purple-50 text-purple-800 border border-purple-200 text-xs font-semibold rounded-xl">
                              {artist} ({count})
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-mood-black/40 italic">Like tracks to track monthly artist favorites</span>
                        )}
                      </div>
                    </div>
                  </div>
                </section>
              )}
            </div>

            {/* Mood & Music Relationships Section */}
            {journalData?.moodAndMusicRelationships && (
              <section className="bg-white rounded-3xl p-6 md:p-8 border border-mood-black/5 shadow-xs space-y-6">
                <div className="flex items-center justify-between border-b border-mood-black/5 pb-4">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-mood-cobalt">Observed Correlations</span>
                    <h3 className="text-lg font-bold text-mood-forest">Mood & Music Relationships</h3>
                  </div>
                  {journalData.moodAndMusicRelationships.recommendationAcceptanceRate > 0 && (
                    <span className="text-xs font-semibold px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl">
                      {journalData.moodAndMusicRelationships.recommendationAcceptanceRate}% Recommendation Acceptance
                    </span>
                  )}
                </div>

                <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {journalData.moodAndMusicRelationships.moodFeedbackAssociations?.map(assoc => (
                    <div key={assoc.mood} className="bg-mood-black/[0.02] p-4 rounded-2xl border border-mood-black/5 space-y-1.5">
                      <span className="text-xs font-black text-mood-forest uppercase tracking-wider">When {assoc.mood}</span>
                      <div className="flex items-center gap-4 text-xs font-semibold pt-1">
                        <span className="text-emerald-700">{assoc.likesCount} likes</span>
                        <span className="text-rose-600">{assoc.skipsCount} skips</span>
                        <span className="text-mood-black/50">{assoc.listensCount} plays</span>
                      </div>
                      <p className="text-[11px] text-mood-black/50">Top genre: <span className="font-bold text-mood-black/80">{assoc.topGenre}</span></p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Scientific & Psychological Transparency Disclaimer */}
            <div className="bg-mood-black/[0.03] border border-mood-black/10 rounded-2xl p-4 flex items-start gap-3 text-xs text-mood-black/70">
              <Info className="w-5 h-5 text-mood-forest shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-mood-forest">Observation Note</p>
                <p className="mt-0.5 leading-relaxed">
                  {journalData?.disclaimer || 'Mood insights reflect observational connections between your personal reflections and listening patterns. They do not constitute clinical or psychological diagnoses.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ===================== TAB 2: MOOD REFLECTION JOURNAL ===================== */}
        {activeTab === 'journal' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-mood-forest">Your Mood Journal Timeline</h3>
                <p className="text-xs text-mood-black/60">Chronological history of mood logs and associated music listening sessions</p>
              </div>
              <button
                onClick={() => {
                  setModalError('');
                  setShowLogModal(true);
                }}
                className="flex items-center gap-2 bg-mood-forest text-mood-offwhite px-4 py-2 rounded-xl text-xs font-bold hover:bg-mood-forest/90 transition-all shadow-xs"
              >
                <PlusCircle className="w-4 h-4 text-mood-lime" />
                Write Entry
              </button>
            </div>

            {loading ? (
              <div className="bg-white rounded-3xl p-12 border border-mood-black/5 text-center flex flex-col items-center justify-center space-y-3">
                <div className="w-8 h-8 border-3 border-mood-cobalt/30 border-t-mood-cobalt rounded-full animate-spin" />
                <p className="text-sm font-bold text-mood-forest">Loading your Mood Journal entries...</p>
              </div>
            ) : allReflections.length > 0 ? (
              <div className="space-y-4">
                {allReflections.map((entry) => {
                  const { date, time } = formatDateTime(entry.createdAt);

                  return (
                    <div 
                      key={entry.id || entry._id}
                      className="bg-white rounded-3xl p-6 border border-mood-black/5 shadow-xs space-y-4 hover:border-mood-cobalt/20 transition-all"
                    >
                      {/* Top Bar: Mood tag, Source tag, Date, Delete */}
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className={`px-3 py-1 rounded-xl text-xs font-black border ${getMoodBadgeStyle(entry.mood)}`}>
                            {entry.mood}
                          </span>
                          <span className="text-[11px] font-semibold text-mood-black/50 bg-mood-black/5 px-2.5 py-1 rounded-lg">
                            {entry.source === 'journal-entry' ? 'Journal Entry' : entry.source === 'face-detected' ? 'Camera Scan' : 'Mood Log'}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-xs text-mood-black/50">
                          <span className="font-medium">{date} at {time}</span>
                          <button
                            onClick={() => handleDeleteEntry(entry.id || entry._id)}
                            title="Delete entry"
                            className="p-1 hover:text-rose-600 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Optional Note / Personal Reflection */}
                      {entry.note ? (
                        <p className="text-sm text-mood-black/80 font-medium italic bg-mood-black/[0.02] p-3 rounded-2xl border border-mood-black/5">
                          "{entry.note}"
                        </p>
                      ) : (
                        <p className="text-xs text-mood-black/40 italic">No personal note recorded.</p>
                      )}

                      {/* Correlated Tracks Listened During This Mood */}
                      {entry.correlatedTracks && entry.correlatedTracks.length > 0 ? (
                        <div className="space-y-2 pt-2 border-t border-mood-black/5">
                          <span className="text-[11px] font-bold text-mood-black/50 uppercase tracking-wider">
                            Correlated Listening ({entry.correlatedTracks.length})
                          </span>
                          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
                            {entry.correlatedTracks.map((trk, idx) => (
                              <div
                                key={`${trk.songId}-${idx}`}
                                onClick={() => handlePlaySong(trk)}
                                className="flex items-center gap-2.5 bg-mood-black/5 p-2 rounded-xl hover:bg-mood-cobalt/10 transition-colors cursor-pointer group"
                              >
                                <div className="relative w-9 h-9 rounded-lg overflow-hidden shrink-0">
                                  <SongCover 
                                    src={trk.cover} 
                                    title={trk.title} 
                                    artist={trk.artist}
                                    className="w-full h-full object-cover"
                                  />
                                  <div className="absolute inset-0 bg-mood-cobalt/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <Play className="w-3.5 h-3.5 text-white fill-current ml-0.5" />
                                  </div>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-bold text-mood-forest truncate group-hover:text-mood-cobalt">{trk.title}</p>
                                  <p className="text-[10px] text-mood-black/60 truncate">{trk.artist}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-[11px] text-mood-black/40 italic">No music was played within this 2-hour window.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-white rounded-3xl p-12 border border-mood-black/5 text-center flex flex-col items-center justify-center space-y-3">
                <BookOpen className="w-12 h-12 text-mood-black/20" />
                <h4 className="text-base font-bold text-mood-forest">Your Mood Journal is empty</h4>
                <p className="text-xs text-mood-black/50 max-w-sm">
                  Start noting down how you feel and reflect on your days. Moodify will link your reflections with the music you stream.
                </p>
                <button
                  onClick={() => {
                    setModalError('');
                    setShowLogModal(true);
                  }}
                  className="mt-2 px-5 py-2.5 bg-mood-cobalt text-white text-xs font-bold rounded-2xl shadow-xs hover:bg-mood-cobalt/90 transition-all"
                >
                  Write Your First Entry
                </button>
              </div>
            )}
          </div>
        )}

        {/* Modal: Write Mood Reflection Entry */}
        {showLogModal && (
          <div className="fixed inset-0 z-50 bg-mood-black/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl border border-mood-black/10 space-y-6 animate-in zoom-in-95">
              <div className="flex items-center justify-between border-b border-mood-black/5 pb-4">
                <div className="flex items-center gap-2.5">
                  <BookOpen className="w-5 h-5 text-mood-cobalt" />
                  <h3 className="text-lg font-bold text-mood-forest">Log Mood Reflection</h3>
                </div>
                <button 
                  onClick={() => {
                    if (!submittingNote) {
                      setModalError('');
                      setShowLogModal(false);
                    }
                  }}
                  disabled={submittingNote}
                  className="p-1 text-mood-black/40 hover:text-mood-black transition-colors disabled:opacity-40"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {modalError && (
                <div className="p-3 bg-rose-50 text-rose-800 border border-rose-200 rounded-xl text-xs font-semibold flex items-center gap-2 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <form onSubmit={handleCreateEntry} className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-mood-black/60 uppercase tracking-wider mb-2">
                    How are you feeling right now? <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {MOOD_OPTIONS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        disabled={submittingNote}
                        onClick={() => {
                          setNewMood(m);
                          if (modalError) setModalError('');
                        }}
                        className={`py-2 px-2 text-xs font-bold rounded-xl border transition-all ${
                          newMood === m
                            ? 'bg-mood-forest text-mood-offwhite border-mood-forest shadow-xs'
                            : 'bg-mood-black/5 text-mood-black/70 border-transparent hover:bg-mood-black/10'
                        } disabled:opacity-60`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-mood-black/60 uppercase tracking-wider mb-2">
                    Personal Reflection or Note (Optional)
                  </label>
                  <textarea
                    rows={3}
                    value={newNote}
                    disabled={submittingNote}
                    onChange={(e) => {
                      setNewNote(e.target.value);
                      if (modalError && e.target.value.length <= 500) setModalError('');
                    }}
                    placeholder="e.g. Wrapped up my study session, feeling peaceful and ready for calm acoustic music..."
                    maxLength={500}
                    className="w-full text-sm bg-mood-black/5 border border-mood-black/10 rounded-2xl p-3.5 focus:outline-hidden focus:ring-2 focus:ring-mood-cobalt/40 resize-none disabled:opacity-60"
                  />
                  <div className="flex justify-between text-[10px] text-mood-black/40 mt-1">
                    <span>Optional personal notes help you track your thoughts over time</span>
                    <span>{newNote.length}/500</span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    disabled={submittingNote}
                    onClick={() => {
                      setModalError('');
                      setShowLogModal(false);
                    }}
                    className="px-4 py-2 text-xs font-bold text-mood-black/60 hover:text-mood-black disabled:opacity-40"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingNote}
                    className="px-5 py-2.5 bg-mood-forest text-mood-offwhite text-xs font-bold rounded-xl hover:bg-mood-forest/90 transition-all shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {submittingNote ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <span>Save Reflection</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default MoodAnalytics;
