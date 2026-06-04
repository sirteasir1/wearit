import { Checkout } from "@polar-sh/nextjs";

/* Redirects to Polar hosted checkout.
   Called like: /api/checkout?products=<PRODUCT_ID>&customerExternalId=<uid>&customerEmail=<email>
   (customerExternalId carries the Firebase uid so the webhook can grant Pro). */
export const GET = Checkout({
  accessToken: process.env.POLAR_ACCESS_TOKEN!,
  successUrl: process.env.POLAR_SUCCESS_URL,
  server: (process.env.POLAR_SERVER as "sandbox" | "production") || "production",
});
