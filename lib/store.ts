"use client";

/* ──────────────────────────────────────────────────────────
   Per-user store. localStorage is a fast cache; the critical
   data (onboarding, measurements, credits, settings) is also
   mirrored to Firestore so it survives localStorage overflow
   and syncs across devices. All Firestore calls fail safely
   (fall back to localStorage) if Firestore isn't reachable.
   ────────────────────────────────────────────────────────── */

import { auth, db } from "./firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

export interface UserProfile {
  onboarded: boolean;
  gender: "female" | "male" | "other" | "";
  heightCm: number | null;
  weightKg: number | null;
  photo: string | null; // resized dataURL
}

export interface WardrobeItem {
  id: string;
  name: string;
  category: "Tops" | "Bottoms" | "One-pieces" | "Other";
  verdict: "buy" | "skip" | "maybe";
  score: number;
  img: string;
  fav: boolean;
  createdAt: number;
}

export const FREE_MONTHLY = 1;          // reverse trial: 1 free try-on (no card), then the paywall
export const PRO_MONTHLY  = 40;         // Pro = 40 credits per paid cycle

export const emptyProfile: UserProfile = {
  onboarded: false,
  gender: "",
  heightCm: null,
  weightKg: null,
  photo: null,
};

const PROFILE_KEY  = (uid: string) => `wearit:profile:${uid}`;
const WARDROBE_KEY = (uid: string) => `wearit:wardrobe:${uid}`;
const TRYON_KEY    = (uid: string) => `wearit:tryons:${uid}`;

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, val: unknown) {
  if (typeof window === "undefined") return;
  const data = JSON.stringify(val);
  try {
    localStorage.setItem(key, data);
    return;
  } catch {
    // Out of space — free room by trimming saved wardrobe images, then retry once
    // so that critical small keys (onboarded flag, credits) ALWAYS persist.
    try {
      pruneStorage();
      localStorage.setItem(key, data);
    } catch {
      /* give up silently */
    }
  }
}

/* Keep only the newest wardrobe items so a few big looks can't fill the quota
   and block the small profile/credits writes. */
function pruneStorage() {
  if (typeof window === "undefined") return;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith("wearit:wardrobe:")) continue;
      const items = JSON.parse(localStorage.getItem(k) || "[]");
      if (Array.isArray(items) && items.length > 8) {
        localStorage.setItem(k, JSON.stringify(items.slice(0, 8)));
      }
    }
  } catch {
    /* ignore */
  }
}

/* ── Firestore mirror (source of truth for the small critical data) ── */
const userRef = (uid: string) => doc(db, "users", uid);

async function saveUserDoc(uid: string, data: Record<string, unknown>) {
  try { await setDoc(userRef(uid), data, { merge: true }); } catch { /* offline / not enabled */ }
}

function remoteProfilePayload(p: UserProfile): Record<string, unknown> {
  const out: Record<string, unknown> = {
    onboarded: !!p.onboarded,
    gender: p.gender || "",
    heightCm: p.heightCm ?? null,
    weightKg: p.weightKg ?? null,
  };
  // keep the Firestore doc safely under the 1MB limit
  if (p.photo && p.photo.length < 700_000) out.photo = p.photo;
  return out;
}

/* Pull the remote doc into the local cache (call once after auth resolves).
   Remote wins for profile/settings; for credits we keep the higher count so
   usage is never under-counted. */
export async function pullRemote(uid: string): Promise<void> {
  let snap;
  try { snap = await getDoc(userRef(uid)); } catch { return; }
  if (!snap || !snap.exists()) return;
  const r = snap.data() as Record<string, unknown>;

  const localP = getProfile(uid);
  const merged: UserProfile = {
    onboarded: typeof r.onboarded === "boolean" ? r.onboarded : localP.onboarded,
    gender: (r.gender as UserProfile["gender"]) ?? localP.gender,
    heightCm: (r.heightCm as number | null) ?? localP.heightCm,
    weightKg: (r.weightKg as number | null) ?? localP.weightKg,
    photo: (r.photo as string | null) ?? localP.photo,
  };
  write(PROFILE_KEY(uid), merged);

  if (typeof r.tryons === "number") {
    write(TRYON_KEY(uid), Math.max(getTryOns(uid), r.tryons));
  }
  if (typeof r.bonusCredits === "number") {
    write(BONUS_KEY(uid), Math.max(getBonusCredits(uid), r.bonusCredits));
  }
  if (typeof r.referralCount === "number") {
    write(REFCOUNT_KEY(uid), Math.max(getReferralCount(uid), r.referralCount));
  }
  if (r.plan === "pro" || r.plan === "free" || r.plan === "trial" || r.plan === "weekly") {
    write(PLAN_KEY(uid), r.plan);
  }
  if (r.style && typeof r.style === "object") {
    write(STYLE_KEY(uid), r.style);
  }
  if (r.settings && typeof r.settings === "object") {
    write(SETTINGS_KEY(uid), { ...defaultSettings, ...(r.settings as object) });
  }
}

/* Profile */
export function getProfile(uid: string): UserProfile {
  return { ...emptyProfile, ...read<UserProfile>(PROFILE_KEY(uid), emptyProfile) };
}
export function saveProfile(uid: string, p: UserProfile) {
  write(PROFILE_KEY(uid), p);
  void saveUserDoc(uid, remoteProfilePayload(p));   // mirror to Firestore
}

/* Wardrobe */
export function getWardrobe(uid: string): WardrobeItem[] {
  return read<WardrobeItem[]>(WARDROBE_KEY(uid), []);
}
export function saveWardrobe(uid: string, items: WardrobeItem[]) {
  write(WARDROBE_KEY(uid), items);
}
export function addWardrobeItem(uid: string, item: WardrobeItem) {
  const items = getWardrobe(uid);
  items.unshift(item);
  saveWardrobe(uid, items);
  return items;
}
export function removeWardrobeItem(uid: string, id: string) {
  const items = getWardrobe(uid).filter((i) => i.id !== id);
  saveWardrobe(uid, items);
  return items;
}

/* Settings (toggles) */
export interface UserSettings {
  notifications: boolean;
  improveAI: boolean;
  publicProfile: boolean;
}
const SETTINGS_KEY = (uid: string) => `wearit:settings:${uid}`;
export const defaultSettings: UserSettings = { notifications: true, improveAI: true, publicProfile: false };
export function getSettings(uid: string): UserSettings {
  return { ...defaultSettings, ...read<UserSettings>(SETTINGS_KEY(uid), defaultSettings) };
}
export function saveSettings(uid: string, s: UserSettings) {
  write(SETTINGS_KEY(uid), s);
  void saveUserDoc(uid, { settings: s });
}

/* Learned style profile — the agent's memory of the user's taste */
export interface StyleProfile {
  summary: string;     // 1–2 sentences, in 2nd person
  tags: string[];      // e.g. ["minimal", "neutral palette", "relaxed fit"]
  updatedAt: number;
  basedOn: number;     // how many wardrobe items it was learned from
}
const STYLE_KEY = (uid: string) => `wearit:style:${uid}`;
export function getStyleProfile(uid: string): StyleProfile | null {
  return read<StyleProfile | null>(STYLE_KEY(uid), null);
}
export function saveStyleProfile(uid: string, s: StyleProfile) {
  write(STYLE_KEY(uid), s);
  void saveUserDoc(uid, { style: s });
}

/* Plan + credits.
   Credits are an accumulating balance: everyone starts with FREE_MONTHLY base
   credits, and each Pro payment adds PRO_MONTHLY bonus credits on top (granted
   server-side by the Polar webhook). Remaining = base + bonus − used.
   Both bonus and tryons only ever grow, so they merge safely via Math.max. */
export type Plan = "free" | "trial" | "weekly" | "pro";
const PLAN_KEY  = (uid: string) => `wearit:plan:${uid}`;
const BONUS_KEY = (uid: string) => `wearit:bonus:${uid}`;
export function getPlan(uid: string): Plan {
  return read<Plan>(PLAN_KEY(uid), "free");
}
/* Pro-only features (e.g. the AI stylist) are locked during the trial. */
export function isPro(uid: string): boolean {
  return getPlan(uid) === "pro";
}

/* ── Referrals ──────────────────────────────────────────────
   A referral link is /signup?ref=<referrerUid>. The code is stashed here at
   signup and claimed once the new user is authenticated; the server grants
   credits to BOTH sides and marks the referee so it can never be claimed twice. */
export const REFERRAL_REWARD    = 3; // credits the referrer earns per milestone — keep in sync with the claim route
export const REFERRAL_MILESTONE = 5; // ...every Nth friend who joins

const REF_KEY      = "wearit:ref";
const REFCOUNT_KEY = (uid: string) => `wearit:refcount:${uid}`;
export function getReferralCount(uid: string): number {
  return read<number>(REFCOUNT_KEY(uid), 0);
}
export function setPendingReferral(code: string) {
  if (typeof window === "undefined" || !code) return;
  try { localStorage.setItem(REF_KEY, code); } catch { /* ignore */ }
}
export function getPendingReferral(): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(REF_KEY); } catch { return null; }
}
function clearPendingReferral() {
  try { localStorage.removeItem(REF_KEY); } catch { /* ignore */ }
}
/* Claim any pending referral for this user. The referee earns nothing (only the
   referrer is rewarded, server-side) — this just records the join. Safe to call
   on every load: it no-ops without a pending code, clears the code on any
   definitive answer (joined / invalid / already), and only retries on network
   errors. Returns true when the join was newly recorded. */
export async function claimPendingReferral(uid: string): Promise<boolean> {
  const code = getPendingReferral();
  if (!code || code === uid) { clearPendingReferral(); return false; }
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return false; // not ready yet — keep the code, try again next load
    const r = await fetch("/api/referral/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ref: code }),
    });
    if (r.status >= 500) return false; // server hiccup — keep the code for a retry
    clearPendingReferral();
    const d = await r.json().catch(() => ({} as { joined?: boolean }));
    return !!d.joined;
  } catch {
    return false; // network error — keep the code
  }
}
/* Purchased credits granted on top of the free base (0 for never-paid users). */
export function getBonusCredits(uid: string): number {
  return read<number>(BONUS_KEY(uid), 0);
}
/* Total credits ever available to the user (free base + everything purchased). */
export function creditTotal(uid: string): number {
  return FREE_MONTHLY + getBonusCredits(uid);
}
/* Credits the user can still spend right now. */
export function creditsRemaining(uid: string): number {
  return Math.max(0, creditTotal(uid) - getTryOns(uid));
}

/* Try-on counter */
export function getTryOns(uid: string): number {
  return read<number>(TRYON_KEY(uid), 0);
}
export function incTryOns(uid: string, by = 1): number {
  const n = getTryOns(uid) + Math.max(1, by);
  write(TRYON_KEY(uid), n);
  void saveUserDoc(uid, { tryons: n });
  return n;
}

/* Resize an image File down to a dataURL safe for localStorage */
export function fileToResizedDataURL(file: File, maxDim = 1024, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode failed"));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no canvas"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/* Downscale a dataURL to a small thumbnail (keeps localStorage tiny). */
export function dataURLToThumb(dataUrl: string, maxDim = 520, quality = 0.7): Promise<string> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") { resolve(dataUrl); return; }
    const img = new Image();
    img.onerror = () => resolve(dataUrl);
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(dataUrl);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch { resolve(dataUrl); }
    };
    img.src = dataUrl;
  });
}

/* Convert a dataURL back into a File (for sending to the try-on API) */
export async function dataURLToFile(dataURL: string, name = "photo.jpg"): Promise<File> {
  const res = await fetch(dataURL);
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type || "image/jpeg" });
}
