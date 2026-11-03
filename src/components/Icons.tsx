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

export const IconSearch = ({ size = 20, strokeWidth = 1.8 }: IconProps) => (
  <svg {...base(size)} strokeWidth={strokeWidth}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </svg>
);

export const IconClose = ({ size = 18, strokeWidth = 1.9 }: IconProps) => (
  <svg {...base(size)} strokeWidth={strokeWidth}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const IconExpand = ({ size = 20, strokeWidth = 1.8 }: IconProps) => (
  <svg {...base(size)} strokeWidth={strokeWidth}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </svg>
);

export const IconCollapse = ({ size = 20, strokeWidth = 1.8 }: IconProps) => (
  <svg {...base(size)} strokeWidth={strokeWidth}>
    <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
  </svg>
);

export const IconFont = ({ size = 20, strokeWidth = 1.8 }: IconProps) => (
  <svg {...base(size)} strokeWidth={strokeWidth}>
    <path d="M4 19l6-14 6 14M6.5 14h7" />
    <path d="M17 19V9M15 11l2-2 2 2" />
  </svg>
);

/* ------------------------------ 底部页签 ------------------------------ */

export const IconShelf = ({ size = 23, strokeWidth = 1.7 }: IconProps) => (
  <svg {...base(size)} strokeWidth={strokeWidth}>
    <path d="M4 5.5A1.5 1.5 0 015.5 4H9v16H5.5A1.5 1.5 0 014 18.5v-13z" />
    <path d="M9 4h4.5v16H9z" />
    <path d="M15 5.2l3.4-.9a1 1 0 011.2.7l2.6 12.7a1 1 0 01-.7 1.2l-3.5.9" />
  </svg>
);

export const IconStore = ({ size = 23, strokeWidth = 1.7 }: IconProps) => (
  <svg {...base(size)} strokeWidth={strokeWidth}>
    <path d="M4.5 8h15l-1 11.2a1.6 1.6 0 01-1.6 1.5H7.1a1.6 1.6 0 01-1.6-1.5L4.5 8z" />
    <path d="M9 8V6.2A3 3 0 0112 3a3 3 0 013 3.2V8" />
  </svg>
);

export const IconCompass = ({ size = 23, strokeWidth = 1.7 }: IconProps) => (
  <svg {...base(size)} strokeWidth={strokeWidth}>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M14.9 9.1l-1.6 4.2-4.2 1.6 1.6-4.2 4.2-1.6z" />
  </svg>
);

export const IconUser = ({ size = 23, strokeWidth = 1.7 }: IconProps) => (
  <svg {...base(size)} strokeWidth={strokeWidth}>
    <circle cx="12" cy="8.4" r="3.9" />
    <path d="M4.8 20.2a7.4 7.4 0 0114.4 0" />
  </svg>
);

/* ------------------------------ 书架 / 书城 ------------------------------ */

export const IconGrid = ({ size = 18, strokeWidth = 1.7 }: IconProps) => (
  <svg {...base(size)} strokeWidth={strokeWidth}>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.2" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2" />
  </svg>
);

export const IconRows = ({ size = 18, strokeWidth = 1.7 }: IconProps) => (
  <svg {...base(size)} strokeWidth={strokeWidth}>
    <path d="M4 6.5h16M4 12h16M4 17.5h16" />
  </svg>
);

export const IconChevron = ({ size = 16, strokeWidth = 1.8 }: IconProps) => (
  <svg {...base(size)} strokeWidth={strokeWidth}>
    <path d="M9 5l7 7-7 7" />
  </svg>
);

export const IconMore = ({ size = 21, strokeWidth = 2 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <circle cx="5.5" cy="12" r="1.7" />
    <circle cx="12" cy="12" r="1.7" />
    <circle cx="18.5" cy="12" r="1.7" />
  </svg>
);

export const IconMoon = ({ size = 21, strokeWidth = 1.7 }: IconProps) => (
  <svg {...base(size)} strokeWidth={strokeWidth}>
    <path d="M20 14.4A8.2 8.2 0 019.6 4a8.6 8.6 0 102 13.9" />
    <path d="M17.2 3.2l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" />
  </svg>
);

export const IconSun = ({ size = 21, strokeWidth = 1.7 }: IconProps) => (
  <svg {...base(size)} strokeWidth={strokeWidth}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.5 1.5M17.1 17.1l1.5 1.5M18.6 5.4l-1.5 1.5M6.9 17.1l-1.5 1.5" />
  </svg>
);

export const IconCheck = ({ size = 14, strokeWidth = 2.4 }: IconProps) => (
  <svg {...base(size)} strokeWidth={strokeWidth}>
    <path d="M4 12.5l5 5 11-11" />
  </svg>
);

export const IconGift = ({ size = 20, strokeWidth = 1.7 }: IconProps) => (
  <svg {...base(size)} strokeWidth={strokeWidth}>
    <path d="M4 11h16v8.2a1.8 1.8 0 01-1.8 1.8H5.8A1.8 1.8 0 014 19.2V11z" />
    <path d="M3 7.2h18V11H3zM12 7.2V21" />
    <path d="M12 7.2S10.4 3 8.2 3a2.1 2.1 0 000 4.2H12zM12 7.2S13.6 3 15.8 3a2.1 2.1 0 010 4.2H12z" />
  </svg>
);

export const IconClock = ({ size = 20, strokeWidth = 1.7 }: IconProps) => (
  <svg {...base(size)} strokeWidth={strokeWidth}>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M12 7.4V12l3.2 2" />
  </svg>
);

export const IconRank = ({ size = 20, strokeWidth = 1.9 }: IconProps) => (
  <svg {...base(size)} strokeWidth={strokeWidth}>
    <path d="M5 20V12.5M12 20V5M19 20v-4.5" />
  </svg>
);

export const IconFire = ({ size = 20, strokeWidth = 1.7 }: IconProps) => (
  <svg {...base(size)} strokeWidth={strokeWidth}>
    <path d="M12 21c3.6 0 6-2.4 6-5.6 0-3.9-4-5.9-4-9.4 0 0-3 1.6-3 5 0 1.4-1 2-1 2s-1-1-1-2.4C7.6 12.6 6 13.7 6 15.4 6 18.6 8.4 21 12 21z" />
  </svg>
);

export const IconSparkle = ({ size = 20, strokeWidth = 1.7 }: IconProps) => (
  <svg {...base(size)} strokeWidth={strokeWidth}>
    <path d="M12 3.5l1.8 4.9 4.9 1.8-4.9 1.8L12 16.9l-1.8-4.9L5.3 10.2l4.9-1.8L12 3.5z" />
    <path d="M18.5 16.2l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" />
  </svg>
);

export const IconSound = ({ size = 20, strokeWidth = 1.9 }: IconProps) => (
  <svg {...base(size)} strokeWidth={strokeWidth}>
    <path d="M4 15.4V8.6M8 18.6V5.4M12 16.4V7.6M16 19.4V4.6M20 14.4v-4.8" />
  </svg>
);

export const IconLayers = ({ size = 20, strokeWidth = 1.7 }: IconProps) => (
  <svg {...base(size)} strokeWidth={strokeWidth}>
    <path d="M12 3.2l8.4 4.4-8.4 4.4L3.6 7.6 12 3.2z" />
    <path d="M3.6 12.2l8.4 4.4 8.4-4.4M3.6 16.6l8.4 4.4 8.4-4.4" />
  </svg>
);

export const IconBookOpen = ({ size = 20, strokeWidth = 1.7 }: IconProps) => (
  <svg {...base(size)} strokeWidth={strokeWidth}>
    <path d="M12 6.6C10 5.2 7.6 4.7 4 4.7v13.6c3.6 0 6 .5 8 1.9 2-1.4 4.4-1.9 8-1.9V4.7c-3.6 0-6 .5-8 1.9z" />
    <path d="M12 6.6v13.6" />
  </svg>
);

export const IconUpload = ({ size = 20, strokeWidth = 1.7 }: IconProps) => (
  <svg {...base(size)} strokeWidth={strokeWidth}>
    <path d="M12 16V4.5M8.2 8.3L12 4.5l3.8 3.8" />
    <path d="M4.5 14.5v3.8A1.7 1.7 0 006.2 20h11.6a1.7 1.7 0 001.7-1.7v-3.8" />
  </svg>
);

export const IconInfo = ({ size = 20, strokeWidth = 1.7 }: IconProps) => (
  <svg {...base(size)} strokeWidth={strokeWidth}>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M12 11v5.2M12 7.9h.01" />
  </svg>
);

export const IconHeart = ({ size = 17, strokeWidth = 1.7 }: IconProps) => (
  <svg {...base(size)} strokeWidth={strokeWidth}>
    <path d="M12 20s-7.4-4.4-7.4-9.1A4.1 4.1 0 0112 8.4a4.1 4.1 0 017.4 2.5C19.4 15.6 12 20 12 20z" />
  </svg>
);

export const IconComment = ({ size = 17, strokeWidth = 1.7 }: IconProps) => (
  <svg {...base(size)} strokeWidth={strokeWidth}>
    <path d="M20 12.4c0 3.7-3.6 6.7-8 6.7a9.5 9.5 0 01-2.6-.35L5 20.4l1.1-3.1A6.4 6.4 0 014 12.4C4 8.7 7.6 5.7 12 5.7s8 3 8 6.7z" />
  </svg>
);
