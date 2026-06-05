import { NextRequest, NextResponse } from "next/server";
import { exchangeNotionCode, saveIntegration, verifyState } from "@/lib/integrations";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const uid = verifyState(url.searchParams.get("state"));
  if (!code || !uid) return NextResponse.redirect(`${origin}/agent?error=notion`);
  try {
    const conn = await exchangeNotionCode(code, origin);
    await saveIntegration(uid, "notion", conn);
    return NextResponse.redirect(`${origin}/agent?connected=notion`);
  } catch {
    return NextResponse.redirect(`${origin}/agent?error=notion`);
  }
}
