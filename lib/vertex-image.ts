/**
 * Vertex AI image generation helpers.
 *
 * generateBodyFromSelfie — PROTOTYPE: takes a head/upper-body selfie and renders
 * a photorealistic full-length "model" of the SAME person (face preserved) that
 * the virtual try-on can then dress. Uses Gemini 2.5 Flash Image (image editing)
 * on Vertex, reusing the same service-account auth as the try-on.
 */

import { GoogleAuth } from "google-auth-library";
import type { BodyProfile } from "./gemini-stylist";

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID!;
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";

async function getAccessToken(): Promise<string> {
  const opts = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
    ? { credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY), scopes: ["https://www.googleapis.com/auth/cloud-platform"] }
    : { scopes: ["https://www.googleapis.com/auth/cloud-platform"] };
  const auth = new GoogleAuth(opts);
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return token.token!;
}

function buildBits(p: BodyProfile): string {
  const bits: string[] = [];
  if (p.heightCm) bits.push(`about ${p.heightCm} cm tall`);
  if (p.weightKg) bits.push(`around ${p.weightKg} kg`);
  if (p.gender === "female") bits.push("a woman");
  else if (p.gender === "male") bits.push("a man");
  return bits.length ? ` The person is ${bits.join(", ")} — match this build.` : "";
}

/** selfieBase64 = raw base64 (no data: prefix). Returns a data:image/png;base64 URL. */
export async function generateBodyFromSelfie(
  selfieBase64: string,
  selfieMime: string,
  profile: BodyProfile = {},
): Promise<string> {
  if (!PROJECT_ID) throw new Error("GOOGLE_CLOUD_PROJECT_ID not set");
  const model = "gemini-2.5-flash-image";
  const endpoint = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${model}:generateContent`;

  const prompt =
    "Using the face and likeness of the person in this photo, generate a photorealistic " +
    "FULL-LENGTH studio photo of the SAME person standing relaxed and facing the camera, " +
    "the ENTIRE body visible from head to toe including feet. Keep their face, hairstyle, " +
    "skin tone and gender exactly. Dress them in plain fitted neutral light-gray athletic " +
    "clothing (simple top and shorts). Plain seamless light-gray background, soft even studio " +
    "lighting, natural proportions, no text, no props." + buildBits(profile);

  const token = await getAccessToken();
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [
        { inlineData: { mimeType: selfieMime, data: selfieBase64 } },
        { text: prompt },
      ] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Vertex image API ${res.status}: ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find((p: { inlineData?: { data?: string; mimeType?: string } }) => p.inlineData?.data);
  if (!img) throw new Error("No image returned from Vertex image API");
  const mime = img.inlineData.mimeType || "image/png";
  return `data:${mime};base64,${img.inlineData.data}`;
}
