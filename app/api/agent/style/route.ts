import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { WardrobeBrief } from "@/lib/agent";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  let wardrobe: WardrobeBrief[] = [];
  let gender = "";
  try {
    const b = await req.json();
    wardrobe = Array.isArray(b.wardrobe) ? b.wardrobe.slice(0, 60) : [];
    gender = typeof b.gender === "string" ? b.gender : "";
  } catch { /* defaults */ }

  const liked = wardrobe.filter((w) => w.verdict === "buy" || w.score >= 7);
  const apiKey = process.env.GEMINI_API_KEY;

  if (apiKey && wardrobe.length > 0) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const prompt = `You are a fashion profiler learning a person's personal style so you can dress and shop for them.
They shop: ${gender === "female" ? "womenswear" : gender === "male" ? "menswear" : "all"}.
Their saved looks (name | category | verdict | score):
${wardrobe.map((w) => `- ${w.name} | ${w.category} | ${w.verdict} | ${w.score}/10`).join("\n")}
The ones they liked most: ${liked.map((w) => w.name).join(", ") || "n/a"}.
Infer their taste. Respond ONLY JSON, no markdown:
{"summary":"<1-2 sentences, 2nd person, e.g. 'You lean minimal streetwear in a neutral palette and favor relaxed fits.'>","tags":["<4-6 short style tags>"]}`;
      const result = await model.generateContent(prompt);
      const m = result.response.text().match(/\{[\s\S]*\}/);
      if (m) {
        const p = JSON.parse(m[0]) as { summary?: string; tags?: string[] };
        return NextResponse.json({
          summary: String(p.summary || "").trim(),
          tags: Array.isArray(p.tags) ? p.tags.slice(0, 6).map(String) : [],
          updatedAt: Date.now(),
          basedOn: wardrobe.length,
        });
      }
    } catch (e) {
      console.error("[agent/style]", e instanceof Error ? e.message : e);
    }
  }

  // Fallback: seed from gender + counts
  const topCat = mostCommon(wardrobe.map((w) => w.category));
  return NextResponse.json({
    summary: wardrobe.length
      ? `You're building a wardrobe that leans toward ${topCat || "versatile"} pieces. Try on more looks and I'll learn your taste in detail.`
      : `Try on a few looks and I'll learn your personal style.`,
    tags: gender === "female" ? ["womenswear"] : gender === "male" ? ["menswear"] : ["versatile"],
    updatedAt: Date.now(),
    basedOn: wardrobe.length,
  });
}

function mostCommon(arr: string[]): string | null {
  if (!arr.length) return null;
  const c: Record<string, number> = {};
  for (const a of arr) c[a] = (c[a] || 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
}
