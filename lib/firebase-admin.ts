import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

let adminApp: App;

/* Pasting the service-account JSON into a hosting env (Vercel etc.) often
   turns the escaped "\n" inside private_key into raw newlines, which makes
   the value invalid JSON ("Bad control character in string literal").
   Parse leniently: escape control chars that sit *inside* string literals. */
function parseServiceAccount(raw: string): Record<string, string> {
  try {
    return JSON.parse(raw);
  } catch {
    let out = "";
    let inStr = false;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (ch === '"' && raw[i - 1] !== "\\") inStr = !inStr;
      if (inStr) {
        if (ch === "\n") { out += "\\n"; continue; }
        if (ch === "\r") { out += "\\r"; continue; }
        if (ch === "\t") { out += "\\t"; continue; }
      }
      out += ch;
    }
    return JSON.parse(out);
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

/* Default Storage bucket. Reuses the public client bucket name. */
export const adminBucket = () => {
  const name =
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  return getStorage(getAdminApp()).bucket(name);
};
