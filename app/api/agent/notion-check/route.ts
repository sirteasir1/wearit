import { NextResponse } from "next/server";
import { getNotionEvents } from "@/lib/notion";

/* /api/agent/notion-check — diagnose the Notion connection + why events are/aren't picked up. */
export async function GET() {
  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.NOTION_DATABASE_ID;

  if (!token) return NextResponse.json({ ok: false, reason: "NOTION_TOKEN is not set (restart dev after adding)." });
  if (!dbId)  return NextResponse.json({ ok: false, reason: "NOTION_DATABASE_ID is not set." });

  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
      body: JSON.stringify({ page_size: 10 }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ ok: false, status: res.status, notion: body });
    }

    type Prop = { type?: string; title?: Array<{ plain_text?: string }>; date?: { start?: string } };
    const rows = (body.results || []).map((page: { properties?: Record<string, Prop> }) => {
      const props = page.properties || {};
      const propTypes: Record<string, string> = {};
      let title = "";
      let date: string | null = null;
      for (const k of Object.keys(props)) {
        const p = props[k];
        propTypes[k] = p.type || "?";
        if (p.type === "title" && p.title?.length) title = p.title.map((t) => t.plain_text || "").join("");
        if (p.type === "date" && p.date?.start && !date) date = p.date.start;
      }
      return { title, date, propTypes };
    });

    const picked = await getNotionEvents(new Date());

    const hasDateProp = rows.some((r: { propTypes: Record<string, string> }) => Object.values(r.propTypes).includes("date"));
    let hint = "Connected ✓";
    if (rows.length === 0) hint = "Connected, but the database is empty.";
    else if (!hasDateProp) hint = "The database has NO property of type 'Date'. Add a Date column (or use a calendar database). Created/edited-time columns don't count.";
    else if (picked.length === 0) hint = "There IS a Date column, but no entries are dated today or in the future — the stylist only plans upcoming events.";

    return NextResponse.json({ ok: true, rawCount: rows.length, pickedEvents: picked.length, hasDateProp, hint, rows });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}
