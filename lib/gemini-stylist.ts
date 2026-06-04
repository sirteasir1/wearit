/**
 * Gemini Vision — AI Style Advisor
 * Uses Gemini 2.5 Flash — fast, cheap, great vision.
 * Now personalized: takes the user's height / weight / gender and
 * returns a personal size recommendation alongside the style verdict.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

export interface BodyProfile {
  heightCm?: number | null;
  weightKg?: number | null;
  gender?: "female" | "male" | "other" | "";
}

export interface StyleAdvice {
  verdict: "buy" | "skip" | "maybe";
  score: number;
  summary: string;
  pros: string[];
  cons: string[];
  tip: string;
  recommendedSize: string; // e.g. "M", "L", "32" — "" if unknown
  sizeReason: string;      // short why
}

function buildPrompt(p: BodyProfile): string {
  const bits: string[] = [];
  if (p.heightCm) bits.push(`height ${p.heightCm} cm`);
  if (p.weightKg) bits.push(`weight ${p.weightKg} kg`);
  if (p.gender)   bits.push(`shops ${p.gender === "female" ? "womenswear" : p.gender === "male" ? "menswear" : "unisex"}`);
  const body = bits.length
    ? `The person's measurements: ${bits.join(", ")}. Use these to judge fit and recommend a size.`
    : `No measurements were provided — infer fit from the photo and give a best-guess size.`;

  return `You are an expert fashion stylist and fit specialist. Analyze this virtual try-on photo.
${body}
Evaluate: fit, proportions, color harmony, overall style impact. Then recommend the single best size to actually order (use standard letter sizing XS/S/M/L/XL/XXL, or a numeric size if it's clearly bottoms/denim).
Respond ONLY with valid JSON, no markdown, no extra text:
{
  "verdict": "buy" | "skip" | "maybe",
  "score": <number 1-10>,
  "summary": "<one punchy sentence>",
  "pros": ["<pro1>", "<pro2>"],
  "cons": ["<con1>", "<con2>"],
  "tip": "<one actionable styling tip>",
  "recommendedSize": "<best size to order, e.g. M>",
  "sizeReason": "<short reason tied to their build, max 12 words>"
}
Be honest, direct, specific. No fluff.`;
}

export async function getStyleAdvice(
  resultDataUrl: string,
  profile: BodyProfile = {}
): Promise<StyleAdvice> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // Graceful fallback if no key — still give a size from measurements if we can
    const size = guessSize(profile);
    return {
      verdict: "maybe",
      score: 7,
      summary: "Outfit looks decent — add your Gemini API key for detailed analysis.",
      pros: ["Style looks appropriate", "Good color choice"],
      cons: ["Hard to tell without analysis"],
      tip: "Add GEMINI_API_KEY to .env.local for AI styling advice.",
      recommendedSize: size,
      sizeReason: size ? "Estimated from your height and weight." : "",
    };
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const base64 = resultDataUrl.includes(",") ? resultDataUrl.split(",")[1] : resultDataUrl;

    const result = await model.generateContent([
      { inlineData: { mimeType: "image/png", data: base64 } },
      buildPrompt(profile),
    ]);

    const text = result.response.text();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Invalid Gemini response");

    const parsed = JSON.parse(match[0]) as Partial<StyleAdvice>;
    return {
      verdict: parsed.verdict ?? "maybe",
      score: parsed.score ?? 7,
      summary: parsed.summary ?? "",
      pros: parsed.pros ?? [],
      cons: parsed.cons ?? [],
      tip: parsed.tip ?? "",
      recommendedSize: parsed.recommendedSize || guessSize(profile),
      sizeReason: parsed.sizeReason ?? "",
    };
  } catch (e) {
    // Gemini rate-limited / errored — DON'T fail the whole try-on.
    // The generated image still shows, with a size estimated from the body.
    console.error("[gemini-stylist]", e instanceof Error ? e.message : e);
    const size = guessSize(profile);
    return {
      verdict: "maybe",
      score: 7,
      summary: "Your look is ready. The AI stylist is busy right now — try again in a minute for the full critique.",
      pros: ["The fit looks wearable on you"],
      cons: ["Full style analysis is temporarily unavailable"],
      tip: "Tap “Try it on” again shortly for a detailed verdict.",
      recommendedSize: size,
      sizeReason: size ? "Estimated from your height and weight." : "",
    };
  }
}

/** Rough size estimate from BMI-ish heuristic, used as a fallback. */
function guessSize(p: BodyProfile): string {
  if (!p.heightCm || !p.weightKg) return "";
  const h = p.heightCm / 100;
  const bmi = p.weightKg / (h * h);
  if (bmi < 18.5) return "XS";
  if (bmi < 21)   return "S";
  if (bmi < 24)   return "M";
  if (bmi < 27)   return "L";
  if (bmi < 30)   return "XL";
  return "XXL";
}
