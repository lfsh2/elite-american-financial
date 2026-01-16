import React from 'react';

interface ProviderLogoProps {
  provider: 'twilio' | 'commio' | 'bandwidth';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function ProviderLogo({ provider, size = 'md', className = '' }: ProviderLogoProps) {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-12 h-12'
  };

  const logos = {
    twilio: (
      <svg viewBox="0 0 30 30" className={`${sizeClasses[size]} ${className}`} fill="currentColor">
        <circle cx="15" cy="15" r="15" fill="#F22F46"/>
        <circle cx="10" cy="10" r="2.5" fill="white"/>
        <circle cx="20" cy="10" r="2.5" fill="white"/>
        <circle cx="10" cy="20" r="2.5" fill="white"/>
        <circle cx="20" cy="20" r="2.5" fill="white"/>
      </svg>
    ),
    commio: (
      <svg viewBox="0 0 30 30" className={`${sizeClasses[size]} ${className}`} fill="currentColor">
        <rect width="30" height="30" rx="6" fill="#00B388"/>
        <path d="M15 8L22 12V18L15 22L8 18V12L15 8Z" fill="white"/>
        <circle cx="15" cy="15" r="3" fill="#00B388"/>
      </svg>
    ),
    bandwidth: (
      <svg viewBox="0 0 30 30" className={`${sizeClasses[size]} ${className}`} fill="currentColor">
        <rect width="30" height="30" rx="6" fill="#079CEE"/>
        <path d="M8 15L12 11V19L8 15Z" fill="white"/>
        <path d="M14 15L18 11V19L14 15Z" fill="white"/>
        <path d="M20 15L24 11V19L20 15Z" fill="white"/>
      </svg>
    )
  };

  return logos[provider] || null;
}

// Alternative: Image-based logos (if you have actual logo files)
export function ProviderLogoImage({ provider, size = 'md', className = '' }: ProviderLogoProps) {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-12 h-12'
  };

  const logoUrls = {
    twilio: 'https://www.twilio.com/content/dam/twilio-com/global/en/blog/legacy/2017/Twilio-Mark-Red.png',
    commio: 'https://thinq.com/wp-content/uploads/2021/03/thinQ-logo.svg',
    bandwidth: 'https://www.bandwidth.com/wp-content/themes/bandwidth/assets/images/bandwidth-logo.svg'
  };

  return (
    <img 
      src={logoUrls[provider]} 
      alt={`${provider} logo`}
      className={`${sizeClasses[size]} ${className} object-contain`}
      onError={(e) => {
        // Fallback to SVG if image fails to load
        e.currentTarget.style.display = 'none';
      }}
    />
  );
}
