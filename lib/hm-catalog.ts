/**
 * H&M product catalog via RapidAPI (apidojo). Server-only — the API key never
 * reaches the browser. We pull a balanced set of try-on-able garments (tops,
 * bottoms, dresses/outerwear) and skip shoes/accessories, which the try-on
 * engine can't render. Results are cached for a day so we stay well inside the
 * free tier's monthly quota.
 */

export type CatalogCat = "tops" | "bottoms" | "one-pieces";
export interface CatalogItem {
  id: string;
  name: string;
  image: string;   // small thumbnail for the strip
  tryOn: string;   // larger image used for the actual try-on
  price: string;
  link: string;
  cat: CatalogCat;
}

const HOST = process.env.RAPIDAPI_HM_HOST || "apidojo-hm-hennes-mauritz-v1.p.rapidapi.com";
const KEY  = process.env.RAPIDAPI_KEY || "";
const HM_WEB = "https://www2.hm.com";

/* Balanced mix across genders and slots. Each tag maps to a try-on category. */
const GROUPS: { tag: string; cat: CatalogCat }[] = [
  { tag: "ladies_dresses",         cat: "one-pieces" },
  { tag: "ladies_tops",            cat: "tops"       },
  { tag: "ladies_jacketscoats",    cat: "tops"       },
  { tag: "ladies_trousers",        cat: "bottoms"    },
  { tag: "ladies_jeans",           cat: "bottoms"    },
  { tag: "men_tshirtstanks",       cat: "tops"       },
  { tag: "men_shirts",             cat: "tops"       },
  { tag: "men_trousers",           cat: "bottoms"    },
];

const TTL = 24 * 60 * 60 * 1000;
let cache: { at: number; items: CatalogItem[] } | null = null;

interface HmProduct {
  id?: string | number;
  productName?: string;
  productImage?: string;
  productImageInfo?: { url?: string };
  modelImage?: string;
  prices?: { formattedPrice?: string }[];
  url?: string;
}

const PER_GROUP = 7;   // keep the strip light and balanced
const MAX_ITEMS = 48;

async function fetchGroup(tag: string, cat: CatalogCat): Promise<CatalogItem[]> {
  const url = `https://${HOST}/products/v2/list?country=us&lang=en&currentpage=0&pagesize=${PER_GROUP}&categoryId=${encodeURIComponent(tag)}`;
  const r = await fetch(url, {
    headers: { "x-rapidapi-host": HOST, "x-rapidapi-key": KEY },
    next: { revalidate: 86400 },
  });
  if (!r.ok) return [];
  const d = await r.json().catch(() => null);
  const list: HmProduct[] = d?.plpList?.productList || [];
  return list.slice(0, PER_GROUP).flatMap((p) => {
    const raw = p.productImage || p.productImageInfo?.url || p.modelImage;
    if (!raw) return [];
    const sep = raw.includes("?") ? "&" : "?";
    // proxy through our origin (dodges CDN hotlink rules); ask the CDN to resize
    const proxied = (w: number) => `/api/img?u=${encodeURIComponent(`${raw}${sep}imwidth=${w}`)}`;
    const link = p.url ? (p.url.startsWith("http") ? p.url : HM_WEB + p.url) : HM_WEB;
    return [{
      id: String(p.id ?? raw),
      name: p.productName || "H&M",
      image: proxied(384),   // ~40KB thumbnail for the strip
      tryOn: proxied(1024),  // crisper image for the actual try-on
      price: p.prices?.[0]?.formattedPrice || "",
      link,
      cat,
    }];
  });
}

/* Round-robin the per-category lists so the strip alternates instead of
   showing eight dresses in a row. */
function interleave(lists: CatalogItem[][]): CatalogItem[] {
  const out: CatalogItem[] = [];
  const seen = new Set<string>();
  const max = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < max; i++) {
    for (const l of lists) {
      const item = l[i];
      if (item && !seen.has(item.id)) { seen.add(item.id); out.push(item); }
    }
  }
  return out;
}

export async function getCatalog(): Promise<CatalogItem[]> {
  if (!KEY) return [];
  if (cache && Date.now() - cache.at < TTL) return cache.items;
  // Sequential — the free tier rate-limits bursts of parallel calls, which
  // would silently drop whole categories. Runs once a day on a cache miss.
  const lists: CatalogItem[][] = [];
  for (const g of GROUPS) {
    lists.push(await fetchGroup(g.tag, g.cat).catch(() => [] as CatalogItem[]));
  }
  const items = interleave(lists).slice(0, MAX_ITEMS);
  if (items.length) cache = { at: Date.now(), items };
  return items;
}
