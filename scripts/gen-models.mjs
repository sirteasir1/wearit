/**
 * Generate the onboarding template models with Vertex Imagen.
 *
 *   node scripts/gen-models.mjs
 *
 * Produces a small grid of neutral, full-length "stand-in" models bucketed by
 * gender × build. These are shown in onboarding so a user can finish (and see a
 * real try-on) BEFORE uploading their own photo — then swap to their own later.
 *
 * Output: public/images/models/model-<gender>-<build>.jpg  (downsized JPEG)
 *
 * Requirements (already in .env.local): GOOGLE_SERVICE_ACCOUNT_KEY,
 * GOOGLE_CLOUD_PROJECT_ID, GOOGLE_CLOUD_LOCATION.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { GoogleAuth } from "google-auth-library";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function env(key) {
  const raw = readFileSync(join(ROOT, ".env.local"), "utf8");
  return raw.match(new RegExp("^" + key + "=(.+)$", "m"))?.[1]?.trim().replace(/^["']|["']$/g, "");
}

const PROJECT = env("GOOGLE_CLOUD_PROJECT_ID");
const LOCATION = env("GOOGLE_CLOUD_LOCATION") || "us-central1";
const CREDENTIALS = JSON.parse(env("GOOGLE_SERVICE_ACCOUNT_KEY"));
const MODEL = "imagen-3.0-generate-002";
const ENDPOINT = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/${LOCATION}/publishers/google/models/${MODEL}:predict`;

const auth = new GoogleAuth({ credentials: CREDENTIALS, scopes: ["https://www.googleapis.com/auth/cloud-platform"] });

const BUILDS = {
  slim:   "a slim, lean build",
  medium: "an average, medium build",
  full:   "a fuller, curvier plus-size build",
};
const GENDERS = {
  female: "woman",
  male:   "man",
};

function prompt(genderWord, buildWord) {
  return [
    `A photorealistic full-length studio fashion photo of a ${genderWord} with ${buildWord},`,
    `standing relaxed and facing the camera, the ENTIRE body visible from head to toe including feet,`,
    `wearing plain fitted neutral light-gray athletic clothing (a simple top and shorts),`,
    `plain seamless light-gray background, soft even studio lighting, neutral friendly expression,`,
    `natural proportions, no text, no props, sharp focus.`,
  ].join(" ");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function generateOnce(genderWord, buildWord) {
  const token = (await (await auth.getClient()).getAccessToken()).token;
  const body = {
    instances: [{ prompt: prompt(genderWord, buildWord) }],
    parameters: { sampleCount: 1, aspectRatio: "3:4", personGeneration: "allow_all", safetySetting: "block_few" },
  };
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (r.status === 429) { const e = new Error("rate-limited"); e.retryable = true; throw e; }
  if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 400)}`);
  const j = await r.json();
  const b64 = j.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error("no image in response: " + JSON.stringify(j).slice(0, 300));
  return Buffer.from(b64, "base64");
}

// Vertex enforces a low per-minute quota on Imagen, so back off and retry on 429.
async function generate(genderWord, buildWord) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await generateOnce(genderWord, buildWord);
    } catch (e) {
      if (!e.retryable || attempt >= 5) throw e;
      const wait = 20000 + attempt * 10000;
      process.stdout.write(`(429, retry in ${wait / 1000}s) `);
      await sleep(wait);
    }
  }
}

async function main() {
  const outDir = join(ROOT, "public", "images", "models");
  mkdirSync(outDir, { recursive: true });
  for (const [gKey, gWord] of Object.entries(GENDERS)) {
    for (const [bKey, bWord] of Object.entries(BUILDS)) {
      const name = `model-${gKey}-${bKey}.jpg`;
      const outPath = join(outDir, name);
      if (existsSync(outPath)) { console.log(`→ ${name} … skip (exists)`); continue; }
      process.stdout.write(`→ ${name} … `);
      try {
        const png = await generate(gWord, bWord);
        const jpg = await sharp(png).resize({ width: 880, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
        writeFileSync(outPath, jpg);
        console.log(`ok (${Math.round(jpg.length / 1024)} KB)`);
      } catch (e) {
        console.log(`FAILED — ${e.message}`);
      }
      await sleep(15000); // stay under the per-minute Imagen quota
    }
  }
  console.log("done →", outDir);
}

main().catch((e) => { console.error(e); process.exit(1); });
