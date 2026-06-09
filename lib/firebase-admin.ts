import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

let adminApp: App;

/* Read one "key": "value" string field out of a possibly-malformed JSON blob,
   reading up to the next unescaped quote and decoding \n \t \r escapes. Raw
   newlines inside the value are tolerated (kept as-is), which is exactly what
   we want for private_key. */
function extractField(raw: string, key: string): string | undefined {
  const m = new RegExp(`"${key}"\\s*:\\s*"`).exec(raw);
  if (!m) return undefined;
  let out = "";
  let esc = false;
  for (let i = m.index + m[0].length; i < raw.length; i++) {
    const ch = raw[i];
    if (esc) {
      out += ch === "n" ? "\n" : ch === "t" ? "\t" : ch === "r" ? "\r" : ch;
      esc = false;
      continue;
    }
    if (ch === "\\") { esc = true; continue; }
    if (ch === '"') break;            // closing quote
    out += ch;
  }
  return out;
}

/* Pasting the service-account JSON into a hosting env (Vercel etc.) often
   mangles the escaped "\n" inside private_key into raw newlines, breaking
   JSON.parse ("Bad control character in string literal"). Fall back to
   pulling the three fields the Admin SDK needs straight out of the blob. */
function parseServiceAccount(raw: string): { project_id?: string; client_email?: string; private_key?: string } {
  try {
    return JSON.parse(raw);
  } catch {
    return {
      project_id: extractField(raw, "project_id"),
      client_email: extractField(raw, "client_email"),
      private_key: extractField(raw, "private_key"),
    };
  }
}

function adminCredential() {
  // Easiest: paste the whole Firebase service-account JSON in one var.
  const raw = process.env.FIREBASE_ADMIN_KEY;
  if (raw) {
    const j = parseServiceAccount(raw);
    return cert({
      projectId: j.project_id,
      clientEmail: j.client_email,
      privateKey: j.private_key?.replace(/\\n/g, "\n"),
    });
  }
  // Or the three separate fields.
  return cert({
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  });
}

function getAdminApp() {
  if (getApps().length === 0) {
    adminApp = initializeApp({ credential: adminCredential() });
  } else {
    adminApp = getApps()[0];
  }
  return adminApp;
}

export const adminAuth = () => getAuth(getAdminApp());
export const adminDb = () => getFirestore(getAdminApp());
