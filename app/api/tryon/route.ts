import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, isNextResponse } from "@/lib/auth-middleware";
import { rateLimit } from "@/lib/rate-limit";
import { runTryOn } from "@/lib/google-tryon";
import { getStyleAdvice } from "@/lib/gemini-stylist";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const authResult = await verifyAuth(request);
  if (isNextResponse(authResult)) return authResult;
  const { uid } = authResult;

  const rl = rateLimit(`tryon:${uid}`, 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: { modelImageUrl: string; garmentImageUrl: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { modelImageUrl, garmentImageUrl } = body;
  if (!modelImageUrl || !garmentImageUrl) {
    return NextResponse.json({ error: "Both image URLs required" }, { status: 400 });
  }

  const allowedHosts = ["firebasestorage.googleapis.com", "storage.googleapis.com"];
  try {
    const mh = new URL(modelImageUrl).hostname;
    const gh = new URL(garmentImageUrl).hostname;
    if (!allowedHosts.some(h => mh.includes(h)) || !allowedHosts.some(h => gh.includes(h))) {
      return NextResponse.json({ error: "Invalid image source" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const db = adminDb();
  const userRef  = db.collection("users").doc(uid);
  const userDoc  = await userRef.get();
  const userData = userDoc.data();
  const usedCount = userData?.tryonCount || 0;
  const isPro = userData?.plan === "pro";

  if (!isPro && usedCount >= 10) {
    return NextResponse.json({ error: "Free limit reached. Upgrade to Pro." }, { status: 402 });
  }

  try {
    const resultDataUrl = await runTryOn(modelImageUrl, garmentImageUrl);
    const styleAdvice   = await getStyleAdvice(resultDataUrl);

    const tryonRef = db.collection("users").doc(uid).collection("tryons").doc();
    await Promise.all([
      tryonRef.set({ modelImageUrl, garmentImageUrl, resultImageUrl: resultDataUrl, styleAdvice, createdAt: FieldValue.serverTimestamp() }),
      userRef.set({ tryonCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
    ]);

    return NextResponse.json({
      resultImageUrl: resultDataUrl,
      styleAdvice,
      tryonId: tryonRef.id,
      remaining: isPro ? "unlimited" : Math.max(0, 10 - usedCount - 1),
    });
  } catch (err) {
    console.error("[tryon]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Try-on failed" }, { status: 500 });
  }
}
