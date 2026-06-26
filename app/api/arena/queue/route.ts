import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { verifyAuth, isNextResponse } from "@/lib/auth-middleware";
import { adminDb } from "@/lib/firebase-admin";
import { rateLimit } from "@/lib/rate-limit";
import { themeById, BUILD_SECONDS, type ArenaMatch, type ArenaPlayer } from "@/lib/arena";

export const runtime = "nodejs";

const COLL = "arena_matches";
const STALE_MS = 90_000; // ignore waiting rooms older than this — the host likely left

/* Live matchmaking. Try to JOIN an open room (status "waiting", one player, not
   me, fresh) by claiming it in a transaction; if none can be claimed, OPEN a new
   waiting room seeded with my chosen theme. Both clients then watch the doc. */
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (isNextResponse(auth)) return auth;
  const { uid } = auth;

  if (!rateLimit(`arena:queue:${uid}`, 20, 60_000).allowed) {
    return NextResponse.json({ error: "Slow down a moment." }, { status: 429 });
  }

  let body: { theme?: string; name?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  const myTheme = themeById(String(body.theme || "")) || themeById("streetwear")!;
  const name = String(body.name || "Player").slice(0, 40);
  const db = adminDb();
  const me: ArenaPlayer = { uid, name, ready: false, lookUrl: null, score: null };

  // 1) Look for open rooms to join.
  const fresh = Date.now() - STALE_MS;
  let candidates: string[] = [];
  try {
    const snap = await db.collection(COLL).where("status", "==", "waiting").limit(15).get();
    candidates = snap.docs
      .map((d) => d.data() as ArenaMatch)
      .filter((m) => m.hostUid !== uid && m.createdAt > fresh && (m.uids?.length ?? 0) < 2)
      .map((m) => m.id);
  } catch (e) {
    console.error("[arena/queue] scan failed", e);
  }

  // 2) Try to claim one atomically (another joiner may grab it first → try next).
  for (const id of candidates) {
    const ref = db.collection(COLL).doc(id);
    try {
      const joined = await db.runTransaction(async (tx) => {
        const s = await tx.get(ref);
        if (!s.exists) return false;
        const m = s.data() as ArenaMatch;
        if (m.status !== "waiting" || m.hostUid === uid || (m.uids?.length ?? 0) >= 2) return false;
        tx.update(ref, {
          status: "building",
          uids: [...m.uids, uid],
          [`players.${uid}`]: me,
          buildDeadline: Date.now() + BUILD_SECONDS * 1000,
        });
        return true;
      });
      if (joined) return NextResponse.json({ matchId: id, joined: true });
    } catch { /* contended — try the next candidate */ }
  }

  // 3) No room to join — open my own and wait.
  const id = randomUUID().replace(/-/g, "").slice(0, 12);
  const match: ArenaMatch = {
    id,
    theme: myTheme.id,
    status: "waiting",
    hostUid: uid,
    uids: [uid],
    players: { [uid]: me },
    callout: null,
    winnerUid: null,
    createdAt: Date.now(),
    buildDeadline: null,
  };
  try {
    await db.collection(COLL).doc(id).set(match);
  } catch (e) {
    console.error("[arena/queue] create failed", e);
    return NextResponse.json({ error: "Could not enter matchmaking" }, { status: 500 });
  }
  return NextResponse.json({ matchId: id, joined: false });
}
