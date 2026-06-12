/* One-shot registration report — uses the SAME Firebase project you already
   have (no new analytics, nothing deleted). Lists every registered user with
   sign-up time, last login, and whether they finished onboarding / tried a look.

   Run:
     node --env-file=.env.local scripts/list-users.mjs

   Optional — check your invite list of ~70 people:
     put one email per line in scripts/invited.txt, then run the same command;
     it will show who registered and who is still missing.
*/
import { readFileSync, existsSync } from "node:fs";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function credential() {
  const raw = process.env.FIREBASE_ADMIN_KEY;
  if (!raw) {
    console.error("✗ FIREBASE_ADMIN_KEY is not set. Run with: node --env-file=.env.local scripts/list-users.mjs");
    process.exit(1);
  }
  const j = JSON.parse(raw);
  return cert({
    projectId: j.project_id,
    clientEmail: j.client_email,
    privateKey: (j.private_key || "").replace(/\\n/g, "\n"),
  });
}

if (getApps().length === 0) initializeApp({ credential: credential() });
const auth = getAuth();
const db = getFirestore();

/* 1. Pull every registered user from Firebase Auth (paginated). */
const users = [];
let pageToken;
do {
  const res = await auth.listUsers(1000, pageToken);
  users.push(...res.users);
  pageToken = res.pageToken;
} while (pageToken);

/* 2. Pull Firestore profiles so we know who finished onboarding / tried a look. */
const profiles = new Map();
try {
  const snap = await db.collection("users").get();
  snap.forEach((d) => profiles.set(d.id, d.data()));
} catch {
  /* Firestore optional — Auth list alone still answers "who registered". */
}

const fmt = (t) => (t ? new Date(t).toISOString().slice(0, 16).replace("T", " ") : "—");
const rows = users
  .map((u) => {
    const p = profiles.get(u.uid) || {};
    return {
      email: u.email || u.providerData[0]?.email || "(no email)",
      provider: (u.providerData[0]?.providerId || "password").replace(".com", ""),
      created: u.metadata.creationTime,
      lastLogin: u.metadata.lastSignInTime,
      onboarded: !!p.onboarded,
      tryons: Number(p.tryons || 0),
    };
  })
  .sort((a, b) => new Date(a.created) - new Date(b.created));

/* 3. Funnel summary. */
const total = rows.length;
const loggedInAgain = rows.filter((r) => r.lastLogin && new Date(r.lastLogin) - new Date(r.created) > 60_000).length;
const onboarded = rows.filter((r) => r.onboarded).length;
const triedOn = rows.filter((r) => r.tryons > 0).length;

console.log("\n══════════════  REGISTRATION REPORT  ══════════════");
console.log(`Registered (in Firebase Auth):   ${total}`);
console.log(`Logged in again after signup:    ${loggedInAgain}`);
console.log(`Finished onboarding:             ${onboarded}`);
console.log(`Actually tried a look on:        ${triedOn}`);
console.log("───────────────────────────────────────────────────");

/* 4. Per-user table. */
const pad = (s, n) => String(s).padEnd(n).slice(0, n);
console.log(`${pad("#", 4)}${pad("EMAIL", 34)}${pad("VIA", 9)}${pad("SIGNED UP", 18)}${pad("LAST LOGIN", 18)}${pad("ONB", 5)}TRY`);
rows.forEach((r, i) => {
  console.log(
    `${pad(i + 1, 4)}${pad(r.email, 34)}${pad(r.provider, 9)}${pad(fmt(r.created), 18)}${pad(fmt(r.lastLogin), 18)}${pad(r.onboarded ? "yes" : "—", 5)}${r.tryons}`
  );
});

/* 5. Optional: reconcile against an invite list (scripts/invited.txt). */
const invitePath = new URL("./invited.txt", import.meta.url);
if (existsSync(invitePath)) {
  const invited = readFileSync(invitePath, "utf8")
    .split("\n").map((l) => l.trim().toLowerCase()).filter(Boolean);
  const registeredEmails = new Set(rows.map((r) => r.email.toLowerCase()));
  const missing = invited.filter((e) => !registeredEmails.has(e));
  console.log("\n──────────  INVITE LIST CHECK  ──────────");
  console.log(`Invited:    ${invited.length}`);
  console.log(`Registered: ${invited.length - missing.length}`);
  console.log(`Missing:    ${missing.length}`);
  if (missing.length) {
    console.log("\nStill NOT registered:");
    missing.forEach((e) => console.log("  • " + e));
  }
}
console.log("");
