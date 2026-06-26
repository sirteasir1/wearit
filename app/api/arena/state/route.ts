import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, isNextResponse } from "@/lib/auth-middleware";
import { adminDb } from "@/lib/firebase-admin";
import { rateLimit } from "@/lib/rate-limit";
import type { ArenaMatch } from "@/lib/arena";

export const runtime = "nodejs";

const COLL = "arena_matches";

/* Poll the live match state. Reads via the Admin SDK so it works regardless of
   client-side Firestore rules — the clients never read the collection directly. */
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (isNextResponse(auth)) return auth;
  const { uid } = auth;

  if (!rateLimit(`arena:state:${uid}`, 90, 60_000).allowed) {
    return NextResponse.json({ error: "Slow down a moment." }, { status: 429 });
  }

  let body: { matchId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  const snap = await adminDb().collection(COLL).doc(String(body.matchId || "")).get();
  if (!snap.exists) return NextResponse.json({ match: null });
  const m = snap.data() as ArenaMatch;
  if (!m.uids?.includes(uid)) return NextResponse.json({ error: "Not your match" }, { status: 403 });
  return NextResponse.json({ match: m });
}
