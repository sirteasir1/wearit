import { NextRequest, NextResponse } from "next/server";

// Same-origin image proxy for catalog thumbnails. Retail CDNs can block
// hotlinked <img> requests (foreign referer); routing them through our own
// origin makes them load reliably everywhere. Host-allowlisted to avoid being
// an open proxy. Cached for a day.
export const revalidate = 86400;

const ALLOWED = /^https:\/\/image\.hm\.com\//;

export async function GET(request: NextRequest) {
  const u = request.nextUrl.searchParams.get("u") || "";
  if (!ALLOWED.test(u)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const r = await fetch(u, { next: { revalidate: 86400 } });
    if (!r.ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const body = await r.arrayBuffer();
    return new NextResponse(body, {
      headers: {
        "Content-Type": r.headers.get("content-type") || "image/jpeg",
        "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Upstream error" }, { status: 502 });
  }
}
