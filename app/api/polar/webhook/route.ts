import { Webhooks } from "@polar-sh/nextjs";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";

const PRO_CREDITS = 40; // credits granted per paid Pro cycle — keep in sync with PRO_MONTHLY in lib/store.ts

/* Find the Firebase uid we attached at checkout (customerExternalId / metadata). */
function uidFrom(data: unknown): string | null {
  const d = data as { customer?: { externalId?: string }; metadata?: Record<string, string>; customerExternalId?: string };
  return d?.customer?.externalId || d?.metadata?.uid || d?.customerExternalId || null;
}

/* Flip the plan flag without touching credits. */
async function setPlan(data: unknown, plan: "pro" | "free") {
  const uid = uidFrom(data);
  if (!uid) return;
  try {
    await adminDb().collection("users").doc(uid).set({ plan }, { merge: true });
  } catch (e) {
    console.error("[polar webhook] failed to set plan", e);
  }
}

// Statuses that should unlock Pro (a trial counts — the user has access).
const PRO_STATUSES = new Set(["trialing", "active"]);

/* Grant/revoke the Pro flag based on the subscription's current status, so a
   trial (status "trialing") still unlocks Pro. Credits are handled separately
   by order.paid, which fires for the first charge and every renewal. */
async function syncFromSubscription(data: unknown) {
  const status = (data as { status?: string })?.status;
  await setPlan(data, status && PRO_STATUSES.has(status) ? "pro" : "free");
}

/* Add PRO_CREDITS to the user's accumulating balance, once per paid order.
   Each payment (first charge + monthly renewals) is its own order id; we mark
   it processed inside the same transaction as the grant so Polar retries and
   manual redeliveries can never double-credit. */
async function grantCreditsForOrder(data: unknown) {
  const uid = uidFrom(data);
  const orderId = (data as { id?: string })?.id;
  if (!uid || !orderId) {
    console.error("[polar webhook] order.paid missing uid or order id", { uid, orderId });
    return;
  }
  const db = adminDb();
  try {
    await db.runTransaction(async (tx) => {
      const markerRef = db.collection("polar_processed_orders").doc(orderId);
      const marker = await tx.get(markerRef);
      if (marker.exists) return; // already granted for this order — no-op
      tx.set(markerRef, { uid, grantedAt: FieldValue.serverTimestamp(), credits: PRO_CREDITS });
      tx.set(
        db.collection("users").doc(uid),
        { plan: "pro", bonusCredits: FieldValue.increment(PRO_CREDITS) },
        { merge: true }
      );
    });
  } catch (e) {
    console.error("[polar webhook] failed to grant credits", e);
  }
}

export const POST = Webhooks({
  webhookSecret: process.env.POLAR_WEBHOOK_SECRET!,
  // Credits: every paid charge (first payment and each renewal) grants +PRO_CREDITS.
  onOrderPaid:              async (p) => grantCreditsForOrder(p.data),
  // Plan flag only — keeps the badge/Pro state in sync with the subscription.
  onSubscriptionCreated:    async (p) => syncFromSubscription(p.data),
  onSubscriptionUpdated:    async (p) => syncFromSubscription(p.data),
  onSubscriptionActive:     async (p) => setPlan(p.data, "pro"),
  onSubscriptionUncanceled: async (p) => setPlan(p.data, "pro"),
  onSubscriptionRevoked:    async (p) => setPlan(p.data, "free"),
});
