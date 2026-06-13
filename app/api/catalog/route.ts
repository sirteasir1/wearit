import { NextResponse } from "next/server";
import { getCatalog } from "@/lib/hm-catalog";

// Cached for a day — keeps us well inside the RapidAPI free tier.
export const revalidate = 86400;

export async function GET() {
  try {
    const items = await getCatalog();
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
