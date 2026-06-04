import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 20;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

function abs(url: string, base: string) {
  try { return new URL(url, base).href; } catch { return url; }
}

async function toDataUrl(res: Response): Promise<string> {
  const type = res.headers.get("content-type") || "image/jpeg";
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 10_000_000) throw new Error("Image too large");
  return `data:${type};base64,${buf.toString("base64")}`;
}

export async function POST(request: NextRequest) {
  let url = "";
  try {
    ({ url } = await request.json());
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "Paste a valid http(s) link" }, { status: 400 });
  }

  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*" }, redirect: "follow" });
    if (!res.ok) throw new Error(`Couldn't open the link (${res.status})`);

    const ct = res.headers.get("content-type") || "";

    // Direct image link
    if (ct.startsWith("image/")) {
      return NextResponse.json({ dataUrl: await toDataUrl(res) });
    }

    // HTML page — pull the og:image / twitter:image
    if (ct.includes("html")) {
      const html = await res.text();
      const pick = (re: RegExp) => { const m = html.match(re); return m?.[1]; };
      const imgUrl =
        pick(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i) ||
        pick(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
        pick(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ||
        pick(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i);

      if (!imgUrl) throw new Error("No product image found on that page");
      const imgRes = await fetch(abs(imgUrl, url), { headers: { "User-Agent": UA } });
      if (!imgRes.ok || !(imgRes.headers.get("content-type") || "").startsWith("image/")) {
        throw new Error("Couldn't load the product image");
      }
      return NextResponse.json({ dataUrl: await toDataUrl(imgRes) });
    }

    throw new Error("That link isn't an image or a product page");
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't fetch that link" },
      { status: 422 }
    );
  }
}
