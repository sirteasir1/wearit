import { Webhooks } from "@polar-sh/nextjs";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";

const PRO_CREDITS   = 40; // credits granted per PAID Pro cycle — keep in sync with PRO_MONTHLY in lib/store.ts
const TRIAL_CREDITS = 3;  // credits handed out once when a free trial begins (no payment yet)

type PlanFlag = "pro" | "trial" | "free";

/* Find the Firebase uid we attached at checkout (customerExternalId / metadata). */
function uidFrom(data: unknown): string | null {
  const d = data as { customer?: { externalId?: string }; metadata?: Record<string, string>; customerExternalId?: string };
  return d?.customer?.externalId || d?.metadata?.uid || d?.customerExternalId || null;
}

/* Map a subscription status to our plan flag. "trialing" is its own state so the
   app can give the trial a limited feature set; only a paid "active" sub is Pro. */
function planForStatus(status?: string): PlanFlag {
  if (status === "trialing") return "trial";
  if (status === "active")   return "pro";
  return "free";
}

/* Flip the plan flag without touching credits. */
async function setPlan(data: unknown, plan: PlanFlag) {
  const uid = uidFrom(data);
  if (!uid) return;
  try {
    await adminDb().collection("users").doc(uid).set({ plan }, { merge: true });
  } catch (e) {
    console.error("[polar webhook] failed to set plan", e);
  }
}

/* Seed the one-off trial credits the first time a subscription enters "trialing".
   Idempotent per subscription id, so repeated subscription.updated events (or Polar
   retries) can never grant the trial bundle twice. */
async function grantTrialCredits(data: unknown) {
  const uid = uidFrom(data);
  const subId = (data as { id?: string })?.id;
  if (!uid || !subId) return;
  const db = adminDb();
  try {
    await db.runTransaction(async (tx) => {
      const markerRef = db.collection("polar_trial_subs").doc(subId);
      if ((await tx.get(markerRef)).exists) return; // already granted for this trial
      tx.set(markerRef, { uid, grantedAt: FieldValue.serverTimestamp(), credits: TRIAL_CREDITS });
      tx.set(
        db.collection("users").doc(uid),
        { plan: "trial", bonusCredits: FieldValue.increment(TRIAL_CREDITS) },
        { merge: true }
      );
    });
  } catch (e) {
    console.error("[polar webhook] failed to grant trial credits", e);
  }
}

/* Keep the plan flag in sync with the subscription status, and seed trial credits
   the moment a trial starts. The paid 40-credit grant is handled by order.paid. */
async function syncFromSubscription(data: unknown) {
  const plan = planForStatus((data as { status?: string })?.status);
  await setPlan(data, plan);
  if (plan === "trial") await grantTrialCredits(data);
}

/* Add PRO_CREDITS to the user's accumulating balance, once per PAID order. A trial
   start can emit a $0 order — we skip those (totalAmount <= 0) so a trial only ever
   gets TRIAL_CREDITS; the 40 land on the first real charge and on every renewal.
   The marker is written in the same transaction as the grant, so Polar retries and
   manual redeliveries can never double-credit. */
async function grantCreditsForOrder(data: unknown) {
  const total = (data as { totalAmount?: number })?.totalAmount ?? 0;
  if (total <= 0) return; // $0 trial order — credits handled by grantTrialCredits
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
      if ((await tx.get(markerRef)).exists) return; // already granted for this order
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
  // Credits: every PAID charge (first real payment + each renewal) grants +PRO_CREDITS.
  onOrderPaid:              async (p) => grantCreditsForOrder(p.data),
  // Plan flag + trial seeding — kept in sync with the subscription's status.
  onSubscriptionCreated:    async (p) => syncFromSubscription(p.data),
  onSubscriptionUpdated:    async (p) => syncFromSubscription(p.data),
  onSubscriptionActive:     async (p) => setPlan(p.data, "pro"),
  onSubscriptionUncanceled: async (p) => syncFromSubscription(p.data),
  onSubscriptionRevoked:    async (p) => setPlan(p.data, "free"),
});
