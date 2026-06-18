import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, isNextResponse } from "@/lib/auth-middleware";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

const REFERRAL_CREDITS = 3; // granted to BOTH the referrer and the new user, once per referee

/* Claim a referral for the authenticated (new) user. Idempotent: the grant only
   happens if the referee has no `referredBy` yet, and setting it in the same
   transaction means repeated calls / retries can never double-credit. Self- and
   unknown-referrer claims are rejected without granting. */
export async function POST(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (isNextResponse(authResult)) return authResult;
  const { uid } = authResult;

  const body = await req.json().catch(() => ({}));
  const ref = typeof body.ref === "string" ? body.ref.trim() : "";
  if (!ref || ref === uid) {
    return NextResponse.json({ credited: false, reason: "invalid" }, { status: 400 });
  }

  const db = adminDb();
  try {
    const result = await db.runTransaction(async (tx) => {
      const refereeRef  = db.collection("users").doc(uid);
      const referrerRef = db.collection("users").doc(ref);
      const refereeSnap  = await tx.get(refereeRef);
      const referrerSnap = await tx.get(referrerRef);

      // Already claimed a referral — no-op.
      if (refereeSnap.exists && refereeSnap.data()?.referredBy) {
        return { credited: false, reason: "already", bonusCredits: refereeSnap.data()?.bonusCredits ?? 0 };
      }
      // Referrer must be a real, different account.
      if (!referrerSnap.exists) {
        return { credited: false, reason: "no_referrer" };
      }

      tx.set(refereeRef, {
        referredBy: ref,
        bonusCredits: FieldValue.increment(REFERRAL_CREDITS),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      tx.set(referrerRef, {
        bonusCredits: FieldValue.increment(REFERRAL_CREDITS),
        referralCount: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      const prev = (refereeSnap.exists ? refereeSnap.data()?.bonusCredits : 0) ?? 0;
      return { credited: true, bonusCredits: prev + REFERRAL_CREDITS };
    });

    const status = result.reason === "no_referrer" ? 404 : 200;
    return NextResponse.json(result, { status });
  } catch (e) {
    console.error("[referral/claim]", e);
    return NextResponse.json({ credited: false, reason: "error" }, { status: 500 });
  }
}
