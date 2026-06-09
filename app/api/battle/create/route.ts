import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { verifyAuth, isNextResponse } from "@/lib/auth-middleware";
import { adminDb } from "@/lib/firebase-admin";
import { BATTLE_TTL_MS, MIN_OPTIONS, MAX_OPTIONS, BattleOption } from "@/lib/battle";

export const runtime = "nodejs";
export const maxDuration = 30;

// Thumbnails are compressed client-side; keep a ceiling so the battle doc
// stays well under Firestore's 1MB limit even with 4 options + votes.
const MAX_IMG_CHARS = 220_000; // ~160KB of base64

function isImageDataUrl(d: unknown): d is string {
  return typeof d === "string" && /^data:image\/[a-zA-Z0-9.+-]+;base64,.+/.test(d) && d.length <= MAX_IMG_CHARS;
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (isNextResponse(auth)) return auth;
  const { uid } = auth;

  let body: { question?: string; options?: { name?: string; score?: number; image?: string }[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  const question = String(body.question || "").slice(0, 140);
  const options = Array.isArray(body.options) ? body.options : [];
  if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS)
    return NextResponse.json({ error: `Pick ${MIN_OPTIONS}–${MAX_OPTIONS} looks` }, { status: 400 });

  const built: BattleOption[] = [];
  for (let i = 0; i < options.length; i++) {
    const o = options[i];
    if (!isImageDataUrl(o.image))
      return NextResponse.json({ error: "Each look needs a valid image (try smaller photos)" }, { status: 400 });
    built.push({
      id: `o${i + 1}`,
      name: String(o.name || `Look ${i + 1}`).slice(0, 60),
      score: typeof o.score === "number" ? o.score : undefined,
      imageUrl: o.image, // data URL stored inline (Firestore-embedded thumbnail)
      votes: 0,
      reactions: {},
    });
  }

  const battleId = randomUUID().replace(/-/g, "").slice(0, 10);
  const now = Date.now();
  try {
    await adminDb().collection("battles").doc(battleId).set({
      id: battleId,
      ownerUid: uid,
      question,
      options: built,
      totalVotes: 0,
      createdAt: now,
      expiresAt: now + BATTLE_TTL_MS,
      voters: {},
    });
  } catch (e) {
    console.error("[battle/create] firestore write failed", e);
    return NextResponse.json({ error: "Could not save battle" }, { status: 500 });
  }

  return NextResponse.json({ id: battleId, url: `${req.nextUrl.origin}/b/${battleId}` });
}
