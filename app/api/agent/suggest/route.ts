import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getNotionEvents } from "@/lib/notion";
import type { AgentEvent, Suggestion, WardrobeBrief } from "@/lib/agent";

export const maxDuration = 30;

function whenLabel(iso: string, allDay: boolean | undefined, now: Date): string {
  const d = new Date(iso);
  const sameDay = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const day = sameDay ? "Today" : isTomorrow ? "Tomorrow" : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  if (allDay) return day;
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
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
function defaultEvents(now: Date): AgentEvent[] {
  const h = now.getHours();
  const label = h < 11 ? "Today" : h < 17 ? "This afternoon" : "Tonight";
  return [{ id: "today", title: label, start: now.toISOString(), source: "time" }];
}

export async function POST(req: NextRequest) {
  let wardrobe: WardrobeBrief[] = [];
  let nowIso = new Date().toISOString();
  let style = "";
  try {
    const body = await req.json();
    wardrobe = Array.isArray(body.wardrobe) ? body.wardrobe.slice(0, 40) : [];
    if (typeof body.now === "string") nowIso = body.now;
    if (typeof body.style === "string") style = body.style;
  } catch { /* defaults */ }

  const now = new Date(nowIso);
  let events = await getNotionEvents(now);
  const usingCalendar = events.length > 0;
  if (!usingCalendar) events = defaultEvents(now);

  const suggestions = await buildSuggestions(events, wardrobe, now, style);
  return NextResponse.json({ suggestions, usingCalendar });
}

async function buildSuggestions(events: AgentEvent[], wardrobe: WardrobeBrief[], now: Date, style: string): Promise<Suggestion[]> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (apiKey) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const prompt = `You are WearIt — a proactive personal stylist who KNOWS this person's taste. Speak directly and warmly, like a friend who plans outfits. Always respect their style profile.
${style ? `Their learned style: ${style}\n` : ""}Right now: ${now.toString()}.
Upcoming events:
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
            when: ev ? whenLabel(ev.start, ev.allDay, now) : "Today",
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

    return {
      id: `${ev.id}-${i}`,
      when: whenLabel(ev.start, ev.allDay, now),
      occasion: ev.title,
      vibe: c.vibe,
      message, lookId,
      lookName: lookId ? best?.name : undefined,
      reason, action,
    } as Suggestion;
  });
}
