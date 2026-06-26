import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, isNextResponse } from "@/lib/auth-middleware";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { rateLimit } from "@/lib/rate-limit";
import { generateThemedLook } from "@/lib/vertex-image";
import { themeById } from "@/lib/arena";

export const runtime = "nodejs";
export const maxDuration = 60;

const FREE_BASE = 1; // keep in sync with FREE_MONTHLY in lib/store.ts
const MAX_GARMENTS = 3;

/* Reserve 1 credit atomically BEFORE the (paid) generation — the server balance
   is the source of truth, so the cost can't be bypassed by calling the API. */
async function reserveCredit(uid: string): Promise<{ ok: boolean; remaining: number }> {
  const ref = adminDb().collection("users").doc(uid);
  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.exists ? snap.data()! : {};
    const tryons = typeof d.tryons === "number" ? d.tryons : 0;
    const bonus = typeof d.bonusCredits === "number" ? d.bonusCredits : 0;
    const remaining = Math.max(0, FREE_BASE + bonus - tryons);
    if (remaining < 1) return { ok: false, remaining };
    tx.set(ref, { tryons: tryons + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { ok: true, remaining: remaining - 1 };
  });
}

async function refundCredit(uid: string) {
  try {
    await adminDb().collection("users").doc(uid).set({ tryons: FieldValue.increment(-1) }, { merge: true });
  } catch (e) {
    console.error("[arena/generate] refund failed", e);
  }
}

function splitDataUrl(d: string): { mime: string; data: string } | null {
  const m = typeof d === "string" && d.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return { mime: m[1], data: m[2] };
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (isNextResponse(auth)) return auth;
  const { uid } = auth;

  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`arena:gen:u:${uid}`, 8, 60_000).allowed || !rateLimit(`arena:gen:ip:${ip}`, 12, 60_000).allowed) {
    return NextResponse.json({ error: "Too many requests. Please wait." }, { status: 429 });
  }

  let body: { theme?: string; vibes?: string[]; modelPhoto?: string; garments?: string[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  const theme = themeById(String(body.theme || ""));
  if (!theme) return NextResponse.json({ error: "Unknown theme" }, { status: 400 });

  const person = splitDataUrl(String(body.modelPhoto || ""));
  if (!person) return NextResponse.json({ error: "Add a photo of yourself in your profile first" }, { status: 400 });

  const vibes = Array.isArray(body.vibes) ? body.vibes.slice(0, 4).map((v) => String(v).slice(0, 24)) : [];
  const garments = (Array.isArray(body.garments) ? body.garments : [])
    .slice(0, MAX_GARMENTS)
    .map(splitDataUrl)
    .filter((g): g is { mime: string; data: string } => !!g)
    .map((g) => ({ data: g.data, mime: g.mime }));

  const reservation = await reserveCredit(uid).catch(() => null);
  if (!reservation) return NextResponse.json({ error: "Could not verify credits" }, { status: 500 });
  if (!reservation.ok) return NextResponse.json({ error: "You're out of credits.", remaining: reservation.remaining }, { status: 402 });

  try {
    const image = await generateThemedLook(person.data, person.mime, { brief: theme.brief, vibes, garments });
    return NextResponse.json({ image, remaining: reservation.remaining });
  } catch (err) {
    await refundCredit(uid); // generation failed — don't charge for it
    console.error("[arena/generate]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Generation failed" }, { status: 500 });
  }
}
