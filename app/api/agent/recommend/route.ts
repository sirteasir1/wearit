import { NextRequest, NextResponse } from "next/server";
import type { Piece } from "@/lib/agent";

export const maxDuration = 30;

type Kind = "work" | "evening" | "gym" | "casual";

/* Curated fashion stores that expose a public Shopify /products.json feed.
   g = gender focus, kinds = occasions they suit. Verified to respond. */
const STORES: { d: string; g: "men" | "women" | "both" | "unisex"; kinds: Kind[] }[] = [
  // formal / classic sources (suits, blazers, dress shirts, workwear)
  { d: "www.theblacktux.com",    g: "men",    kinds: ["work", "evening"] },           // suits, suit jackets, suit pants
  { d: "www.ledbury.com",        g: "men",    kinds: ["work"] },                       // dress shirts
  { d: "mmlafleur.com",          g: "women",  kinds: ["work", "evening"] },            // tailored workwear, blazers, sheath dresses
  { d: "www.taylorstitch.com",   g: "men",    kinds: ["work", "evening", "casual"] },
  { d: "cutsclothing.com",       g: "men",    kinds: ["work", "evening", "casual"] },
  { d: "www.untuckit.com",       g: "men",    kinds: ["work", "casual"] },
  { d: "rothys.com",             g: "women",  kinds: ["work", "evening", "casual"] },  // loafers, flats, heels (pro shoes)
  // casual / sport / going-out
  { d: "www.trueclassictees.com",g: "men",    kinds: ["casual"] },
  { d: "ohpolly.com",            g: "women",  kinds: ["evening", "casual"] },          // party — NOT work
  { d: "www.aloyoga.com",        g: "both",   kinds: ["gym", "casual"] },
  { d: "gymshark.com",           g: "unisex", kinds: ["gym"] },
  { d: "www.allbirds.com",       g: "unisex", kinds: ["casual", "gym"] },              // sneakers only — NOT work
  { d: "www.tentree.com",        g: "unisex", kinds: ["casual"] },
];

interface SP { title: string; product_type?: string; tags?: string[]; handle: string; vendor?: string; images?: { src: string }[]; variants?: { price: string }[]; }
interface Cand extends Piece { score: number; }

function classify(occasion: string, vibe: string): Kind {
  const t = `${occasion} ${vibe}`.toLowerCase();
  if (/(gym|workout|run|training|yoga|sport|exercise)/.test(t)) return "gym";
  if (/(meeting|presentation|interview|work|sync|client|pitch|conference|review|board|office|deadline|demo)/.test(t)) return "work";
  if (/(dinner|date|party|drinks|birthday|wedding|club|gala|night|concert|celebration|brunch)/.test(t)) return "evening";
  return "casual";
}

/* Map a product to an outfit slot from its type + title. Rejects accessories,
   kids items, socks/laces and other non-apparel so looks stay realistic. */
function slotOf(p: SP): Piece["slot"] | null {
  const s = `${p.product_type || ""} ${p.title} ${(p.tags || []).join(" ")}`.toLowerCase();
  if (/\bsock|shoelace|\blaces?\b|beanie|\bhat\b|\bcap\b|belt|\bbag\b|tote|backpack|wallet|scarf|glove|sunglass|jewel|hair|headband|gift|fragrance|candle|underwear|\bbrief|boxer|lingerie|swim|\bbra\b|accessor|kid'?s?\b|\byouth\b|toddler|baby|child|\btie\b|necktie|bow ?tie|pocket square|swatch|cufflink|suspender|\bvest\b|pajama|robe/.test(s)) return null;
  if (/\bdress(es)?\b|gown|jumpsuit/.test(s)) return "dress";
  if (/jacket|coat|blazer|outerwear|overshirt|parka|bomber|cardigan/.test(s)) return "outerwear";
  if (/shoe|sneaker|boot|loafer|sandal|\bflats?\b|heel|trainer|derby|footwear/.test(s)) return "shoes";
  if (/pant|trouser|chino|jean|\bshorts\b|bottoms?\b|legging|skirt|denim/.test(s)) return "bottom";
  if (/shirt|\btee\b|t-shirt|\btop\b|polo|henley|knit|woven|sweat|blouse|tank|button|hoodie/.test(s)) return "top";
  return null;
}

function genderOf(p: SP, storeG: string): "men" | "women" | "unisex" {
  const s = `${p.product_type || ""} ${(p.tags || []).join(" ")}`.toLowerCase();
  if (/\bwomen|female|\bwmns?\b/.test(s)) return "women";
  if (/\bmen(?!u)|male\b/.test(s)) return "men";
  if (storeG === "men" || storeG === "women") return storeG;
  return "unisex";
}

/* Score (or reject) a product for how well it fits the occasion's formality.
   Returns null to reject the item outright, otherwise a bonus to its score. */
function occScore(kind: Kind, slot: Piece["slot"], text: string): number | null {
  const casual = /\b(tee|t-shirt|graphic|hoodie|sweatshirt|sweater short|sweatpant|jogger|\bshorts?\b|sneaker|active|training|\bgym\b|legging|flip[- ]?flop|\bslide|fleece|lounge|cargo)\b/.test(text);
  const party  = /\bmini\b|crop|bodycon|cut[- ]?out|sequin|halter|bandeau|backless|corset|\bclub\b/.test(text);
  const formal = /suit|tuxedo|blazer|sport ?coat|dress shirt|oxford|tailored|trouser|dress pant|loafer|derby|\bpump|\bheel|blouse|sheath|\bmidi\b|button[- ]?up|button[- ]?down|poplin|\bwool\b|ponte|pleated/.test(text);

  if (kind === "work") {
    if (casual || party) return null;          // no tees/hoodies/party pieces for an official meeting
    return formal ? 1.8 : 0.2;                 // strongly favour classic, tailored pieces
  }
  if (kind === "evening") {
    if (casual) return null;                   // no gymwear for dinner
    return party || formal ? 1.3 : 0.3;        // elevated or going-out
  }
  if (kind === "gym") {
    const active = /active|training|performance|legging|\bgym\b|\bshorts?\b|tank|sport|jogger|sweat/.test(text);
    return active || slot === "shoes" ? 1.0 : 0.2;
  }
  // casual — avoid full-on formal suiting
  if (/suit|tuxedo|\bblazer\b|sport ?coat|gown|sheath/.test(text)) return null;
  return 0.5;
}

/* Which slots make a look for this occasion, and the preferred top keywords. */
function plan(kind: Kind, gender: "men" | "women"): { slots: Piece["slot"][]; topPrefer: RegExp } {
  if (kind === "work")
    return gender === "women"
      ? { slots: ["top", "bottom", "shoes"], topPrefer: /blouse|shirt|knit|silk|button/ }
      : { slots: ["top", "outerwear", "bottom", "shoes"], topPrefer: /shirt|button|oxford|polo|woven/ };
  if (kind === "evening")
    return gender === "women"
      ? { slots: ["dress", "shoes"], topPrefer: /silk|satin|knit|going|mini/ }
      : { slots: ["top", "bottom", "shoes"], topPrefer: /shirt|knit|woven|button/ };
  if (kind === "gym")
    return { slots: ["top", "bottom", "shoes"], topPrefer: /tee|tank|short sleeve|performance|bra/ };
  return { slots: ["top", "bottom", "shoes"], topPrefer: /tee|knit|top|crew|henley/ };
}

async function fetchStore(domain: string): Promise<SP[]> {
  try {
    const r = await fetch(`https://${domain}/products.json?limit=250`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 3600 },
    });
    if (!r.ok) return [];
    const d = await r.json();
    return Array.isArray(d.products) ? d.products : [];
  } catch { return []; }
}

function toPiece(p: SP, slot: Piece["slot"], domain: string): Piece | null {
  const img = p.images?.[0]?.src;
  if (!img) return null;
  const price = p.variants?.[0]?.price ? `$${Math.round(parseFloat(p.variants[0].price))}` : "";
  return {
    name: p.title,
    slot,
    image: img,
    link: `https://${domain}/products/${p.handle}`,
    price,
    brand: p.vendor || domain.replace(/^www\./, "").replace(/\.com$/, ""),
  };
}

function pick<T>(arr: T[]): T | undefined { return arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined; }

export async function POST(req: NextRequest) {
  let occasion = "", vibe = "", gender = "";
  try {
    const b = await req.json();
    occasion = b.occasion || ""; vibe = b.vibe || ""; gender = b.gender || "";
  } catch { /* defaults */ }

  const g: "men" | "women" = gender === "female" ? "women" : "men";
  const kind = classify(occasion, vibe);
  const { slots, topPrefer } = plan(kind, g);

  // Keep suggestions realistic: tight budget for casual everyday, generous for
  // formal (suits/blazers cost more). Shoes get a higher allowance within each.
  const CAP: Record<Kind, number> = { casual: 75, work: 450, evening: 250, gym: 80 };
  const cap = CAP[kind];

  // choose relevant stores (gender-compatible + suits the occasion)
  const stores = STORES.filter(
    (s) => s.kinds.includes(kind) && (s.g === g || s.g === "unisex" || s.g === "both")
  ).slice(0, 5);

  const results = await Promise.all(stores.map((s) => fetchStore(s.d).then((ps) => ({ s, ps }))));

  // bucket candidate garments by slot, gender-filtered
  const buckets: Record<string, Cand[]> = { top: [], bottom: [], outerwear: [], shoes: [], dress: [] };
  for (const { s, ps } of results) {
    for (const p of ps) {
      const slot = slotOf(p);
      if (!slot || !buckets[slot]) continue;
      const pg = genderOf(p, s.g);
      if (pg !== "unisex" && pg !== g) continue;
      const text = `${p.product_type || ""} ${p.title}`.toLowerCase();
      const occ = occScore(kind, slot, text);
      if (occ === null) continue;                       // wrong formality for this occasion
      const priceNum = p.variants?.[0]?.price ? parseFloat(p.variants[0].price) : NaN;
      const slotCap = slot === "shoes" ? cap * 2 : cap;
      if (!isNaN(priceNum) && priceNum > slotCap) continue;
      const piece = toPiece(p, slot, s.d);
      if (!piece) continue;
      // occasion fit dominates; cheaper-within-slot is a gentle tiebreaker
      let score = occ + Math.random() * 0.4;
      if (!isNaN(priceNum)) score += Math.max(0, (slotCap - priceNum) / slotCap) * 0.5;
      if (slot === "top" && topPrefer.test(text)) score += 0.4;
      buckets[slot].push({ ...piece, score });
    }
  }

  // assemble one piece per wanted slot
  const look: Piece[] = [];
  const used = new Set<string>();
  for (const slot of slots) {
    const sorted = buckets[slot].filter((c) => !used.has(c.image!)).sort((a, b) => b.score - a.score);
    // mix in randomness among the top matches so "suggest another" varies
    const chosen = pick(sorted.slice(0, Math.max(3, Math.ceil(sorted.length * 0.3))));
    if (chosen) { used.add(chosen.image!); const { score, ...piece } = chosen; void score; look.push(piece); }
  }

  if (look.length >= 2) return NextResponse.json({ pieces: look });
  // nothing came back (stores down / blocked) — degrade to text guidance
  return NextResponse.json({ pieces: textFallback(kind, g) });
}

/* Text-only fallback so the agent still suggests something if stores are unreachable. */
function textFallback(kind: Kind, g: "men" | "women"): Piece[] {
  const w = g === "women";
  if (kind === "work")
    return w
      ? [{ name: "Tailored blazer", slot: "outerwear", detail: "Instantly put-together." }, { name: "Silk or fine-knit top", slot: "top", detail: "Sleek under the blazer." }, { name: "Straight trousers", slot: "bottom", detail: "Clean, polished line." }, { name: "Pointed flats", slot: "shoes", detail: "Sharp, comfortable." }]
      : [{ name: "Crisp button-down shirt", slot: "top", detail: "White or pale blue." }, { name: "Navy blazer", slot: "outerwear", detail: "Lifts the whole look." }, { name: "Tailored chinos", slot: "bottom", detail: "Slim but not tight." }, { name: "Leather derbies", slot: "shoes", detail: "Polished finish." }];
  if (kind === "evening")
    return w
      ? [{ name: "Statement dress", slot: "dress", detail: "One strong piece." }, { name: "Heeled boots", slot: "shoes", detail: "Elevates it." }]
      : [{ name: "Dark textured shirt", slot: "top", detail: "Richer than a tee." }, { name: "Slim dark trousers", slot: "bottom", detail: "Keeps it sharp." }, { name: "Chelsea boots", slot: "shoes", detail: "Pulls it together." }];
  if (kind === "gym")
    return [{ name: "Performance tee", slot: "top", detail: "Light, breathable." }, { name: "Training shorts", slot: "bottom", detail: "Built to move." }, { name: "Supportive trainers", slot: "shoes", detail: "What matters here." }];
  return [{ name: "Easy tee", slot: "top", detail: "Effortless base." }, { name: "Straight jeans", slot: "bottom", detail: "Casual, considered." }, { name: "Clean sneakers", slot: "shoes", detail: "Goes with everything." }];
}
