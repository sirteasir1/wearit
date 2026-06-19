import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { verifyAuth, isNextResponse } from "@/lib/auth-middleware";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { runTryOnFromBuffers } from "@/lib/google-tryon";
import { getStyleAdvice } from "@/lib/gemini-stylist";

// Up to 4 garments are layered sequentially (~12s each) — allow a generous budget.
export const maxDuration = 120;

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const FREE_BASE = 1; // free credits everyone starts with — keep in sync with FREE_MONTHLY in lib/store.ts

/* Reserve `cost` credits for this user atomically, BEFORE the (expensive)
   generation runs. The balance is the server's source of truth — never the
   client — so the credit limit can't be bypassed by calling the API directly. */
async function reserveCredits(uid: string, cost: number): Promise<{ ok: boolean; remaining: number }> {
  const db = adminDb();
  const ref = db.collection("users").doc(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.exists ? snap.data()! : {};
    const tryons = typeof d.tryons === "number" ? d.tryons : 0;
    const bonus  = typeof d.bonusCredits === "number" ? d.bonusCredits : 0;
    const remaining = Math.max(0, FREE_BASE + bonus - tryons);
    if (remaining < cost) return { ok: false, remaining };
    tx.set(ref, { tryons: tryons + cost, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { ok: true, remaining: remaining - cost };
  });
}

/* Give the credits back if the generation failed — never charge for a broken result. */
async function refundCredits(uid: string, cost: number) {
  try {
    await adminDb().collection("users").doc(uid).set(
      { tryons: FieldValue.increment(-cost) }, { merge: true }
    );
  } catch (e) {
    console.error("[tryon-demo] refund failed", e);
  }
}

export async function POST(request: NextRequest) {
  // 1) Auth — only signed-in users, tied to a uid we can bill against.
  const authResult = await verifyAuth(request);
  if (isNextResponse(authResult)) return authResult;
  const { uid } = authResult;

  // 2) Anti-burst rate limits (per user AND per IP), on top of the credit cap.
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`demo:u:${uid}`, 8, 60_000).allowed || !rateLimit(`demo:ip:${ip}`, 12, 60_000).allowed) {
    return NextResponse.json({ error: "Too many requests. Please wait." }, { status: 429 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const modelImage = formData.get("modelImage") as File | null;
  // Accept one OR many garments. getAll preserves append order, and the
  // matching category list is appended in lockstep on the client.
  const garmentFiles = formData.getAll("garmentImage").filter((g): g is File => g instanceof File);
  const categories = formData.getAll("category").map(String);

  // Layer in a sensible order regardless of add order: bottoms → tops →
  // one-pieces last (a dress/jumpsuit wins over conflicting separates).
  // Google's try-on model infers the garment type itself, so category drives
  // stacking order, not a type hint to the model.
  const ORDER: Record<string, number> = { bottoms: 0, tops: 1, "one-pieces": 2 };
  const garments = garmentFiles
    .map((file, i) => ({ file, cat: categories[i] ?? "tops" }))
    .sort((a, b) => (ORDER[a.cat] ?? 1) - (ORDER[b.cat] ?? 1))
    .map((g) => g.file);

  const heightCm = formData.get("heightCm") ? Number(formData.get("heightCm")) : null;
  const weightKg = formData.get("weightKg") ? Number(formData.get("weightKg")) : null;
  const gender   = (formData.get("gender") as string | null) || "";

  if (!modelImage || garments.length === 0) {
    return NextResponse.json({ error: "A photo and at least one garment are required" }, { status: 400 });
  }
  if (garments.length > 4) {
    return NextResponse.json({ error: "Up to 4 garments at a time" }, { status: 400 });
  }
  if (!ALLOWED.includes(modelImage.type) || garments.some((g) => !ALLOWED.includes(g.type))) {
    return NextResponse.json({ error: "Only JPEG, PNG or WebP allowed" }, { status: 400 });
  }
  if (modelImage.size > 10_000_000 || garments.some((g) => g.size > 10_000_000)) {
    return NextResponse.json({ error: "Images must be under 10MB" }, { status: 400 });
  }

  // 3) Reserve credits (1 per garment) BEFORE spending money on generation.
  const cost = garments.length;
  let reservation: { ok: boolean; remaining: number };
  try {
    reservation = await reserveCredits(uid, cost);
  } catch (e) {
    console.error("[tryon-demo] reserve failed", e);
    return NextResponse.json({ error: "Could not verify credits" }, { status: 500 });
  }
  if (!reservation.ok) {
    return NextResponse.json(
      { error: "You're out of credits.", remaining: reservation.remaining },
      { status: 402 }
    );
  }

  try {
    // Chain: each garment is applied onto the running result (the person wearing
    // everything so far), so the final image has all pieces layered together.
    let personBuffer = Buffer.from(await modelImage.arrayBuffer());
    let personMime   = modelImage.type;
    let resultDataUrl = "";

    for (const garment of garments) {
      const garmentBuffer = Buffer.from(await garment.arrayBuffer());
      resultDataUrl = await runTryOnFromBuffers(
        personBuffer, personMime,
        garmentBuffer, garment.type
      );
      // feed this result back in as the person for the next garment
      const b64 = resultDataUrl.split(",")[1] || "";
      personBuffer = Buffer.from(b64, "base64");
      personMime   = "image/png";
    }

    // Gemini style advice on the final, fully-dressed look
    const styleAdvice = await getStyleAdvice(resultDataUrl, {
      heightCm,
      weightKg,
      gender: gender as "female" | "male" | "other" | "",
    });

    return NextResponse.json({
      resultImageUrl: resultDataUrl,
      styleAdvice,
      garmentCount: garments.length,
      remaining: reservation.remaining,
    });
  } catch (err) {
    await refundCredits(uid, cost); // generation failed — don't charge for it
    console.error("[tryon-demo]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 }
    );
  }
}
