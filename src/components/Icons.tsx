interface IconProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export const IconBack = ({ size = 22, strokeWidth = 1.8 }: IconProps) => (
  <svg {...base(size)} strokeWidth={strokeWidth}>
    <path d="M15 18l-6-6 6-6" />
  </svg>
);

export const IconPlus = ({ size = 22, strokeWidth = 1.8 }: IconProps) => (
  <svg {...base(size)} strokeWidth={strokeWidth}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconSettings = ({ size = 20, strokeWidth = 1.7 }: IconProps) => (
  <svg {...base(size)} strokeWidth={strokeWidth}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
  </svg>
);

export const IconPlay = ({ size = 26 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5.14v13.72a1 1 0 001.5.86l11-6.86a1 1 0 000-1.72l-11-6.86A1 1 0 008 5.14z" />
  </svg>
);

export const IconPause = ({ size = 26 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <rect x="6.5" y="5" width="4" height="14" rx="1.4" />
    <rect x="13.5" y="5" width="4" height="14" rx="1.4" />
  </svg>
);

export const IconPrev = ({ size = 22, strokeWidth = 1.9 }: IconProps) => (
  <svg {...base(size)} strokeWidth={strokeWidth}>
    <path d="M18 6l-8.5 6L18 18V6z" fill="currentColor" stroke="none" />
    <path d="M6 5v14" />
  </svg>
);

export const IconNext = ({ size = 22, strokeWidth = 1.9 }: IconProps) => (
  <svg {...base(size)} strokeWidth={strokeWidth}>
    <path d="M6 6l8.5 6L6 18V6z" fill="currentColor" stroke="none" />
    <path d="M18 5v14" />
  </svg>
);

export const IconList = ({ size = 21, strokeWidth = 1.8 }: IconProps) => (
  <svg {...base(size)} strokeWidth={strokeWidth}>
    <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
  </svg>
);

export const IconType = ({ size = 21, strokeWidth = 1.8 }: IconProps) => (
  <svg {...base(size)} strokeWidth={strokeWidth}>
    <path d="M4 7V5h11v2M9.5 5v14M7 19h5" />
    <path d="M15 13v-1.5h6V13M18 11.5V19M16.5 19h3" />
  </svg>
);

export const IconHeadphone = ({ size = 21, strokeWidth = 1.8 }: IconProps) => (
  <svg {...base(size)} strokeWidth={strokeWidth}>
    <path d="M4 14v-2a8 8 0 1116 0v2" />
    <path d="M4 14h2.5a1.5 1.5 0 011.5 1.5v3A1.5 1.5 0 016.5 20H5.5A1.5 1.5 0 014 18.5V14zM20 14h-2.5a1.5 1.5 0 00-1.5 1.5v3a1.5 1.5 0 001.5 1.5h1a1.5 1.5 0 001.5-1.5V14z" />
  </svg>
);

export const IconTrash = ({ size = 20, strokeWidth = 1.7 }: IconProps) => (
  <svg {...base(size)} strokeWidth={strokeWidth}>
    <path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12" />
  </svg>
);

export const IconBook = ({ size = 120 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 120 120" fill="none" stroke="currentColor">
    <path
      d="M60 30c-8-6-20-8-30-8-3 0-5 2-5 5v54c0 3 2 5 5 5 10 0 22 2 30 8 8-6 20-8 30-8 3 0 5-2 5-5V27c0-3-2-5-5-5-10 0-22 2-30 8z"
      strokeWidth="2"
      strokeLinejoin="round"
      opacity="0.55"
    />
    <path d="M60 30v56" strokeWidth="2" opacity="0.35" />
    <path d="M38 42h12M38 52h12M70 42h12M70 52h12" strokeWidth="1.6" strokeLinecap="round" opacity="0.35" />
    <circle cx="60" cy="86" r="20" fill="none" strokeWidth="2" opacity="0.3" />
    <path d="M55 78l10 8-10 8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.45" />
  </svg>
);

export const IconCloud = ({ size = 20, strokeWidth = 1.7 }: IconProps) => (
  <svg {...base(size)} strokeWidth={strokeWidth}>
    <path d="M17.5 19H7a4.5 4.5 0 01-.7-8.95 6 6 0 0111.6-1.4A4 4 0 0117.5 19z" />
  </svg>
);
