import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { toPublic, BattleDoc } from "@/lib/battle";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const snap = await adminDb().collection("battles").doc(id).get();
  if (!snap.exists) return NextResponse.json({ error: "Battle not found" }, { status: 404 });

  const device = req.nextUrl.searchParams.get("device") || "";
  return NextResponse.json(toPublic(snap.data() as BattleDoc, device));
}
