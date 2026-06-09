/* Outfit Battle — shared types + client helpers.
   A battle is a public poll: 2–4 looks the owner is deciding between, that
   friends vote on with one tap (no account needed). */

export const REACTIONS = ["🔥", "😍", "💀", "😐"] as const;
export type Reaction = (typeof REACTIONS)[number];

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 4;
export const BATTLE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export interface BattleOption {
  id: string;
  name: string;
  score?: number;
  imageUrl: string;
  votes: number;
  reactions: Record<string, number>;
}

export interface Battle {
  id: string;
  ownerUid: string;
  question: string;
  options: BattleOption[];
  totalVotes: number;
  createdAt: number;
  expiresAt: number;
}

/* What the public GET returns — never leaks the per-voter map. */
export interface BattlePublic extends Battle {
  myVote: string | null;       // optionId this device already picked, if any
  closed: boolean;
}

/* Raw stored doc — includes the private per-voter map. Server-only shape. */
export interface BattleDoc extends Battle {
  voters?: Record<string, { optionId: string; reaction?: string | null; ts: number }>;
}

/* Strip the voter map and annotate this device's prior vote / closed state. */
export function toPublic(b: BattleDoc, device: string): BattlePublic {
  const v = b.voters || {};
  return {
    id: b.id,
    ownerUid: b.ownerUid,
    question: b.question,
    options: b.options,
    totalVotes: b.totalVotes,
    createdAt: b.createdAt,
    expiresAt: b.expiresAt,
    myVote: device && v[device] ? v[device].optionId : null,
    closed: Date.now() > b.expiresAt,
  };
}

/* A stable anonymous id for this browser, so one device = one vote. */
export function deviceId(): string {
  if (typeof window === "undefined") return "";
  const KEY = "wearit:device";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(KEY, id);
  }
  return id;
}

export interface NewOption { name: string; score?: number; image: string } // image = dataURL

export async function createBattle(
  token: string,
  payload: { question: string; options: NewOption[] }
): Promise<{ id: string; url: string }> {
  const r = await fetch("/api/battle/create", {
    method: "POST",
    headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Failed to create battle");
  return d;
}

export async function fetchBattle(id: string, device: string, light = false): Promise<BattlePublic> {
  const q = `device=${encodeURIComponent(device)}${light ? "&light=1" : ""}`;
  const r = await fetch(`/api/battle/${id}?${q}`, { cache: "no-store" });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Battle not found");
  return d;
}

export async function castVote(
  id: string,
  optionId: string,
  reaction: Reaction | null,
  device: string
): Promise<BattlePublic> {
  const r = await fetch(`/api/battle/${id}/vote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ optionId, reaction, device }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Vote failed");
  return d;
}

export async function fetchMyBattles(token: string): Promise<Battle[]> {
  const r = await fetch("/api/battle/mine", {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Failed");
  return d.battles;
}
