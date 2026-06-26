import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, isNextResponse } from "@/lib/auth-middleware";
import { adminDb } from "@/lib/firebase-admin";
import { themeById, type ArenaMatch } from "@/lib/arena";
import { judgeBattle } from "@/lib/arena-judge";
import type { Lang } from "@/lib/i18n";

export const runtime = "nodejs";
export const maxDuration = 45;

const COLL = "arena_matches";

/* Run the AI judge for a finished match. Claims the "judging" status in a
   transaction first so only ONE client actually calls Gemini, even though both
   are watching; the loser of the race just reads the verdict from the live doc. */
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (isNextResponse(auth)) return auth;
  const { uid } = auth;

  let body: { matchId?: string; lang?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const lang: Lang = body.lang === "ru" ? "ru" : "en";
  const ref = adminDb().collection(COLL).doc(String(body.matchId || ""));

  // Claim the judging slot.
  let match: ArenaMatch;
  try {
    match = await adminDb().runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists) throw new Error("Match not found");
      const m = s.data() as ArenaMatch;
      if (!m.uids.includes(uid)) throw new Error("Not your match");
      if (m.status !== "judging") throw new Error("__taken__"); // already judged or not ready
      tx.update(ref, { status: "judging", judgingBy: uid });
      return m;
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Judging failed";
    if (msg === "__taken__") return NextResponse.json({ ok: true, alreadyJudging: true });
    return NextResponse.json({ error: msg }, { status: msg.includes("not found") ? 404 : 400 });
  }

  const theme = themeById(match.theme);
  const [aUid, bUid] = match.uids;
  const a = match.players[aUid];
  const b = match.players[bUid];
  if (!theme || !a?.lookUrl || !b?.lookUrl) {
    return NextResponse.json({ error: "Match isn't ready to judge" }, { status: 400 });
  }

  const verdict = await judgeBattle(a.lookUrl, b.lookUrl, theme.brief, lang);
  const winnerUid = verdict.winner === "a" ? aUid : verdict.winner === "b" ? bUid : null;

  try {
    await ref.update({
      status: "done",
      callout: verdict.callout,
      winnerUid,
      [`players.${aUid}.score`]: verdict.a,
      [`players.${bUid}.score`]: verdict.b,
    });
  } catch (e) {
    console.error("[arena/judge] write failed", e);
    return NextResponse.json({ error: "Could not save verdict" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
