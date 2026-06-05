import { NextRequest, NextResponse } from "next/server";
import { exchangeGoogleCode, saveIntegration, verifyState } from "@/lib/integrations";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const uid = verifyState(url.searchParams.get("state"));
  if (!code || !uid) return NextResponse.redirect(`${origin}/agent?error=google`);
  try {
    const conn = await exchangeGoogleCode(code, origin);
    await saveIntegration(uid, "google", conn);
    return NextResponse.redirect(`${origin}/agent?connected=google`);
  } catch {
    return NextResponse.redirect(`${origin}/agent?error=google`);
  }
}
