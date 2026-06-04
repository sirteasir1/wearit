import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { runTryOnFromBuffers } from "@/lib/google-tryon";
import { getStyleAdvice } from "@/lib/gemini-stylist";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const rl = rateLimit(`demo:${ip}`, 3, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests. Please wait." }, { status: 429 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const modelImage   = formData.get("modelImage")   as File | null;
  const garmentImage = formData.get("garmentImage") as File | null;
  const heightCm = formData.get("heightCm") ? Number(formData.get("heightCm")) : null;
  const weightKg = formData.get("weightKg") ? Number(formData.get("weightKg")) : null;
  const gender   = (formData.get("gender") as string | null) || "";

  if (!modelImage || !garmentImage) {
    return NextResponse.json({ error: "Both images are required" }, { status: 400 });
  }

  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(modelImage.type) || !allowed.includes(garmentImage.type)) {
    return NextResponse.json({ error: "Only JPEG, PNG or WebP allowed" }, { status: 400 });
  }
  if (modelImage.size > 10_000_000 || garmentImage.size > 10_000_000) {
    return NextResponse.json({ error: "Images must be under 10MB" }, { status: 400 });
  }

  try {
    const personBuffer  = Buffer.from(await modelImage.arrayBuffer());
    const garmentBuffer = Buffer.from(await garmentImage.arrayBuffer());

    // Step 1 — Google Virtual Try-On
    const resultDataUrl = await runTryOnFromBuffers(
      personBuffer,  modelImage.type,
      garmentBuffer, garmentImage.type
    );

    // Step 2 — Gemini style advice (personalized to the user's body)
    const styleAdvice = await getStyleAdvice(resultDataUrl, {
      heightCm,
      weightKg,
      gender: gender as "female" | "male" | "other" | "",
    });

    return NextResponse.json({
      resultImageUrl: resultDataUrl,
      styleAdvice,
      remaining: 9,
    });
  } catch (err) {
    console.error("[tryon-demo]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 }
    );
  }
}
