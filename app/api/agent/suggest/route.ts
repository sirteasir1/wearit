import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getNotionEvents } from "@/lib/notion";
import { adminAuth } from "@/lib/firebase-admin";
import { getUserEvents } from "@/lib/integrations";
import type { AgentEvent, Suggestion, WardrobeBrief } from "@/lib/agent";

export const maxDuration = 30;

/* ── Timezone helpers ──────────────────────────────────────────────────────
   The server runs in UTC; the user's "now" is an instant (ISO) plus their IANA
   timezone. Everything human-facing (hour of day, "Today/Tomorrow", clock time)
   must be computed in THEIR zone, or the stylist reasons about the wrong time. */

/** Local YYYY-MM-DD for a given instant in a timezone (for day comparisons). */
function dateKey(d: Date, tz: string): string {
  try { return d.toLocaleDateString("en-CA", { timeZone: tz }); }
  catch { return d.toISOString().slice(0, 10); }
}

/** Hour of day (0–23) for an instant in a timezone. */
function localHour(d: Date, tz: string): number {
  try {
    const h = parseInt(d.toLocaleString("en-US", { timeZone: tz, hour: "2-digit", hour12: false }), 10);
    return Number.isFinite(h) ? h % 24 : d.getUTCHours();
  } catch { return d.getUTCHours(); }
}

function whenLabel(iso: string, allDay: boolean | undefined, now: Date, tz: string): string {
  const d = new Date(iso);
  const nowKey = dateKey(now, tz);
  const isTomorrow = dateKey(d, tz) === dateKey(new Date(now.getTime() + 86_400_000), tz);
  const day = dateKey(d, tz) === nowKey ? "Today"
    : isTomorrow ? "Tomorrow"
    : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz });
  if (allDay) return day;
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
  return `${day} · ${time}`;
}

/* ── Weather (Open-Meteo, keyless) ─────────────────────────────────────────── */

type Cond = "clear" | "partly" | "overcast" | "fog" | "drizzle" | "rain" | "snow" | "showers" | "thunder";
export interface Weather { tempC: number; cond: Cond; isDay: boolean }

/** WMO weather code → coarse condition bucket. */
function wmoCond(code: number): Cond {
  if (code === 0) return "clear";
  if (code <= 2) return "partly";
  if (code === 3) return "overcast";
  if (code <= 48) return "fog";
  if (code <= 57) return "drizzle";
  if (code <= 67) return "rain";
  if (code <= 77) return "snow";
  if (code <= 82) return "showers";
  if (code <= 86) return "snow";
  return "thunder";
}

const condLabel: Record<Cond, string> = {
  clear: "clear skies", partly: "partly cloudy", overcast: "overcast", fog: "fog",
  drizzle: "drizzle", rain: "rain", snow: "snow", showers: "rain showers", thunder: "thunderstorms",
};

async function getWeather(lat: number, lon: number): Promise<Weather | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day`;
    const r = await fetch(url, { signal: AbortSignal.timeout(4500) });
    if (!r.ok) return null;
    const c = (await r.json())?.current;
    if (!c || typeof c.temperature_2m !== "number") return null;
    return { tempC: Math.round(c.temperature_2m), cond: wmoCond(Number(c.weather_code)), isDay: c.is_day === 1 };
  } catch { return null; }
}

/** One short, weather-aware dressing note for the heuristic fallback. */
function weatherTip(w: Weather): string {
  if (/rain|drizzle|showers|thunder/.test(w.cond)) return " Rain's around — go water-resistant.";
  if (w.cond === "snow") return " Snow out — warm, waterproof layers.";
  if (w.tempC <= 0) return " It's freezing — bundle up with a warm coat.";
  if (w.tempC <= 10) return " It's cold — add a jacket or coat.";
  if (w.tempC <= 17) return " It's cool — a light layer helps.";
  if (w.tempC >= 28) return " It's hot — keep it light and breathable.";
  return "";
}

/* Classify an event's occasion → needed vibe / formality. */
function classify(title: string): { vibe: string; formal: boolean; kind: "work" | "evening" | "casual" } {
  const t = title.toLowerCase();
  if (/(meeting|sync|presentation|interview|review|client|pitch|board|stand-?up|call|conference|work|deadline|demo|standup|1:1|one on one)/.test(t))
    return { vibe: "smart, put-together", formal: true, kind: "work" };
  if (/(dinner|date|party|drinks|birthday|wedding|club|gala|celebration|night out|concert|brunch)/.test(t))
    return { vibe: "elevated going-out", formal: true, kind: "evening" };
  return { vibe: "relaxed casual", formal: false, kind: "casual" };
}

/* Always have at least one occasion so the agent is proactive even without a calendar. */
function defaultEvents(now: Date, tz: string): AgentEvent[] {
  const h = localHour(now, tz);
  const label = h < 11 ? "Today" : h < 17 ? "This afternoon" : "Tonight";
  return [{ id: "today", title: label, start: now.toISOString(), source: "time" }];
}

export async function POST(req: NextRequest) {
  let wardrobe: WardrobeBrief[] = [];
  let nowIso = new Date().toISOString();
  let style = "";
  let tz = "UTC";
  let lat: number | null = null, lon: number | null = null;
  try {
    const body = await req.json();
    wardrobe = Array.isArray(body.wardrobe) ? body.wardrobe.slice(0, 40) : [];
    if (typeof body.now === "string") nowIso = body.now;
    if (typeof body.style === "string") style = body.style;
    if (typeof body.tz === "string" && body.tz) tz = body.tz;
    if (typeof body.lat === "number" && typeof body.lon === "number") { lat = body.lat; lon = body.lon; }
  } catch { /* defaults */ }

  const now = new Date(nowIso);

  // Location for weather: client coords first, else Vercel's edge geo headers.
  if (lat === null || lon === null) {
    const hLat = parseFloat(req.headers.get("x-vercel-ip-latitude") || "");
    const hLon = parseFloat(req.headers.get("x-vercel-ip-longitude") || "");
    if (Number.isFinite(hLat) && Number.isFinite(hLon)) { lat = hLat; lon = hLon; }
  }

  // Kick off the weather fetch now so it overlaps the calendar round-trips.
  const weatherP: Promise<Weather | null> =
    lat !== null && lon !== null ? getWeather(lat, lon) : Promise.resolve(null);

  // Per-user calendars first (Google + Notion, via their stored OAuth tokens).
  let events: AgentEvent[] = [];
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const { uid } = await adminAuth().verifyIdToken(authHeader.split("Bearer ")[1]);
      events = await getUserEvents(uid, now);
    } catch { /* not signed in / token invalid — fall through */ }
  }
  // Dev fallback: the single env-configured Notion integration (your own).
  if (events.length === 0) events = await getNotionEvents(now);

  const usingCalendar = events.length > 0;
  if (!usingCalendar) events = defaultEvents(now, tz);

  const weather = await weatherP;

  const suggestions = await buildSuggestions(events, wardrobe, now, tz, style, weather);
  return NextResponse.json({ suggestions, usingCalendar, weather });
}

async function buildSuggestions(events: AgentEvent[], wardrobe: WardrobeBrief[], now: Date, tz: string, style: string, weather: Weather | null): Promise<Suggestion[]> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (apiKey) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const rightNow = now.toLocaleString("en-US", { timeZone: tz, weekday: "long", hour: "numeric", minute: "2-digit", day: "numeric", month: "long" });
      const weatherLine = weather
        ? `Current weather where they are: ${weather.tempC}°C, ${condLabel[weather.cond]}${weather.isDay ? "" : ", after dark"}. Factor this into EVERY suggestion — layering, fabrics, outerwear and footwear (a warm coat if it's cold, breathable pieces if it's hot, water-resistant if it's wet). Mention the weather choice naturally in the message.\n`
        : "";
      const prompt = `You are WearIt — a proactive personal stylist who KNOWS this person's taste. Speak directly and warmly, like a friend who plans outfits. Always respect their style profile.
${style ? `Their learned style: ${style}\n` : ""}Right now (their local time): ${rightNow}.
${weatherLine}Upcoming events:
${events.map((e) => `- [${e.id}] ${e.title} @ ${e.start}${e.allDay ? " (all day)" : ""}`).join("\n") || "- none"}
The user's saved looks (wardrobe), reference by id:
${wardrobe.length ? wardrobe.map((w) => `- [${w.id}] ${w.name} | ${w.category} | verdict ${w.verdict} | ${w.score}/10`).join("\n") : "- empty wardrobe"}

Match the OCCASION'S FORMALITY, this is critical:
- work/meeting/presentation/interview → smart, put-together (NOT a casual tee).
- dinner/date/party/night out → elevated going-out.
- walk/coffee/gym/errand/casual → relaxed casual.
For each event: ONLY set "lookId" to a saved look if that look genuinely fits the occasion's formality. A casual tee does NOT fit a meeting or a presentation — in that case set lookId null and action "shop" (meaning: put a fresh outfit together for them) and say so warmly. This is styling only — never mention buying, shopping or prices. Use action "wardrobe" only for a real match, "tryon" if they should try a new garment on, "shop" to suggest a new outfit to wear. Keep "message" short, proactive and specific to the occasion, e.g. "Your 9am presentation calls for something sharper than your tees — want me to put a look together?"
Respond ONLY with a JSON array, no markdown:
[{"eventId":"<id>","occasion":"<short>","vibe":"<e.g. smart casual>","message":"<proactive line>","lookId":"<id or null>","reason":"<one short why>","action":"wardrobe|tryon|shop"}]
Max ${Math.min(events.length, 5)} items.`;

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]) as Array<Record<string, unknown>>;
        return parsed.slice(0, 6).map((s, i) => {
          const ev = events.find((e) => e.id === s.eventId) || events[i] || events[0];
          const lookId = typeof s.lookId === "string" && wardrobe.some((w) => w.id === s.lookId) ? (s.lookId as string) : null;
          return {
            id: `${ev?.id || i}-${i}`,
            when: ev ? whenLabel(ev.start, ev.allDay, now, tz) : "Today",
            startIso: ev?.start,
            allDay: ev?.allDay,
            occasion: String(s.occasion || ev?.title || "Today"),
            vibe: String(s.vibe || ""),
            message: String(s.message || ""),
            lookId,
            lookName: lookId ? wardrobe.find((w) => w.id === lookId)?.name : undefined,
            reason: String(s.reason || ""),
            action: (s.action === "wardrobe" || s.action === "tryon" || s.action === "shop") ? s.action : (lookId ? "wardrobe" : "tryon"),
          } as Suggestion;
        });
      }
    } catch (e) {
      console.error("[agent] gemini failed:", e instanceof Error ? e.message : e);
    }
  }

  // Heuristic fallback (no Gemini / rate-limited) — context-aware, varied per occasion.
  const best = [...wardrobe].sort((a, b) => b.score - a.score)[0];
  const wTip = weather ? weatherTip(weather) : "";
  return events.slice(0, 5).map((ev, i) => {
    const c = classify(ev.title);
    let message: string, reason: string, action: Suggestion["action"], lookId: string | null;

    if (!c.formal && best) {
      // casual occasion → wear a saved (casual) look
      lookId = best.id; action = "wardrobe";
      message = `For "${ev.title}", keep it easy — your "${best.name}" is a solid pick. Want to wear it?`;
      reason = "Relaxed plans suit your saved casual look.";
    } else if (c.formal) {
      // work / evening → casual saved looks won't cut it; find/try something sharper
      lookId = null; action = "shop";
      message = c.kind === "work"
        ? `"${ev.title}" calls for something sharper than your casual looks — want me to put a look together?`
        : `"${ev.title}" deserves an elevated look. Want me to put one together for you?`;
      reason = `This occasion reads ${c.vibe}.`;
    } else {
      // casual but empty wardrobe
      lookId = null; action = "tryon";
      message = `You've got "${ev.title}". Try a look on and I'll style you.`;
      reason = "Your wardrobe is empty — start with a try-on.";
    }
    message += wTip;

    return {
      id: `${ev.id}-${i}`,
      when: whenLabel(ev.start, ev.allDay, now, tz),
      startIso: ev.start,
      allDay: ev.allDay,
      occasion: ev.title,
      vibe: c.vibe,
      message, lookId,
      lookName: lookId ? best?.name : undefined,
      reason, action,
    } as Suggestion;
  });
}
