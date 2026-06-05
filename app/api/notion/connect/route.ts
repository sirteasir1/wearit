import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { notionAuthUrl, signState } from "@/lib/integrations";

/* Kicks off Notion OAuth (public integration). ?token = Firebase ID token. */
export async function GET(req: NextRequest) {
  const origin = new URL(req.url).origin;
  const token = new URL(req.url).searchParams.get("token");
  if (!process.env.NOTION_OAUTH_CLIENT_ID) {
    return NextResponse.redirect(`${origin}/agent?error=notion_not_configured`);
  }
  if (!token) return NextResponse.redirect(`${origin}/agent?error=auth`);
  try {
    const { uid } = await adminAuth().verifyIdToken(token);
    return NextResponse.redirect(notionAuthUrl(origin, signState(uid)));
  } catch {
    return NextResponse.redirect(`${origin}/agent?error=auth`);
  }
}
