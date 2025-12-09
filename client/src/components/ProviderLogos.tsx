import React from 'react';

/**
 * Twilio Logo SVG
 * Official Twilio red color: #F22F46
 */
export function TwilioLogo({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg 
      className={className} 
      viewBox="0 0 30 30" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <path 
        d="M15 0C6.716 0 0 6.716 0 15C0 23.284 6.716 30 15 30C23.284 30 30 23.284 30 15C30 6.716 23.284 0 15 0ZM15 26.25C8.787 26.25 3.75 21.213 3.75 15C3.75 8.787 8.787 3.75 15 3.75C21.213 3.75 26.25 8.787 26.25 15C26.25 21.213 21.213 26.25 15 26.25Z" 
        fill="#F22F46"
      />
      <path 
        d="M19.5 10.5C19.5 11.88 18.38 13 17 13C15.62 13 14.5 11.88 14.5 10.5C14.5 9.12 15.62 8 17 8C18.38 8 19.5 9.12 19.5 10.5Z" 
        fill="#F22F46"
      />
      <path 
        d="M13 10.5C13 11.88 11.88 13 10.5 13C9.12 13 8 11.88 8 10.5C8 9.12 9.12 8 10.5 8C11.88 8 13 9.12 13 10.5Z" 
        fill="#F22F46"
      />
      <path 
        d="M19.5 17C19.5 18.38 18.38 19.5 17 19.5C15.62 19.5 14.5 18.38 14.5 17C14.5 15.62 15.62 14.5 17 14.5C18.38 14.5 19.5 15.62 19.5 17Z" 
        fill="#F22F46"
      />
      <path 
        d="M13 17C13 18.38 11.88 19.5 10.5 19.5C9.12 19.5 8 18.38 8 17C8 15.62 9.12 14.5 10.5 14.5C11.88 14.5 13 15.62 13 17Z" 
        fill="#F22F46"
      />
    </svg>
  );
}

/**
 * Commio Logo SVG
 * Commio brand color: #6366F1 (indigo)
 */
export function CommioLogo({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg 
      className={className} 
      viewBox="0 0 32 32" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="32" height="32" rx="8" fill="#6366F1"/>
      <path 
        d="M16 6C10.477 6 6 10.477 6 16C6 21.523 10.477 26 16 26C21.523 26 26 21.523 26 16C26 10.477 21.523 6 16 6ZM16 22C12.686 22 10 19.314 10 16C10 12.686 12.686 10 16 10C19.314 10 22 12.686 22 16C22 19.314 19.314 22 16 22Z" 
        fill="white"
      />
      <circle cx="16" cy="16" r="3" fill="white"/>
    </svg>
  );
}

/**
 * Bandwidth Logo SVG
 * Bandwidth brand color: #079CEE
 */
export function BandwidthLogo({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg 
      className={className} 
      viewBox="0 0 32 32" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="32" height="32" rx="8" fill="#079CEE"/>
      <path 
        d="M8 12H12V20H8V12Z" 
        fill="white"
      />
      <path 
        d="M14 8H18V24H14V8Z" 
        fill="white"
      />
      <path 
        d="M20 14H24V18H20V14Z" 
        fill="white"
      />
    </svg>
  );
}

/**
 * Generic Provider Logo (fallback)
 */
export function GenericProviderLogo({ 
  className = 'w-6 h-6',
  letter = 'P',
  color = '#6B7280'
}: { 
  className?: string;
  letter?: string;
  color?: string;
}) {
  return (
    <svg 
      className={className} 
      viewBox="0 0 32 32" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="32" height="32" rx="8" fill={color}/>
      <text 
        x="16" 
        y="21" 
        textAnchor="middle" 
        fill="white" 
        fontSize="16" 
        fontWeight="bold"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        {letter}
      </text>
    </svg>
  );
}

/**
 * Provider Logo Component
 * Renders the appropriate logo based on provider type
 */
export type ProviderType = 'twilio' | 'commio' | 'bandwidth';

export function ProviderLogo({ 
  provider, 
  className = 'w-6 h-6' 
}: { 
  provider: ProviderType | string;
  className?: string;
}) {
  switch (provider) {
    case 'twilio':
      return <TwilioLogo className={className} />;
    case 'commio':
      return <CommioLogo className={className} />;
    case 'bandwidth':
      return <BandwidthLogo className={className} />;
    default:
      return <GenericProviderLogo className={className} letter={provider[0]?.toUpperCase() || 'P'} />;
  }
}

export default ProviderLogo;
