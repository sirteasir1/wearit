import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { verifyAuth, isNextResponse } from "@/lib/auth-middleware";
import { adminDb, adminBucket } from "@/lib/firebase-admin";
import { BATTLE_TTL_MS, MIN_OPTIONS, MAX_OPTIONS, BattleOption } from "@/lib/battle";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_IMG_BYTES = 3 * 1024 * 1024;

function decodeDataUrl(d: unknown): { buf: Buffer; ct: string; ext: string } | null {
  if (typeof d !== "string") return null;
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(d);
  if (!m) return null;
  const buf = Buffer.from(m[2], "base64");
  if (buf.byteLength === 0 || buf.byteLength > MAX_IMG_BYTES) return null;
  return { buf, ct: m[1], ext: m[1].includes("png") ? "png" : m[1].includes("webp") ? "webp" : "jpg" };
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

  const battleId = randomUUID().replace(/-/g, "").slice(0, 10);
  const bucket = adminBucket();

  const built: BattleOption[] = [];
  for (let i = 0; i < options.length; i++) {
    const o = options[i];
    const dec = decodeDataUrl(o.image);
    if (!dec) return NextResponse.json({ error: "Each look needs a valid image (max 3MB)" }, { status: 400 });

    const optId = `o${i + 1}`;
    const path = `battles/${battleId}/${optId}.${dec.ext}`;
    const token = randomUUID();
    try {
      await bucket.file(path).save(dec.buf, {
        resumable: false,
        metadata: { contentType: dec.ct, metadata: { firebaseStorageDownloadTokens: token } },
      });
    } catch (e) {
      console.error("[battle/create] upload failed", e);
      return NextResponse.json({ error: "Could not store images" }, { status: 500 });
    }
    const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
    built.push({
      id: optId,
      name: String(o.name || `Look ${i + 1}`).slice(0, 60),
      score: typeof o.score === "number" ? o.score : undefined,
      imageUrl,
      votes: 0,
      reactions: {},
    });
  }

  const now = Date.now();
  const doc = {
    id: battleId,
    ownerUid: uid,
    question,
    options: built,
    totalVotes: 0,
    createdAt: now,
    expiresAt: now + BATTLE_TTL_MS,
    voters: {},
  };
  try {
    await adminDb().collection("battles").doc(battleId).set(doc);
  } catch (e) {
    console.error("[battle/create] firestore write failed", e);
    return NextResponse.json({ error: "Could not save battle" }, { status: 500 });
  }

  return NextResponse.json({ id: battleId, url: `${req.nextUrl.origin}/b/${battleId}` });
}
