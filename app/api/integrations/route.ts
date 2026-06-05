import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, isNextResponse } from "@/lib/auth-middleware";
import { connectedProviders, removeIntegration, Provider } from "@/lib/integrations";

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (isNextResponse(auth)) return auth;
  const connected = await connectedProviders(auth.uid);
  return NextResponse.json({
    connected,
    configured: {
      google: !!process.env.GOOGLE_OAUTH_CLIENT_ID,
      notion: !!process.env.NOTION_OAUTH_CLIENT_ID,
    },
  });
}

export async function DELETE(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (isNextResponse(auth)) return auth;
  const provider = new URL(req.url).searchParams.get("provider") as Provider | null;
  if (provider !== "google" && provider !== "notion") {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }
  await removeIntegration(auth.uid, provider);
  return NextResponse.json({ ok: true });
}
