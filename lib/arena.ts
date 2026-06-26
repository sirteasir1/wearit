/* Style Arena — LIVE outfit battles.
   Two players are matched in real time, handed the SAME theme, each builds a look
   (pick a saved look, or generate a fresh one), and an AI judge scores the CLOTHES
   (never the body) and crowns a winner. Match state is a Firestore doc both
   clients poll via /api/arena/state, so the battle updates on both screens. */

import type { Lang } from "./i18n";

/* ── Themes ── a tight, punchy set. Each has a one-line VIBE shown on the card
   (no emoji — the typography carries it) and an English BRIEF for the model/judge. */
export interface Theme {
  id: string;
  label: Record<Lang, string>;
  vibe: Record<Lang, string>;
  brief: string;
}

export const THEMES: Theme[] = [
  { id: "met-gala",    label: { en: "Met Gala",     ru: "Мет Гала" },         vibe: { en: "Avant-garde, no rules",   ru: "Авангард без правил" },   brief: "an avant-garde, over-the-top Met Gala red-carpet look that commits to a bold concept" },
  { id: "max-aura",    label: { en: "+1000 Aura",   ru: "+1000 ауры" },       vibe: { en: "All black, pure mystery", ru: "Весь чёрный, загадка" },  brief: "an effortlessly cool outfit radiating maximum 'aura' — mysterious, confident, understated power, mostly black" },
  { id: "mob-wife",    label: { en: "Mob Wife",     ru: "Жена мафии" },       vibe: { en: "Fur, leopard, gold",      ru: "Мех, леопард, золото" },  brief: "a glamorous 'mob wife' aesthetic outfit — faux fur coat, leopard print, gold jewelry, oversized sunglasses" },
  { id: "old-money",   label: { en: "Old Money",    ru: "Старые деньги" },    vibe: { en: "Quiet luxury",            ru: "Тихая роскошь" },         brief: "a quiet-luxury old-money outfit — refined tailoring, neutral palette, understated wealth" },
  { id: "f1-paddock",  label: { en: "F1 Paddock",   ru: "Паддок Ф1" },        vibe: { en: "Race-day luxe",           ru: "Гоночный люкс" },         brief: "a chic, sporty F1 paddock-club race-day outfit — racing-luxe, team colors, cool sunglasses" },
  { id: "brat",        label: { en: "Brat",         ru: "Brat" },             vibe: { en: "Slime-green chaos",       ru: "Кислотный хаос" },        brief: "a 'brat' aesthetic outfit — slime green, lowkey clubby, messy-cool 2000s party energy" },
  { id: "cyberpunk",   label: { en: "Cyberpunk",    ru: "Киберпанк" },        vibe: { en: "Neon dystopia",           ru: "Неоновая дистопия" },     brief: "a futuristic cyberpunk streetwear outfit — neon accents, techwear, dystopian edge" },
  { id: "red-carpet",  label: { en: "Red Carpet",   ru: "Красная дорожка" },  vibe: { en: "Full glamour",            ru: "Полный гламур" },         brief: "a glamorous red-carpet evening look — show-stopping, elegant, photographed" },
  { id: "streetwear",  label: { en: "Streetwear",   ru: "Стритвир" },         vibe: { en: "Hypebeast fits",          ru: "Хайповые сеты" },         brief: "a fresh modern streetwear fit — hyped sneakers, layered, confident street style" },
  { id: "y2k",         label: { en: "Y2K",          ru: "Y2K" },              vibe: { en: "2000s revival",           ru: "Возврат нулевых" },       brief: "an authentic early-2000s Y2K outfit — low-rise, metallics, baby tees, playful" },
  { id: "coquette",    label: { en: "Coquette",     ru: "Кокетка" },          vibe: { en: "Bows & lace",             ru: "Банты и кружево" },       brief: "a coquette-aesthetic outfit — bows, lace, soft pastels, ballet flats, romantic and girly" },
  { id: "gorpcore",    label: { en: "Gorpcore",     ru: "Горпкор" },          vibe: { en: "Techwear outdoors",       ru: "Техно-аутдор" },          brief: "a gorpcore outfit — technical outdoor gear as fashion: fleece, shell jacket, cargo pants, trail sneakers" },
  { id: "rockstar-gf", label: { en: "Rockstar GF",  ru: "Подруга рокзвезды" },vibe: { en: "Leather & grunge",        ru: "Кожа и грандж" },         brief: "a 'rockstar girlfriend' outfit — leather, vintage band tee, fur coat, edgy effortless cool" },
  { id: "villain",     label: { en: "The Villain",  ru: "Злодей" },           vibe: { en: "All-black power",         ru: "Чёрная сила" },           brief: "a sleek all-black quiet-luxury 'villain' outfit — sharp, intimidating, expensive" },
  { id: "festival",    label: { en: "Festival",     ru: "Фестиваль" },        vibe: { en: "Bold & free",             ru: "Смело и свободно" },      brief: "a bold music-festival outfit — expressive, layered, free-spirited" },
  { id: "clean-girl",  label: { en: "Clean Girl",   ru: "Clean girl" },       vibe: { en: "Polished minimal",        ru: "Чистый минимал" },        brief: "a 'clean girl' aesthetic outfit — slicked hair, gold hoops, minimal neutral athleisure, polished and simple" },
];

export function themeById(id: string): Theme | undefined {
  return THEMES.find((t) => t.id === id);
}

/* Quick vibe chips so generating a look is taps, not a blank prompt box. */
export const VIBES: { id: string; label: Record<Lang, string> }[] = [
  { id: "minimal",   label: { en: "Minimal",   ru: "Минимализм" } },
  { id: "bold",      label: { en: "Bold",      ru: "Дерзкий" } },
  { id: "vintage",   label: { en: "Vintage",   ru: "Винтаж" } },
  { id: "luxury",    label: { en: "Luxury",    ru: "Люкс" } },
  { id: "sporty",    label: { en: "Sporty",    ru: "Спорт" } },
  { id: "edgy",      label: { en: "Edgy",      ru: "Острый" } },
  { id: "colorful",  label: { en: "Colorful",  ru: "Цветной" } },
  { id: "monochrome",label: { en: "Monochrome",ru: "Монохром" } },
];

/* Seconds each player gets to build once both are matched. */
export const BUILD_SECONDS = 150;

/* ── Judge result ── per-look axis scores; grades the CLOTHES, never the person. */
export interface LookScore {
  themeFit: number;     // 0–10
  coordination: number; // 0–10
  originality: number;  // 0–10
  total: number;        // 0–100 (overall score)
  roast: string;        // one honest, funny line about the OUTFIT
}

/* Head-to-head judge output (server-side; mapped onto the two players). */
export interface Verdict {
  a: LookScore;
  b: LookScore;
  winner: "a" | "b" | "tie";
  callout: string;
}

/* ── A live match (Firestore doc both players watch) ── */
export type MatchStatus = "waiting" | "building" | "judging" | "done";

export interface ArenaPlayer {
  uid: string;
  name: string;
  ready: boolean;
  lookUrl: string | null;
  score: LookScore | null;
}

export interface ArenaMatch {
  id: string;
  theme: string;
  status: MatchStatus;
  hostUid: string;
  uids: string[];
  players: Record<string, ArenaPlayer>;
  callout: string | null;
  winnerUid: string | null;   // null = tie or not judged yet
  createdAt: number;
  buildDeadline: number | null;
}

/* ── Client helpers ── */

export async function generateLook(
  token: string,
  payload: { theme: string; vibes: string[]; modelPhoto: string; garments?: string[] }
): Promise<{ image: string; remaining: number }> {
  const r = await fetch("/api/arena/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Could not generate look");
  return d;
}

/* Enter matchmaking: join an open match (adopting its theme) or open a new one. */
export async function joinQueue(
  token: string,
  payload: { theme: string; name: string }
): Promise<{ matchId: string; joined: boolean }> {
  const r = await fetch("/api/arena/queue", {
    method: "POST",
    headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Matchmaking failed");
  return d;
}

export async function submitLook(token: string, matchId: string, image: string): Promise<void> {
  const r = await fetch("/api/arena/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ matchId, image }),
  });
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || "Could not submit look"); }
}

export async function triggerJudge(token: string, matchId: string, lang: Lang): Promise<void> {
  const r = await fetch("/api/arena/judge", {
    method: "POST",
    headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ matchId, lang }),
  });
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || "Judging failed"); }
}

export async function leaveMatch(token: string, matchId: string): Promise<void> {
  await fetch("/api/arena/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ matchId }),
  }).catch(() => {});
}

/* Poll the live match state from the server (Admin-read, so it works without any
   client Firestore read rules). Returns null if the match is gone. */
export async function fetchMatchState(token: string, matchId: string): Promise<ArenaMatch | null> {
  const r = await fetch("/api/arena/state", {
    method: "POST",
    headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ matchId }),
    cache: "no-store",
  });
  if (!r.ok) return null;
  const d = await r.json();
  return (d.match as ArenaMatch | null) ?? null;
}
