import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { googleAuthUrl, signState } from "@/lib/integrations";

/* Kicks off Google Calendar OAuth. Called via a browser navigation that carries
   the user's Firebase ID token in ?token (verified here, never stored). */
export async function GET(req: NextRequest) {
  const origin = new URL(req.url).origin;
  const token = new URL(req.url).searchParams.get("token");
  if (!process.env.GOOGLE_OAUTH_CLIENT_ID) {
    return NextResponse.redirect(`${origin}/agent?error=google_not_configured`);
  }
  if (!token) return NextResponse.redirect(`${origin}/agent?error=auth`);
  try {
    const { uid } = await adminAuth().verifyIdToken(token);
    return NextResponse.redirect(googleAuthUrl(origin, signState(uid)));
  } catch {
    return NextResponse.redirect(`${origin}/agent?error=auth`);
  }
}
