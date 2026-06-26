import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, isNextResponse } from "@/lib/auth-middleware";
import { adminDb } from "@/lib/firebase-admin";
import type { ArenaMatch } from "@/lib/arena";

export const runtime = "nodejs";

const COLL = "arena_matches";

/* Leave matchmaking. A still-"waiting" room I host is deleted outright; an
   in-progress match is marked done so the opponent isn't left hanging. */
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (isNextResponse(auth)) return auth;
  const { uid } = auth;

  let body: { matchId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const ref = adminDb().collection(COLL).doc(String(body.matchId || ""));

  try {
    await adminDb().runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists) return;
      const m = s.data() as ArenaMatch;
      if (!m.uids.includes(uid)) return;
      if (m.status === "waiting") tx.delete(ref);
      else if (m.status !== "done") tx.update(ref, { status: "done", abandonedBy: uid });
    });
  } catch (e) {
    console.error("[arena/cancel]", e);
  }
  return NextResponse.json({ ok: true });
}
