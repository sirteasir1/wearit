import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, isNextResponse } from "@/lib/auth-middleware";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(request: NextRequest) {
  const authResult = await verifyAuth(request);
  if (isNextResponse(authResult)) return authResult;
  const { uid } = authResult;

  const db = adminDb();
  const userRef = db.collection("users").doc(uid);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    const body = await request.json().catch(() => ({}));
    await userRef.set({
      email: body.email || null,
      displayName: body.displayName || null,
      plan: "free",
      tryonCount: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  const data = (await userRef.get()).data();
  return NextResponse.json({ user: data });
}
