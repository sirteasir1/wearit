/* Style Arena — LIVE outfit battles.
   Two players are matched in real time, handed the SAME theme, each builds a look
   (pick a saved look, or generate a fresh one), and an AI judge scores the CLOTHES
   (never the body) and crowns a winner. Match state is a Firestore doc both
   clients watch via onSnapshot, so the battle updates live on both screens. */

import { onSnapshot, doc } from "firebase/firestore";
import { db } from "./firebase";
import type { Lang } from "./i18n";

/* ── Themes ── the shared brief that makes a battle fast AND fair. ── */
export interface Theme {
  id: string;
  emoji: string;
  label: Record<Lang, string>;
  brief: string; // English brief fed to the image model + judge (stable across UI langs)
}

export const THEMES: Theme[] = [
  { id: "rainy-date",  emoji: "☔", label: { en: "Rainy first date",        ru: "Свидание под дождём" },     brief: "a stylish but practical outfit for a first date in the rain" },
  { id: "y2k",         emoji: "💿", label: { en: "Y2K throwback",            ru: "Стиль нулевых" },            brief: "an authentic early-2000s Y2K outfit" },
  { id: "old-money",   emoji: "🥂", label: { en: "Old-money vacation",       ru: "Богатей на отдыхе" },        brief: "a quiet-luxury old-money vacation outfit" },
  { id: "apocalypse",  emoji: "🧟", label: { en: "Zombie office party",      ru: "Корпоратив в апокалипсис" }, brief: "an outfit for an office party during a zombie apocalypse — practical yet dressy" },
  { id: "festival",    emoji: "🎪", label: { en: "Music festival",           ru: "Музыкальный фестиваль" },    brief: "a bold music-festival outfit" },
  { id: "cyberpunk",   emoji: "🌃", label: { en: "Cyberpunk 2099",           ru: "Киберпанк 2099" },           brief: "a futuristic cyberpunk streetwear outfit" },
  { id: "cozy-sunday", emoji: "☕", label: { en: "Cozy Sunday",              ru: "Уютное воскресенье" },       brief: "a cozy, comfortable lazy-Sunday-at-home outfit" },
  { id: "red-carpet",  emoji: "🌟", label: { en: "Red carpet",               ru: "Красная дорожка" },          brief: "a glamorous red-carpet evening look" },
  { id: "streetwear",  emoji: "🛹", label: { en: "Streetwear",               ru: "Уличный стиль" },            brief: "a fresh modern streetwear fit" },
  { id: "gym-fashion", emoji: "💪", label: { en: "Gym but make it fashion",  ru: "Зал, но с понтами" },        brief: "a fashionable athleisure gym outfit that still looks designed" },
  { id: "wedding",     emoji: "💍", label: { en: "Wedding guest",            ru: "Гость на свадьбе" },         brief: "an elegant wedding-guest outfit" },
  { id: "villain",     emoji: "🕶️", label: { en: "Quiet-luxury villain",     ru: "Тихий злодей" },             brief: "a sleek all-black quiet-luxury 'villain' outfit" },
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
  total: number;        // 0–30
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

/* Live subscription to a match doc — drives both players' screens in real time. */
export function subscribeMatch(matchId: string, cb: (m: ArenaMatch | null) => void): () => void {
  return onSnapshot(
    doc(db, "arena_matches", matchId),
    (snap) => cb(snap.exists() ? (snap.data() as ArenaMatch) : null),
    () => cb(null),
  );
}
