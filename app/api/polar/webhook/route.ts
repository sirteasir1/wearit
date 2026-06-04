import { Webhooks } from "@polar-sh/nextjs";
import { adminDb } from "@/lib/firebase-admin";

const PRO_CREDITS = 40; // keep in sync with PRO_MONTHLY in lib/store.ts

/* Find the Firebase uid we attached at checkout (customerExternalId / metadata). */
function uidFrom(data: unknown): string | null {
  const d = data as { customer?: { externalId?: string }; metadata?: Record<string, string>; customerExternalId?: string };
  return d?.customer?.externalId || d?.metadata?.uid || d?.customerExternalId || null;
}

async function setPlan(data: unknown, plan: "pro" | "free") {
  const uid = uidFrom(data);
  if (!uid) return;
  try {
    await adminDb().collection("users").doc(uid).set(
      plan === "pro"
        ? { plan: "pro", tryons: 0 }   // reset usage so they get the full Pro allotment
        : { plan: "free" },
      { merge: true }
    );
  } catch (e) {
    console.error("[polar webhook] failed to set plan", e);
  }
}

export const POST = Webhooks({
  webhookSecret: process.env.POLAR_WEBHOOK_SECRET!,
  onSubscriptionActive:     async (p) => setPlan(p.data, "pro"),
  onSubscriptionUncanceled: async (p) => setPlan(p.data, "pro"),
  onSubscriptionRevoked:    async (p) => setPlan(p.data, "free"),
  onOrderPaid:              async (p) => setPlan(p.data, "pro"),
});
