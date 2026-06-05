/* Per-user calendar integrations (Google Calendar + Notion).
   Tokens are stored server-side in a private `integrations/{uid}` collection
   (NOT the client-readable users doc) and only ever read by API routes. */
import crypto from "node:crypto";
import { adminDb } from "./firebase-admin";
import type { AgentEvent } from "./agent";

export type Provider = "google" | "notion";

interface GoogleConn { refreshToken: string; accessToken?: string; expiry?: number; email?: string }
interface NotionConn { accessToken: string; workspaceName?: string; botId?: string }
export interface Integrations { google?: GoogleConn; notion?: NotionConn }

const stateSecret = () => process.env.OAUTH_STATE_SECRET || process.env.FIREBASE_ADMIN_PRIVATE_KEY || "wearit-dev-secret";

/* Sign the uid into an unguessable OAuth `state` so the callback can trust it. */
export function signState(uid: string): string {
  const sig = crypto.createHmac("sha256", stateSecret()).update(uid).digest("base64url");
  return `${Buffer.from(uid).toString("base64url")}.${sig}`;
}
export function verifyState(state: string | null): string | null {
  if (!state || !state.includes(".")) return null;
  const [b64, sig] = state.split(".");
  let uid: string;
  try { uid = Buffer.from(b64, "base64url").toString("utf8"); } catch { return null; }
  const expected = crypto.createHmac("sha256", stateSecret()).update(uid).digest("base64url");
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) ? uid : null;
}

const ref = (uid: string) => adminDb().collection("integrations").doc(uid);

export async function saveIntegration(uid: string, provider: Provider, data: GoogleConn | NotionConn) {
  await ref(uid).set({ [provider]: data }, { merge: true });
}
export async function getIntegrations(uid: string): Promise<Integrations> {
  const snap = await ref(uid).get();
  return (snap.exists ? snap.data() : {}) as Integrations;
}
export async function removeIntegration(uid: string, provider: Provider) {
  const { FieldValue } = await import("firebase-admin/firestore");
  await ref(uid).set({ [provider]: FieldValue.delete() }, { merge: true });
}

/* ───────────────────────── Google Calendar ───────────────────────── */

export function googleAuthUrl(origin: string, state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
    redirect_uri: `${origin}/api/google/callback`,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.readonly openid email",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function exchangeGoogleCode(code: string, origin: string): Promise<GoogleConn> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
      redirect_uri: `${origin}/api/google/callback`,
      grant_type: "authorization_code",
    }),
  });
  const d = await r.json();
  if (!r.ok || !d.refresh_token) throw new Error(d.error_description || d.error || "Google token exchange failed");
  return { refreshToken: d.refresh_token, accessToken: d.access_token, expiry: Date.now() + (d.expires_in || 3600) * 1000 };
}

async function freshGoogleToken(uid: string, conn: GoogleConn): Promise<string> {
  if (conn.accessToken && conn.expiry && conn.expiry > Date.now() + 60_000) return conn.accessToken;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
      refresh_token: conn.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const d = await r.json();
  if (!r.ok || !d.access_token) throw new Error("Google token refresh failed");
  const accessToken = d.access_token as string;
  await saveIntegration(uid, "google", { ...conn, accessToken, expiry: Date.now() + (d.expires_in || 3600) * 1000 });
  return accessToken;
}

async function getGoogleEvents(uid: string, conn: GoogleConn, now: Date): Promise<AgentEvent[]> {
  try {
    const token = await freshGoogleToken(uid, conn);
    const timeMin = new Date(now.getTime() - 6 * 3600_000).toISOString();
    const timeMax = new Date(now.getTime() + 14 * 24 * 3600_000).toISOString();
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=10&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return [];
    const d = await r.json();
    return (d.items || [])
      .filter((e: { status?: string }) => e.status !== "cancelled")
      .map((e: { id: string; summary?: string; start?: { dateTime?: string; date?: string } }) => ({
        id: `g-${e.id}`,
        title: e.summary || "Event",
        start: e.start?.dateTime || e.start?.date || now.toISOString(),
        allDay: !e.start?.dateTime,
        source: "calendar" as const,
      }));
  } catch { return []; }
}

/* ───────────────────────── Notion ───────────────────────── */

export function notionAuthUrl(origin: string, state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.NOTION_OAUTH_CLIENT_ID || "",
    redirect_uri: `${origin}/api/notion/callback`,
    response_type: "code",
    owner: "user",
    state,
  });
  return `https://api.notion.com/v1/oauth/authorize?${p}`;
}

export async function exchangeNotionCode(code: string, origin: string): Promise<NotionConn> {
  const basic = Buffer.from(`${process.env.NOTION_OAUTH_CLIENT_ID}:${process.env.NOTION_OAUTH_CLIENT_SECRET}`).toString("base64");
  const r = await fetch("https://api.notion.com/v1/oauth/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json", "Notion-Version": "2022-06-28" },
    body: JSON.stringify({ grant_type: "authorization_code", code, redirect_uri: `${origin}/api/notion/callback` }),
  });
  const d = await r.json();
  if (!r.ok || !d.access_token) throw new Error(d.error_description || d.error || "Notion token exchange failed");
  return { accessToken: d.access_token, workspaceName: d.workspace_name, botId: d.bot_id };
}

interface NotionProp { type: string; title?: { plain_text: string }[]; date?: { start: string } }
interface NotionRow { id: string; properties: Record<string, NotionProp> }

async function getNotionEventsForUser(conn: NotionConn, now: Date): Promise<AgentEvent[]> {
  const token = conn.accessToken;
  const headers = { Authorization: `Bearer ${token}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" };
  try {
    // find databases this user shared with the integration
    const sr = await fetch("https://api.notion.com/v1/search", {
      method: "POST", headers,
      body: JSON.stringify({ filter: { property: "object", value: "database" }, page_size: 10 }),
    });
    if (!sr.ok) return [];
    const sd = await sr.json();
    const dbs: { id: string; properties: Record<string, { type: string }> }[] = sd.results || [];
    const events: AgentEvent[] = [];

    for (const db of dbs.slice(0, 4)) {
      const dateProp = Object.entries(db.properties || {}).find(([, p]) => p.type === "date")?.[0];
      const titleProp = Object.entries(db.properties || {}).find(([, p]) => p.type === "title")?.[0];
      if (!dateProp) continue;
      const qr = await fetch(`https://api.notion.com/v1/databases/${db.id}/query`, {
        method: "POST", headers,
        body: JSON.stringify({ page_size: 8, sorts: [{ property: dateProp, direction: "ascending" }] }),
      });
      if (!qr.ok) continue;
      const qd = await qr.json();
      for (const row of (qd.results || []) as NotionRow[]) {
        const dateVal = row.properties[dateProp]?.date?.start;
        if (!dateVal) continue;
        const start = new Date(dateVal);
        if (start.getTime() < now.getTime() - 6 * 3600_000) continue;
        const title = (titleProp && row.properties[titleProp]?.title?.map((t) => t.plain_text).join("")) || "Event";
        events.push({ id: `n-${row.id}`, title, start: start.toISOString(), allDay: dateVal.length <= 10, source: "notion" });
      }
    }
    return events;
  } catch { return []; }
}

/* ───────────────────────── Unified ───────────────────────── */

/* Merge a user's connected calendars into one upcoming-events list. */
export async function getUserEvents(uid: string, now: Date): Promise<AgentEvent[]> {
  const integ = await getIntegrations(uid);
  const lists = await Promise.all([
    integ.google ? getGoogleEvents(uid, integ.google, now) : Promise.resolve([]),
    integ.notion ? getNotionEventsForUser(integ.notion, now) : Promise.resolve([]),
  ]);
  return lists.flat()
    .filter((e) => new Date(e.start).getTime() >= now.getTime() - 6 * 3600_000)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    .slice(0, 6);
}

export async function connectedProviders(uid: string): Promise<Provider[]> {
  const integ = await getIntegrations(uid);
  const out: Provider[] = [];
  if (integ.google) out.push("google");
  if (integ.notion) out.push("notion");
  return out;
}
