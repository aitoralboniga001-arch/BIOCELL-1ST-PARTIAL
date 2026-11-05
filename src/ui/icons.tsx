/** Small stroke icon set (24×24, currentColor). */
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = ({ size = 18, ...p }: P) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...p,
});

export const IPlay = (p: P) => (
  <svg {...base(p)}>
    <path d="M7 5.5v13l11-6.5z" fill="currentColor" stroke="none" />
  </svg>
);
export const IPause = (p: P) => (
  <svg {...base(p)}>
    <rect x="6.5" y="5" width="3.6" height="14" rx="1" fill="currentColor" stroke="none" />
    <rect x="13.9" y="5" width="3.6" height="14" rx="1" fill="currentColor" stroke="none" />
  </svg>
);
export const IStepPrev = (p: P) => (
  <svg {...base(p)}>
    <path d="M15 6l-6 6 6 6" />
  </svg>
);
export const IStepNext = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);
export const IStagePrev = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 5v14M18 6l-7 6 7 6z" />
  </svg>
);
export const IStageNext = (p: P) => (
  <svg {...base(p)}>
    <path d="M18 5v14M6 6l7 6-7 6z" />
  </svg>
);
export const ITag = (p: P) => (
  <svg {...base(p)}>
    <path d="M3.5 12.2V4.5a1 1 0 011-1h7.7l8.3 8.3-8.7 8.7z" />
    <circle cx="8" cy="8" r="1.4" />
  </svg>
);
export const IReset = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 12a8 8 0 108-8 8.2 8.2 0 00-5.7 2.3L4 8.5" />
    <path d="M4 4v4.5h4.5" />
  </svg>
);
export const IZoomIn = (p: P) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4.3-4.3M11 8.3v5.4M8.3 11h5.4" />
  </svg>
);
export const IZoomOut = (p: P) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4.3-4.3M8.3 11h5.4" />
  </svg>
);
export const IFull = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </svg>
);
export const IVoice = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" />
    <path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11" />
  </svg>
);
export const IVoiceOff = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" />
    <path d="M16 9.5l5 5M21 9.5l-5 5" />
  </svg>
);
export const IHelp = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9.6 9.4a2.5 2.5 0 014.8.9c0 1.7-2.4 2.2-2.4 3.7M12 16.8v.1" />
  </svg>
);
export const IChevron = (p: P) => (
  <svg {...base(p)}>
    <path d="M7 10l5 5 5-5" />
  </svg>
);
export const ISearch = (p: P) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4.3-4.3" />
  </svg>
);
export const IPrint = (p: P) => (
  <svg {...base(p)}>
    <path d="M7 9V4h10v5M7 17H5a1 1 0 01-1-1v-5a2 2 0 012-2h12a2 2 0 012 2v5a1 1 0 01-1 1h-2" />
    <rect x="7" y="14" width="10" height="6" rx="1" />
  </svg>
);
export const ICheck = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
export const IX = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const ICube = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
    <path d="M4 7.5l8 4.5 8-4.5M12 12v9" />
  </svg>
);
export const IArrowRight = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

/** The BioCell mark: a cell with an ER-like fold. */
export const Logo = ({ size = 26 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
    <defs>
      <radialGradient id="lg" cx="40%" cy="35%" r="70%">
        <stop offset="0" stopColor="#ffb38f" />
        <stop offset="1" stopColor="#ff6a3d" />
      </radialGradient>
    </defs>
    <circle cx="16" cy="16" r="13.5" fill="none" stroke="url(#lg)" strokeWidth="2.4" />
    <circle cx="16" cy="16" r="4.6" fill="url(#lg)" />
    <path d="M9 10.5c2.5-2.2 5.2-2.6 7.6-1.3M8.3 15c1.2-1.4 2.6-2.2 4.1-2.4M22.7 21.4c-2.1 1.9-4.6 2.5-7.1 1.6" fill="none" stroke="#f5f2ec" strokeWidth="1.6" strokeLinecap="round" opacity=".8" />
  </svg>
);
