import React, { useState, useEffect } from 'react';
import { Music } from 'lucide-react';

const GRADIENTS = [
  'from-[#132A13] to-[#31572C]', // Forest tones
  'from-[#003049] to-[#1D3557]', // Deep cobalt tones
  'from-[#2B2D42] to-[#4A4E69]', // Slate charcoal tones
  'from-[#386641] to-[#6A994E]', // Olive sage tones
  'from-[#1E3A8A] to-[#2563EB]', // Bright cobalt tones
  'from-[#0F3057] to-[#00587A]', // Deep teal tones
];

// Helper to deterministically pick a gradient based on string hash
const getGradientForText = (str = '') => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % GRADIENTS.length;
  return GRADIENTS[index];
};

export const SongCover = ({
  src,
  title = 'Track',
  artist = '',
  className = 'w-full h-full object-cover',
  containerClassName = '',
  alt = '',
  iconClassName = 'w-6 h-6 text-mood-lime',
}) => {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Reset error state if src, title, or artist changes
  useEffect(() => {
    setHasError(false);
    setIsLoaded(false);
  }, [src, title, artist]);

  const cleanSrc = src && typeof src === 'string' && src.trim().length > 0 ? src.trim() : null;
  const gradient = getGradientForText(title + artist);

  if (!cleanSrc || hasError) {
    return (
      <div
        className={`bg-gradient-to-br ${gradient} flex flex-col items-center justify-center select-none overflow-hidden relative ${containerClassName || className}`}
        title={`${title} - ${artist}`}
      >
        <div className="absolute inset-0 bg-black/10 backdrop-blur-[1px]"></div>
        <div className="relative z-10 flex flex-col items-center justify-center p-2 text-center">
          <Music className={`${iconClassName} drop-shadow-sm`} />
          {title && (
            <span className="text-[10px] font-bold text-white/80 uppercase tracking-wider truncate max-w-[90%] mt-1 leading-tight">
              {title.slice(0, 16)}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden ${containerClassName || ''}`}>
      {!isLoaded && (
        <div className={`absolute inset-0 bg-mood-black/5 animate-pulse flex items-center justify-center ${className}`}>
          <Music className="w-4 h-4 text-mood-black/20" />
        </div>
      )}
      <img
        src={cleanSrc}
        alt={alt || title}
        loading="lazy"
        onLoad={() => setIsLoaded(true)}
        onError={() => setHasError(true)}
        className={`${className} transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
};

export default SongCover;
