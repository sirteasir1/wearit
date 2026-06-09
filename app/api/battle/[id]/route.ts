import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { toPublic, BattleDoc } from "@/lib/battle";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const snap = await adminDb().collection("battles").doc(id).get();
  if (!snap.exists) return NextResponse.json({ error: "Battle not found" }, { status: 404 });

  const device = req.nextUrl.searchParams.get("device") || "";
  const pub = toPublic(snap.data() as BattleDoc, device);

  // Polling clients pass ?light=1 — drop the inline image data (already cached
  // from the first load) so refreshes only carry vote counts.
  if (req.nextUrl.searchParams.get("light")) {
    pub.options = pub.options.map((o) => ({ ...o, imageUrl: "" }));
  }
  return NextResponse.json(pub);
}
