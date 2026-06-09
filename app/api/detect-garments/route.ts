import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 15;

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

const PROMPT = `You are checking a clothing photo for a virtual try-on app that puts ONE garment on a person per image.
Decide if this photo contains MORE THAN ONE distinct wearable garment from different slots — e.g. a top AND bottoms, or it also includes a hat, shoes, or jacket as separate items — that would each need to be tried on separately.
A single garment is NOT multiple, even with minor accessories or a model wearing one main piece.
Respond ONLY with valid JSON, no markdown:
{"multiple": true|false, "items": ["short label", ...]}`;

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`detect:${ip}`, 10, 60_000).allowed) {
    return NextResponse.json({ multiple: false }, { status: 200 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ multiple: false });

  let file: File | null = null;
  try {
    const fd = await req.formData();
    const f = fd.get("image");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ multiple: false });
  }
  if (!file || !ALLOWED.includes(file.type) || file.size > 10_000_000) {
    return NextResponse.json({ multiple: false });
  }

  try {
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent([
      { inlineData: { mimeType: file.type, data: base64 } },
      PROMPT,
    ]);
    const text = result.response.text();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ multiple: false });
    const parsed = JSON.parse(match[0]) as { multiple?: boolean; items?: string[] };
    return NextResponse.json({
      multiple: !!parsed.multiple,
      items: Array.isArray(parsed.items) ? parsed.items.slice(0, 6) : [],
    });
  } catch (e) {
    // Never block the try-on flow on a detection hiccup.
    console.error("[detect-garments]", e instanceof Error ? e.message : e);
    return NextResponse.json({ multiple: false });
  }
}
