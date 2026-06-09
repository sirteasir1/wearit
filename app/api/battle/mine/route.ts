import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, isNextResponse } from "@/lib/auth-middleware";
import { adminDb } from "@/lib/firebase-admin";
import { BattleDoc } from "@/lib/battle";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (isNextResponse(auth)) return auth;

  // Single-field filter only (no composite index needed); sort in memory.
  const snap = await adminDb()
    .collection("battles")
    .where("ownerUid", "==", auth.uid)
    .limit(50)
    .get();

  const battles = snap.docs
    .map((d) => {
      const b = d.data() as BattleDoc;
      return {
        id: b.id,
        ownerUid: b.ownerUid,
        question: b.question,
        options: b.options,
        totalVotes: b.totalVotes,
        createdAt: b.createdAt,
        expiresAt: b.expiresAt,
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);

  return NextResponse.json({ battles });
}
