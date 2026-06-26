import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, isNextResponse } from "@/lib/auth-middleware";
import { adminDb } from "@/lib/firebase-admin";
import { rateLimit } from "@/lib/rate-limit";
import type { ArenaMatch } from "@/lib/arena";

export const runtime = "nodejs";

const COLL = "arena_matches";
const MAX_IMG_CHARS = 240_000; // ~175KB base64 — both looks must fit one match doc

function isImageDataUrl(d: unknown): d is string {
  return typeof d === "string" && /^data:image\/[a-zA-Z0-9.+-]+;base64,.+/.test(d) && d.length <= MAX_IMG_CHARS;
}

/* Lock in my look for this match. When BOTH players are ready, flip the match to
   "judging" so the host's client can call the judge. */
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (isNextResponse(auth)) return auth;
  const { uid } = auth;

  if (!rateLimit(`arena:submit:${uid}`, 20, 60_000).allowed) {
    return NextResponse.json({ error: "Slow down a moment." }, { status: 429 });
  }

  let body: { matchId?: string; image?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  if (!isImageDataUrl(body.image)) {
    return NextResponse.json({ error: "A valid look image is required (try a smaller image)" }, { status: 400 });
  }
  const ref = adminDb().collection(COLL).doc(String(body.matchId || ""));

  try {
    await adminDb().runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists) throw new Error("Match not found");
      const m = s.data() as ArenaMatch;
      if (!m.uids.includes(uid)) throw new Error("Not your match");
      if (m.status !== "building") throw new Error("This match isn't accepting looks");

      const players = { ...m.players };
      players[uid] = { ...players[uid], lookUrl: body.image!, ready: true };
      const bothReady = m.uids.length === 2 && m.uids.every((u) => players[u]?.ready);

      tx.update(ref, {
        [`players.${uid}.lookUrl`]: body.image!,
        [`players.${uid}.ready`]: true,
        ...(bothReady ? { status: "judging" } : {}),
      });
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not submit look";
    const code = msg.includes("not found") ? 404 : msg.includes("Not your") ? 403 : 400;
    return NextResponse.json({ error: msg }, { status: code });
  }

  return NextResponse.json({ ok: true });
}
