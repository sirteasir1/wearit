/**
 * Style Arena — the AI judge.
 *
 * Given TWO outfit photos and the theme they were built for, Gemini 2.5 Flash
 * (vision) scores each look on three axes and crowns a winner with one honest,
 * funny line per look. It judges the CLOTHES and how well they fit the brief —
 * never the person's body, face, or attractiveness.
 *
 * Falls back to a neutral, deterministic verdict if Gemini is unavailable, so a
 * battle is NEVER left without a result.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Lang } from "./i18n";
import type { LookScore, Verdict } from "./arena";

function clamp(n: unknown, lo: number, hi: number, fallback: number): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

function normalize(raw: Partial<LookScore> | undefined): LookScore {
  const themeFit = clamp(raw?.themeFit, 0, 10, 5);
  const coordination = clamp(raw?.coordination, 0, 10, 5);
  const originality = clamp(raw?.originality, 0, 10, 5);
  return {
    themeFit,
    coordination,
    originality,
    total: Math.round(((themeFit + coordination + originality) / 30) * 100), // 0–100
    roast: (raw?.roast || "").toString().slice(0, 180),
  };
}

function buildPrompt(theme: string, lang: Lang, solo: boolean): string {
  const language = lang === "ru" ? "Russian" : "English";
  const intro = solo
    ? `One outfit photo is provided (image A). The theme/brief is: "${theme}".`
    : `Two outfit photos are provided — image A and image B. Both were built for the SAME theme/brief: "${theme}".`;

  return `You are the witty head judge of an outfit battle game.
${intro}

CRITICAL RULES:
- Judge ONLY the CLOTHING, styling, and how well the OUTFIT fits the brief.
- NEVER comment on the person's body, weight, face, attractiveness, skin, or pose. The human is just a mannequin.
- Be honest and genuinely funny — a playful roast of the OUTFIT is welcome, but never mean about the person.
- Score strictly. Most outfits are average. Reserve 9–10 for outfits that truly nail the brief.

Score each outfit on three axes from 0 to 10:
- themeFit: how well the outfit matches the theme "${theme}"
- coordination: do the pieces, colors, and silhouette work together
- originality: is it interesting and considered, or safe and boring

Write each "roast" and the "callout" in ${language}. One short, punchy sentence each — about the OUTFIT only.

Respond with ONLY valid JSON, no markdown:
${solo
  ? `{ "a": { "themeFit": n, "coordination": n, "originality": n, "roast": "one funny honest line about outfit A" } }`
  : `{
  "a": { "themeFit": n, "coordination": n, "originality": n, "roast": "one funny honest line about outfit A" },
  "b": { "themeFit": n, "coordination": n, "originality": n, "roast": "one funny honest line about outfit B" },
  "winner": "a" | "b" | "tie",
  "callout": "one line on why the winner took it"
}`}`;
}

function stripBase64(dataUrl: string): { mimeType: string; data: string } {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (m) return { mimeType: m[1], data: m[2] };
  return { mimeType: "image/png", data: dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl };
}

function fallbackRoast(lang: Lang): string {
  return lang === "ru"
    ? "Судья завис на секунду — но образ держится сам."
    : "The judge blinked — but the look holds its own.";
}

/** Score a single look with no opponent (you're first in this theme). */
export async function judgeSolo(imageA: string, themeBrief: string, lang: Lang): Promise<Verdict> {
  const empty: LookScore = { themeFit: 5, coordination: 5, originality: 5, total: 50, roast: fallbackRoast(lang) };
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { a: empty, b: empty, winner: "a", callout: fallbackRoast(lang) };

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const A = stripBase64(imageA);
    const result = await model.generateContent([
      { inlineData: A },
      buildPrompt(themeBrief, lang, true),
    ]);
    const text = result.response.text();
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = match ? (JSON.parse(match[0]) as { a?: Partial<LookScore> }) : {};
    const a = normalize(parsed.a);
    return { a, b: a, winner: "a", callout: lang === "ru" ? "Первый в этой теме — задаёшь планку." : "First in this theme — you set the bar." };
  } catch (e) {
    console.error("[arena-judge:solo]", e instanceof Error ? e.message : e);
    return { a: empty, b: empty, winner: "a", callout: fallbackRoast(lang) };
  }
}

/** Head-to-head: score both looks and crown a winner. */
export async function judgeBattle(imageA: string, imageB: string, themeBrief: string, lang: Lang): Promise<Verdict> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const even: LookScore = { themeFit: 5, coordination: 5, originality: 5, total: 50, roast: fallbackRoast(lang) };
    return { a: even, b: even, winner: "tie", callout: fallbackRoast(lang) };
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const A = stripBase64(imageA);
    const B = stripBase64(imageB);

    const result = await model.generateContent([
      { text: "OUTFIT A:" },
      { inlineData: A },
      { text: "OUTFIT B:" },
      { inlineData: B },
      buildPrompt(themeBrief, lang, false),
    ]);

    const text = result.response.text();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Invalid judge response");
    const parsed = JSON.parse(match[0]) as { a?: Partial<LookScore>; b?: Partial<LookScore>; winner?: string; callout?: string };

    const a = normalize(parsed.a);
    const b = normalize(parsed.b);
    // Trust the model's pick, but fall back to the higher total if it's missing/odd.
    let winner: "a" | "b" | "tie";
    if (parsed.winner === "a" || parsed.winner === "b" || parsed.winner === "tie") winner = parsed.winner;
    else winner = a.total === b.total ? "tie" : a.total > b.total ? "a" : "b";

    return { a, b, winner, callout: (parsed.callout || "").toString().slice(0, 200) || fallbackRoast(lang) };
  } catch (e) {
    console.error("[arena-judge:battle]", e instanceof Error ? e.message : e);
    const even: LookScore = { themeFit: 5, coordination: 5, originality: 5, total: 50, roast: fallbackRoast(lang) };
    return { a: even, b: even, winner: "tie", callout: fallbackRoast(lang) };
  }
}
