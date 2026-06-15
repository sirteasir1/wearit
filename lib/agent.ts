/* Shared types for the WearIt stylist agent. */

export interface AgentEvent {
  id: string;
  title: string;
  start: string;        // ISO datetime (or date for all-day)
  allDay?: boolean;
  source: "notion" | "calendar" | "time";
}

export interface Suggestion {
  id: string;
  when: string;                 // human label, e.g. "Today · 19:00" (server fallback)
  startIso?: string;            // event start (ISO) — client formats this in the browser's own timezone
  allDay?: boolean;
  occasion: string;             // what it's for
  vibe: string;                 // e.g. "smart casual"
  message: string;              // proactive line the agent says
  lookId: string | null;        // matched wardrobe item id (or null)
  lookName?: string;
  reason: string;               // why this look / advice
  action: "wardrobe" | "tryon" | "shop";
}

/* A single garment in a recommended look. Photo-based when sourced from a store,
   text-only (detail) when generated as a fallback. */
export interface Piece {
  name: string;       // e.g. "Oxford Button-Down Shirt"
  slot: string;       // top | bottom | outerwear | shoes | dress
  detail?: string;    // why / how to wear it (text fallback or extra note)
  image?: string;     // garment photo URL
  link?: string;      // product page (to view)
  price?: string;     // formatted price, e.g. "$78"
  brand?: string;     // source store / vendor
}

/* Lightweight wardrobe item sent to the agent (no heavy image data). */
export interface WardrobeBrief {
  id: string;
  name: string;
  category: string;
  verdict: string;
  score: number;
}
