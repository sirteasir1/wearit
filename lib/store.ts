"use client";

/* ──────────────────────────────────────────────────────────
   Lightweight, localStorage-backed per-user store.
   Everything starts empty / at zero for a fresh account.
   ────────────────────────────────────────────────────────── */

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

export const FREE_MONTHLY = 4;          // free credits (1 credit = 1 generation)
export const PRO_MONTHLY  = 40;         // Pro = 10× the free plan

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
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* quota — ignore */
  }
}

/* Profile */
export function getProfile(uid: string): UserProfile {
  return { ...emptyProfile, ...read<UserProfile>(PROFILE_KEY(uid), emptyProfile) };
}
export function saveProfile(uid: string, p: UserProfile) {
  write(PROFILE_KEY(uid), p);
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
}

/* Try-on counter */
export function getTryOns(uid: string): number {
  return read<number>(TRYON_KEY(uid), 0);
}
export function incTryOns(uid: string): number {
  const n = getTryOns(uid) + 1;
  write(TRYON_KEY(uid), n);
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

/* Convert a dataURL back into a File (for sending to the try-on API) */
export async function dataURLToFile(dataURL: string, name = "photo.jpg"): Promise<File> {
  const res = await fetch(dataURL);
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type || "image/jpeg" });
}
