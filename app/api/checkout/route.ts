import { Checkout } from "@polar-sh/nextjs";
import { NextRequest, NextResponse } from "next/server";

/* Redirects to Polar hosted checkout.
   /api/checkout?products=<PRODUCT_ID>&customerExternalId=<uid>&customerEmail=<email> */
export async function GET(req: NextRequest) {
  const token = process.env.POLAR_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "POLAR_ACCESS_TOKEN is not set. Add it in Vercel → Settings → Environment Variables and redeploy." },
      { status: 500 }
    );
  }

  const handler = Checkout({
    accessToken: token,
    successUrl: process.env.POLAR_SUCCESS_URL,
    server: (process.env.POLAR_SERVER as "sandbox" | "production") || "production",
  });

  try {
    return await handler(req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[checkout] error:", msg);
    return NextResponse.json(
      {
        error: msg,
        hints: [
          "Make sure POLAR_ACCESS_TOKEN, POLAR_SERVER and POLAR_SUCCESS_URL are set in Vercel and you REDEPLOYED after adding them.",
          "POLAR_SERVER must match where the product lives: 'sandbox' or 'production'.",
          "The product id in ?products= must exist on that same Polar environment.",
        ],
      },
      { status: 500 }
    );
  }
}
