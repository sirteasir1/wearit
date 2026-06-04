/**
 * Google Vertex AI Virtual Try-On
 * Model: virtual-try-on-001
 * Price: ~$0.02 per generation
 * License: Commercial ✅
 * Free credits: $300 on new Google Cloud account
 * Docs: https://cloud.google.com/vertex-ai/generative-ai/docs/image/generate-virtual-try-on-images
 */

import { GoogleAuth } from "google-auth-library";

const PROJECT_ID  = process.env.GOOGLE_CLOUD_PROJECT_ID!;
const LOCATION    = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";
const MODEL       = "virtual-try-on-001";
const ENDPOINT    = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}:predict`;

async function getAccessToken(): Promise<string> {
  // Option 1: Service account key JSON (recommended for production)
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    const auth = new GoogleAuth({
      credentials: key,
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    return token.token!;
  }

  // Option 2: Application Default Credentials (gcloud auth application-default login)
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return token.token!;
}

async function fileToBase64(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch image: ${url}`);
  const buffer = await response.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}

export async function runTryOn(
  personImageUrl: string,
  garmentImageUrl: string,
  sampleCount: number = 1
): Promise<string> {
  if (!PROJECT_ID) throw new Error("GOOGLE_CLOUD_PROJECT_ID not set");

  // Convert images to base64
  const [personB64, garmentB64] = await Promise.all([
    fileToBase64(personImageUrl),
    fileToBase64(garmentImageUrl),
  ]);

  const accessToken = await getAccessToken();

  const body = {
    instances: [
      {
        personImage: {
          image: { bytesBase64Encoded: personB64 },
        },
        productImages: [
          {
            image: { bytesBase64Encoded: garmentB64 },
          },
        ],
      },
    ],
    parameters: {
      sampleCount,
      personGeneration: "allow_adult",
    },
  };

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      `Google Try-On API error ${response.status}: ${JSON.stringify(err)}`
    );
  }

  const data = await response.json();
  const base64Result = data?.predictions?.[0]?.bytesBase64Encoded;
  if (!base64Result) throw new Error("No image returned from Google Try-On API");

  // Return as data URL so frontend can display directly
  return `data:image/png;base64,${base64Result}`;
}

/**
 * Run try-on with raw File/Buffer inputs (used in demo API route)
 */
export async function runTryOnFromBuffers(
  personBuffer: Buffer,
  personMime: string,
  garmentBuffer: Buffer,
  garmentMime: string,
  sampleCount: number = 1
): Promise<string> {
  if (!PROJECT_ID) throw new Error("GOOGLE_CLOUD_PROJECT_ID not set");

  const personB64  = personBuffer.toString("base64");
  const garmentB64 = garmentBuffer.toString("base64");

  const accessToken = await getAccessToken();

  const body = {
    instances: [
      {
        personImage:   { image: { bytesBase64Encoded: personB64  } },
        productImages: [{ image: { bytesBase64Encoded: garmentB64 } }],
      },
    ],
    parameters: { sampleCount, personGeneration: "allow_adult" },
  };

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      `Google Try-On API error ${response.status}: ${JSON.stringify(err)}`
    );
  }

  const data = await response.json();
  const base64Result = data?.predictions?.[0]?.bytesBase64Encoded;
  if (!base64Result) throw new Error("No image returned from Google Try-On API");

  return `data:image/png;base64,${base64Result}`;
}
