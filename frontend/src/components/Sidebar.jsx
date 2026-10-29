import React from 'react';
import { 
  Compass, Camera, Repeat, BarChart2, Heart, 
  ListMusic, History as HistoryIcon, Sparkles, CheckCircle2, MessageSquare, Sliders,
  Shield
} from 'lucide-react';

const Sidebar = ({ currentView, setCurrentView, jamendoStatus }) => {
  const navItems = [
    { name: 'Discover', icon: Compass, view: 'discover' },
    { name: 'Taste Profile', icon: Sliders, view: 'profile' },
    { name: 'AI Companion', icon: MessageSquare, view: 'companion' },
    { name: 'Mood Studio', icon: Camera, view: 'mood-studio' },
    { name: 'Mood Mix', icon: Sparkles, view: 'mood-mix' },
    { name: 'Mood Transition', icon: Repeat, view: 'mood-transition' },
    { name: 'Smart Builder', icon: Sparkles, view: 'smart-builder' },
    { name: 'My Playlists', icon: ListMusic, view: 'playlists' },
    { name: 'Favorites', icon: Heart, view: 'favorites' },
    { name: 'Listening History', icon: HistoryIcon, view: 'history' },
    { name: 'Mood Journal & Insights', icon: BarChart2, view: 'mood-insights' },
    { name: 'Privacy Controls', icon: Shield, view: 'privacy' },
  ];

  return (
    <aside className="hidden md:flex w-64 border-r border-mood-black/10 bg-mood-offwhite h-full flex-col pt-8 pb-24 shrink-0">
      {/* Brand Logo */}
      <div 
        onClick={() => setCurrentView('discover')}
        className="px-8 mb-8 flex items-center gap-3 cursor-pointer group"
      >
        <div className="w-9 h-9 rounded-full bg-mood-forest flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
          <span className="text-mood-lime font-bold text-lg leading-none">M</span>
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-tight text-mood-forest">Moodify</h1>
          <p className="text-[10px] uppercase font-bold tracking-widest text-mood-forest/50 -mt-0.5">AI Music Experience</p>
        </div>
      </div>
      
      {/* Navigation Links */}
      <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = currentView === item.view;
          return (
            <button
              key={item.name}
              onClick={() => setCurrentView(item.view)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all ${
                isActive
                  ? 'bg-mood-forest text-mood-offwhite shadow-sm'
                  : 'text-mood-black/70 hover:bg-mood-black/5 hover:text-mood-forest'
              }`}
            >
              <item.icon className={`w-4 h-4 ${isActive ? 'text-mood-lime' : 'text-mood-black/50'}`} />
              <span>{item.name}</span>
            </button>
          );
        })}
      </nav>
      
      {/* Music Source Status Card */}
      <div className="px-6 mt-auto">
        <div className="bg-white p-3.5 rounded-2xl border border-mood-black/5 shadow-xs space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[11px] font-bold text-mood-forest uppercase tracking-wider">Audio Engine</span>
          </div>
          <p className="text-xs text-mood-black/60">
            {jamendoStatus === 'connected'
              ? 'Jamendo & verified previews active'
              : 'Verified Apple Music audio previews active'}
          </p>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
