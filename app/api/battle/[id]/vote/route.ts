import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { toPublic, BattleDoc, REACTIONS } from "@/lib/battle";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  let body: { optionId?: string; reaction?: string | null; device?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  const optionId = String(body.optionId || "");
  const device = String(body.device || "");
  const reaction = body.reaction && (REACTIONS as readonly string[]).includes(body.reaction) ? body.reaction : null;
  if (!device || !optionId) return NextResponse.json({ error: "Missing vote" }, { status: 400 });

  const ref = adminDb().collection("battles").doc(id);
  try {
    const updated = await adminDb().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("not_found");
      const b = snap.data() as BattleDoc;
      if (Date.now() > b.expiresAt) throw new Error("closed");

      const voters = b.voters || {};
      if (voters[device]) return b; // already voted — idempotent no-op

      const opt = b.options.find((o) => o.id === optionId);
      if (!opt) throw new Error("bad_option");

      opt.votes = (opt.votes || 0) + 1;
      if (reaction) {
        opt.reactions = opt.reactions || {};
        opt.reactions[reaction] = (opt.reactions[reaction] || 0) + 1;
      }
      voters[device] = { optionId, reaction, ts: Date.now() };
      b.voters = voters;
      b.totalVotes = (b.totalVotes || 0) + 1;

      tx.update(ref, { options: b.options, voters, totalVotes: b.totalVotes });
      return b;
    });

    return NextResponse.json(toPublic(updated, device));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    if (msg === "not_found") return NextResponse.json({ error: "Battle not found" }, { status: 404 });
    if (msg === "closed") return NextResponse.json({ error: "This battle has ended" }, { status: 410 });
    if (msg === "bad_option") return NextResponse.json({ error: "Unknown option" }, { status: 400 });
    console.error("[battle/vote] failed", e);
    return NextResponse.json({ error: "Vote failed" }, { status: 500 });
  }
}
