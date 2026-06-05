/* ──────────────────────────────────────────────────────────
   Custom line-icon set. All stroke = currentColor so they
   inherit text color. Replaces every emoji across the app.
   ────────────────────────────────────────────────────────── */
import type { CSSProperties } from "react";

type P = { size?: number; style?: CSSProperties; strokeWidth?: number };

const base = (size: number): React.SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
});

/* Brand / try-on mark — a refined 4-point spark */
export const IconSpark = ({ size = 18, style, strokeWidth = 1.5 }: P) => (
  <svg {...base(size)} style={style}>
    <path d="M12 3c.4 3.6 2.4 5.6 6 6-3.6.4-5.6 2.4-6 6-.4-3.6-2.4-5.6-6-6 3.6-.4 5.6-2.4 6-6z"
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" />
  </svg>
);

/* Wardrobe — clothes hanger */
export const IconHanger = ({ size = 18, style, strokeWidth = 1.5 }: P) => (
  <svg {...base(size)} style={style}>
    <path d="M12 7a2 2 0 11.9-3.8M12 7v2l8 4.6c.6.4 1 1 1 1.7v0c0 1-.8 1.7-1.7 1.7H4.7C3.8 17 3 16.3 3 15.3v0c0-.7.4-1.3 1-1.7L12 9z"
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* Profile — person */
export const IconUser = ({ size = 18, style, strokeWidth = 1.5 }: P) => (
  <svg {...base(size)} style={style}>
    <circle cx="12" cy="8" r="3.4" stroke="currentColor" strokeWidth={strokeWidth} />
    <path d="M5 19.5c.7-3.3 3.5-5 7-5s6.3 1.7 7 5" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
  </svg>
);

/* Sign out */
export const IconSignOut = ({ size = 18, style, strokeWidth = 1.5 }: P) => (
  <svg {...base(size)} style={style}>
    <path d="M14 7V5.5A1.5 1.5 0 0012.5 4h-6A1.5 1.5 0 005 5.5v13A1.5 1.5 0 006.5 20h6a1.5 1.5 0 001.5-1.5V17"
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    <path d="M10 12h10m0 0l-3-3m3 3l-3 3" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* Heart (outline) */
export const IconHeart = ({ size = 18, style, strokeWidth = 1.5 }: P) => (
  <svg {...base(size)} style={style}>
    <path d="M12 20S3.5 14.6 3.5 8.9A4.4 4.4 0 0112 6.2a4.4 4.4 0 018.5 2.7C20.5 14.6 12 20 12 20z"
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" />
  </svg>
);

/* Heart (filled) */
export const IconHeartFilled = ({ size = 18, style }: P) => (
  <svg {...base(size)} style={style}>
    <path d="M12 20S3.5 14.6 3.5 8.9A4.4 4.4 0 0112 6.2a4.4 4.4 0 018.5 2.7C20.5 14.6 12 20 12 20z"
      fill="currentColor" />
  </svg>
);

/* Share / arrow out */
export const IconShare = ({ size = 18, style, strokeWidth = 1.5 }: P) => (
  <svg {...base(size)} style={style}>
    <path d="M7 17L17 7M17 7H9.5M17 7v7.5" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* Upload / cloud-up */
export const IconUpload = ({ size = 18, style, strokeWidth = 1.5 }: P) => (
  <svg {...base(size)} style={style}>
    <path d="M12 15V4m0 0L8 8m4-4l4 4" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 14v3.5A2.5 2.5 0 006.5 20h11a2.5 2.5 0 002.5-2.5V14" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
  </svg>
);

/* Copy link */
export const IconLink = ({ size = 18, style, strokeWidth = 1.5 }: P) => (
  <svg {...base(size)} style={style}>
    <path d="M10 14a3.5 3.5 0 005 0l3-3a3.5 3.5 0 00-5-5l-1 1" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    <path d="M14 10a3.5 3.5 0 00-5 0l-3 3a3.5 3.5 0 005 5l1-1" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* Lightbulb — styling tip */
export const IconBulb = ({ size = 18, style, strokeWidth = 1.5 }: P) => (
  <svg {...base(size)} style={style}>
    <path d="M9 17h6m-5 2.5h4M12 3a6 6 0 00-4 10.5c.6.5 1 1.3 1 2.1h6c0-.8.4-1.6 1-2.1A6 6 0 0012 3z"
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* X / Twitter */
export const IconX = ({ size = 16, style }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={style}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.736l7.73-8.835L1.254 2.25H8.08l4.259 5.623 5.905-5.623zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

/* Instagram */
export const IconInstagram = ({ size = 16, style, strokeWidth = 1.5 }: P) => (
  <svg {...base(size)} style={style}>
    <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth={strokeWidth} />
    <circle cx="12" cy="12" r="3.6" stroke="currentColor" strokeWidth={strokeWidth} />
    <circle cx="17.2" cy="6.8" r="1" fill="currentColor" />
  </svg>
);

/* Chevron left — back */
export const IconChevronLeft = ({ size = 18, style, strokeWidth = 1.5 }: P) => (
  <svg {...base(size)} style={style}>
    <path d="M14 6l-6 6 6 6" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* Arrow right */
export const IconArrowRight = ({ size = 18, style, strokeWidth = 1.5 }: P) => (
  <svg {...base(size)} style={style}>
    <path d="M5 12h14m0 0l-5-5m5 5l-5 5" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* Sidebar toggle — panel with collapse bar */
export const IconPanel = ({ size = 18, style, strokeWidth = 1.5 }: P) => (
  <svg {...base(size)} style={style}>
    <rect x="3" y="4" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth={strokeWidth} />
    <path d="M9.5 4v16" stroke="currentColor" strokeWidth={strokeWidth} />
  </svg>
);

/* Check */
export const IconCheck = ({ size = 16, style, strokeWidth = 1.6 }: P) => (
  <svg {...base(size)} style={style}>
    <path d="M5 12.5l4 4 10-10" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* Plus */
export const IconPlus = ({ size = 16, style, strokeWidth = 1.6 }: P) => (
  <svg {...base(size)} style={style}>
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
  </svg>
);

/* Trash */
export const IconTrash = ({ size = 18, style, strokeWidth = 1.5 }: P) => (
  <svg {...base(size)} style={style}>
    <path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6 7l1 12a1 1 0 001 1h8a1 1 0 001-1l1-12M10 11v5M14 11v5" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* Search */
export const IconSearch = ({ size = 18, style, strokeWidth = 1.5 }: P) => (
  <svg {...base(size)} style={style}>
    <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth={strokeWidth} />
    <path d="M16 16l4 4" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
  </svg>
);

/* Link */
export const IconLinkChain = ({ size = 18, style, strokeWidth = 1.5 }: P) => (
  <svg {...base(size)} style={style}>
    <path d="M10 14a3.5 3.5 0 005 0l3-3a3.5 3.5 0 00-5-5l-1 1" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    <path d="M14 10a3.5 3.5 0 00-5 0l-3 3a3.5 3.5 0 005 5l1-1" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* Sliders / scrub handle */
export const IconScrub = ({ size = 18, style, strokeWidth = 1.6 }: P) => (
  <svg {...base(size)} style={style}>
    <path d="M9 7l-4 5 4 5M15 7l4 5-4 5" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* TikTok */
export const IconTikTok = ({ size = 16, style }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={style}>
    <path d="M16.6 5.82a4.28 4.28 0 01-1.05-2.82h-3.2v12.62a2.4 2.4 0 11-2.4-2.4c.22 0 .43.03.63.09v-3.3a5.7 5.7 0 00-.63-.04 5.7 5.7 0 105.7 5.7V9.01a7.45 7.45 0 004.35 1.4V7.2a4.28 4.28 0 01-3.4-1.38z"/>
  </svg>
);

/* WhatsApp */
export const IconWhatsApp = ({ size = 16, style }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={style}>
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 004.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0012.04 2zm5.8 14.13c-.25.69-1.45 1.32-1.99 1.36-.53.05-.53.42-3.34-.7-2.81-1.11-4.55-3.99-4.69-4.18-.14-.18-1.12-1.49-1.12-2.84s.71-2.01.96-2.29c.25-.28.55-.35.73-.35.18 0 .37 0 .53.01.17.01.4-.06.62.48.25.6.83 2.07.9 2.22.07.14.12.31.02.49-.09.18-.14.3-.28.46-.14.16-.29.36-.42.48-.14.14-.28.29-.12.57.16.28.71 1.18 1.53 1.91 1.06.94 1.95 1.24 2.23 1.38.28.14.44.12.6-.07.18-.21.69-.8.87-1.08.18-.28.37-.23.62-.14.25.09 1.6.76 1.87.9.28.14.46.21.53.32.07.12.07.65-.18 1.34z"/>
  </svg>
);

/* Download */
export const IconDownload = ({ size = 18, style, strokeWidth = 1.5 }: P) => (
  <svg {...base(size)} style={style}>
    <path d="M12 4v11m0 0l-4-4m4 4l4-4" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5 19h14" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
  </svg>
);

/* Wand — AI stylist agent */
export const IconWand = ({ size = 18, style, strokeWidth = 1.5 }: P) => (
  <svg {...base(size)} style={style}>
    <path d="M5 19l9-9M14.5 5.5l1 1M17 9l3.2-3.2a1.4 1.4 0 000-2l-.0-.0a1.4 1.4 0 00-2 0L15 7" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    <path d="M6 4l.7 1.6L8.3 6.3 6.7 7 6 8.6 5.3 7 3.7 6.3 5.3 5.6 6 4zM18 13l.5 1.2 1.2.5-1.2.5L18 16.4 17.5 15.2 16.3 14.7 17.5 14.2 18 13z" fill="currentColor" stroke="none" />
  </svg>
);

/* Camera — photo */
export const IconCamera = ({ size = 18, style, strokeWidth = 1.5 }: P) => (
  <svg {...base(size)} style={style}>
    <path d="M4 8.5A1.5 1.5 0 015.5 7h1.7l1-1.6A1 1 0 019 5h6a1 1 0 01.8.4L17 7h1.5A1.5 1.5 0 0120 8.5v8A1.5 1.5 0 0118.5 18h-13A1.5 1.5 0 014 16.5v-8z"
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" />
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth={strokeWidth} />
  </svg>
);
