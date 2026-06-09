import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "./firebase-admin";

export interface AuthenticatedRequest extends NextRequest {
  uid: string;
}

export async function verifyAuth(request: NextRequest): Promise<{ uid: string } | NextResponse> {
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.split("Bearer ")[1];

  try {
    const decoded = await adminAuth().verifyIdToken(token);
    return { uid: decoded.uid };
  } catch (e) {
    // Log the real reason server-side (expired token, project/aud mismatch,
    // broken Admin credential) but don't leak it to the client.
    const code = (e as { code?: string; errorInfo?: { code?: string } })?.errorInfo?.code
      || (e as { code?: string })?.code
      || (e instanceof Error ? e.message : "unknown");
    console.error("[auth] verifyIdToken failed:", code);
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}

export function isNextResponse(val: unknown): val is NextResponse {
  return val instanceof NextResponse;
}
