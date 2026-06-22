import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, isNextResponse } from "@/lib/auth-middleware";
import { rateLimit } from "@/lib/rate-limit";
import { generateBodyFromSelfie } from "@/lib/vertex-image";

export const maxDuration = 60;

/* PROTOTYPE: selfie → full-body model. Expensive (image generation), so the
   limit is tight. The client sends a resized selfie dataURL + the user's
   measurements; we render a full-length stand-in that preserves their face. */
export async function POST(request: NextRequest) {
  const authResult = await verifyAuth(request);
  if (isNextResponse(authResult)) return authResult;
  const { uid } = authResult;

  const rl = rateLimit(`avatar:${uid}`, 4, 5 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests. Try again in a few minutes." }, { status: 429 });
  }

  let body: { selfie?: string; heightCm?: number | null; weightKg?: number | null; gender?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const selfie = body.selfie;
  const m = typeof selfie === "string" ? selfie.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/) : null;
  if (!m) {
    return NextResponse.json({ error: "A selfie image is required." }, { status: 400 });
  }
  const [, mime, base64] = m;
  // ~3MB ceiling on the decoded image to keep the request sane.
  if (base64.length > 4_000_000) {
    return NextResponse.json({ error: "Image too large." }, { status: 413 });
  }

  try {
    const image = await generateBodyFromSelfie(base64, mime, {
      heightCm: body.heightCm ?? null,
      weightKg: body.weightKg ?? null,
      gender: (body.gender as "female" | "male" | "other" | "") || "",
    });
    return NextResponse.json({ image });
  } catch (err) {
    console.error("[avatar]", err);
    return NextResponse.json({ error: "Couldn't build the model. Try a full-length photo instead." }, { status: 500 });
  }
}
