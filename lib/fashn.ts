const FASHN_BASE = "https://api.fashn.ai/v1";

export type GarmentCategory = "tops" | "bottoms" | "one-pieces";

export interface TryOnResult {
  id: string;
  status: "processing" | "completed" | "failed";
  output?: string[];
  error?: string;
}

export async function startTryOn(
  modelImageUrl: string,
  garmentImageUrl: string,
  category: GarmentCategory = "tops"
): Promise<{ id: string }> {
  const apiKey = process.env.FASHN_API_KEY;
  if (!apiKey) throw new Error("FASHN_API_KEY not configured");

  const response = await fetch(`${FASHN_BASE}/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model_image: modelImageUrl,
      garment_image: garmentImageUrl,
      category,
      mode: "quality",
      garment_photo_type: "auto",
      nsfw_filter: true,
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || "FASHN API error");
  }

  return response.json();
}

export async function pollTryOn(predictionId: string): Promise<TryOnResult> {
  const apiKey = process.env.FASHN_API_KEY;
  if (!apiKey) throw new Error("FASHN_API_KEY not configured");

  const response = await fetch(`${FASHN_BASE}/status/${predictionId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || "FASHN poll error");
  }

  return response.json();
}

export async function runTryOnAndWait(
  modelImageUrl: string,
  garmentImageUrl: string,
  category: GarmentCategory = "tops",
  maxWaitMs = 60_000
): Promise<string> {
  const { id } = await startTryOn(modelImageUrl, garmentImageUrl, category);

  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    await new Promise((r) => setTimeout(r, 2000));
    const result = await pollTryOn(id);

    if (result.status === "completed" && result.output?.[0]) {
      return result.output[0];
    }
    if (result.status === "failed") {
      throw new Error(result.error || "Try-on generation failed");
    }
  }

  throw new Error("Try-on timed out");
}
