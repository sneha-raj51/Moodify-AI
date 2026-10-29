import React from 'react';
import { 
  Sparkles, X, Music, Heart, Globe, User, 
  Clock, ThumbsUp, Compass, Play, AlertCircle, Info
} from 'lucide-react';
import SongCover from './SongCover';

const FACTOR_CONFIGS = {
  mood_compatibility: {
    label: 'Mood Compatibility',
    icon: Sparkles,
    color: 'text-mood-cobalt bg-mood-cobalt/10 border-mood-cobalt/20',
    barColor: 'bg-mood-cobalt'
  },
  transition_bridge: {
    label: 'Mood Transition Bridge',
    icon: Compass,
    color: 'text-indigo-600 bg-indigo-50 border-indigo-200',
    barColor: 'bg-indigo-500'
  },
  genre_preference: {
    label: 'Genre Match',
    icon: Music,
    color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    barColor: 'bg-emerald-500'
  },
  language_preference: {
    label: 'Language Alignment',
    icon: Globe,
    color: 'text-amber-700 bg-amber-50 border-amber-200',
    barColor: 'bg-amber-500'
  },
  artist_affinity: {
    label: 'Artist Affinity',
    icon: User,
    color: 'text-purple-700 bg-purple-50 border-purple-200',
    barColor: 'bg-purple-500'
  },
  favorite_bonus: {
    label: 'Saved in Favorites',
    icon: Heart,
    color: 'text-rose-700 bg-rose-50 border-rose-200',
    barColor: 'bg-rose-500'
  },
  feedback_positive: {
    label: 'Positive User Feedback',
    icon: ThumbsUp,
    color: 'text-teal-700 bg-teal-50 border-teal-200',
    barColor: 'bg-teal-500'
  },
  familiarity_bonus: {
    label: 'Listening Familiarity',
    icon: Clock,
    color: 'text-blue-700 bg-blue-50 border-blue-200',
    barColor: 'bg-blue-500'
  },
  recency_penalty: {
    label: 'Catalog Variety Optimization',
    icon: Clock,
    color: 'text-slate-700 bg-slate-50 border-slate-200',
    barColor: 'bg-slate-400'
  },
  skip_penalty: {
    label: 'Skip Penalty Adjustment',
    icon: AlertCircle,
    color: 'text-red-700 bg-red-50 border-red-200',
    barColor: 'bg-red-400'
  },
  listening_mode: {
    label: 'Smart Listening Mode',
    icon: Compass,
    color: 'text-mood-forest bg-mood-forest/10 border-mood-forest/20',
    barColor: 'bg-mood-forest'
  },
  catalog_discovery: {
    label: 'Catalog Discovery',
    icon: Info,
    color: 'text-mood-black/70 bg-mood-black/5 border-mood-black/10',
    barColor: 'bg-mood-black/40'
  }
};

const WhyThisSongModal = ({ song, isOpen, onClose, onPlay }) => {
  if (!isOpen || !song) return null;

  const scoringFactors = song.scoringFactors || {};
  const reasons = Array.isArray(song.reasons) ? song.reasons : [];
  const factorKeys = Object.keys(scoringFactors).filter(k => scoringFactors[k] !== 0);

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-mood-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="why-song-title"
    >
      <div 
        className="bg-mood-offwhite w-full max-w-lg rounded-3xl p-6 md:p-7 shadow-2xl border border-mood-black/10 space-y-5 overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-mood-black/10 pb-4 shrink-0">
          <div className="flex items-center gap-2 text-mood-cobalt">
            <div className="w-8 h-8 rounded-full bg-mood-cobalt/10 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-mood-cobalt" />
            </div>
            <div>
              <h3 id="why-song-title" className="text-base font-extrabold text-mood-forest">
                Why was this song recommended?
              </h3>
              <p className="text-[11px] text-mood-black/50">
                Transparent multi-feature recommendation breakdown
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-mood-black/40 hover:text-mood-black hover:bg-mood-black/5 transition-all"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto space-y-5 pr-1 flex-1">
          {/* Song Summary Card */}
          <div className="flex items-center gap-4 bg-white p-4 rounded-2xl border border-mood-black/5 shadow-xs">
            <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 shadow-sm relative">
              <SongCover 
                src={song.cover || song.albumArt} 
                title={song.title} 
                artist={song.artist}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="font-extrabold text-mood-forest text-base truncate" title={song.title}>
                {song.title}
              </h4>
              <p className="text-xs text-mood-black/60 truncate mt-0.5">{song.artist}</p>
              
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {song.mood && (
                  <span className="text-[10px] font-bold text-mood-cobalt bg-mood-cobalt/10 px-2 py-0.5 rounded-full capitalize">
                    {song.mood}
                  </span>
                )}
                {song.genre && (
                  <span className="text-[10px] font-semibold text-mood-black/60 bg-mood-black/5 px-2 py-0.5 rounded-full">
                    {song.genre}
                  </span>
                )}
                {song.language && (
                  <span className="text-[10px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/50">
                    {song.language}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Core Synthesis Explanation */}
          <div className="bg-mood-cobalt/5 border border-mood-cobalt/15 p-4 rounded-2xl space-y-1.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-mood-cobalt flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" /> Recommendation Summary
            </div>
            <p className="text-sm font-medium text-mood-forest leading-relaxed">
              {song.explanation || "Selected for you based on mood alignment and catalog discovery."}
            </p>
          </div>

          {/* Genuine Evaluated Factors */}
          <div className="space-y-3">
            <h5 className="text-xs font-bold uppercase tracking-wider text-mood-black/60">
              Evaluated Contributing Factors
            </h5>

            {factorKeys.length === 0 && reasons.length === 0 ? (
              <div className="p-4 bg-white rounded-2xl border border-mood-black/5 text-center text-xs text-mood-black/50">
                This track was recommended as a discovery candidate from the active music catalog.
              </div>
            ) : (
              <div className="space-y-2.5">
                {factorKeys.map(key => {
                  const val = scoringFactors[key];
                  const cfg = FACTOR_CONFIGS[key] || {
                    label: key.replace(/_/g, ' '),
                    icon: Sparkles,
                    color: 'text-mood-forest bg-mood-forest/5 border-mood-forest/10',
                    barColor: 'bg-mood-forest'
                  };
                  const IconComp = cfg.icon;
                  const isPositive = val > 0;
                  const formattedScore = isPositive ? `+${val.toFixed(1)}` : `${val.toFixed(1)}`;

                  return (
                    <div 
                      key={key}
                      className="bg-white p-3.5 rounded-2xl border border-mood-black/5 shadow-2xs flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${cfg.color}`}>
                          <IconComp className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-mood-forest truncate">
                            {cfg.label}
                          </p>
                          <p className="text-[11px] text-mood-black/55 mt-0.5 leading-snug">
                            {key === 'recency_penalty'
                              ? 'Recent listen variety adjustment'
                              : key === 'skip_penalty'
                              ? 'Skip feedback deprioritization'
                              : reasons.find(r => r.toLowerCase().includes(key.replace(/_/g, ' '))) || `${cfg.label} evaluated`}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className={`text-xs font-extrabold px-2 py-0.5 rounded-lg ${
                          isPositive ? 'text-emerald-700 bg-emerald-50' : 'text-slate-600 bg-slate-100'
                        }`}>
                          {formattedScore} pts
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* Additional human-readable reasons if not mapped to a factor key */}
                {reasons.filter(r => !factorKeys.some(k => r.toLowerCase().includes(k.replace(/_/g, ' ')))).map((r, rIdx) => (
                  <div 
                    key={`reason-${rIdx}`}
                    className="bg-white p-3 rounded-2xl border border-mood-black/5 flex items-center gap-2.5 text-xs text-mood-forest"
                  >
                    <span className="w-2 h-2 rounded-full bg-mood-cobalt shrink-0" />
                    <span>{r.charAt(0).toUpperCase() + r.slice(1)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-3 border-t border-mood-black/10 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-mood-black/60 hover:text-mood-forest transition-colors"
          >
            Close
          </button>

          {onPlay && (
            <button
              type="button"
              onClick={() => {
                onPlay(song);
                onClose();
              }}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-mood-forest text-mood-lime rounded-2xl text-xs font-bold hover:bg-mood-forest/90 transition-all shadow-sm"
            >
              <Play className="w-3.5 h-3.5 fill-current" /> Play Track
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default WhyThisSongModal;
