import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, isNextResponse } from "@/lib/auth-middleware";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

const REFERRAL_REWARD    = 3; // credits granted to the REFERRER per milestone
const REFERRAL_MILESTONE = 5; // ...every Nth successful referral (3 credits per 5 friends)

/* Record a referral for the authenticated (new) user. The referee gets nothing —
   only the referrer earns, +REFERRAL_REWARD credits for every REFERRAL_MILESTONE
   friends who join. Idempotent: the join is only counted if the referee has no
   `referredBy` yet, set in the same transaction, so retries can't inflate the
   referrer's count. Self- and unknown-referrer claims are rejected. */
export async function POST(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (isNextResponse(authResult)) return authResult;
  const { uid } = authResult;

  const body = await req.json().catch(() => ({}));
  const ref = typeof body.ref === "string" ? body.ref.trim() : "";
  if (!ref || ref === uid) {
    return NextResponse.json({ joined: false, reason: "invalid" }, { status: 400 });
  }

  const db = adminDb();
  try {
    const result = await db.runTransaction(async (tx) => {
      const refereeRef  = db.collection("users").doc(uid);
      const referrerRef = db.collection("users").doc(ref);
      const refereeSnap  = await tx.get(refereeRef);
      const referrerSnap = await tx.get(referrerRef);

      // Already counted — no-op.
      if (refereeSnap.exists && refereeSnap.data()?.referredBy) {
        return { joined: false, reason: "already" };
      }
      // Referrer must be a real, different account.
      if (!referrerSnap.exists) {
        return { joined: false, reason: "no_referrer" };
      }

      const newCount = (referrerSnap.data()?.referralCount ?? 0) + 1;
      const hitMilestone = newCount % REFERRAL_MILESTONE === 0;

      // Referee: only mark the join (no credits).
      tx.set(refereeRef, {
        referredBy: ref,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      // Referrer: bump the count, and reward every Nth friend.
      tx.set(referrerRef, {
        referralCount: newCount,
        ...(hitMilestone ? { bonusCredits: FieldValue.increment(REFERRAL_REWARD) } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      return { joined: true, referrerRewarded: hitMilestone };
    });

    const status = result.reason === "no_referrer" ? 404 : 200;
    return NextResponse.json(result, { status });
  } catch (e) {
    console.error("[referral/claim]", e);
    return NextResponse.json({ joined: false, reason: "error" }, { status: 500 });
  }
}
