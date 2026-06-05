import type { AgentEvent } from "./agent";

type NotionProp = {
  type?: string;
  title?: Array<{ plain_text?: string }>;
  date?: { start?: string };
};

/* Read upcoming dated entries from a Notion database (calendar / tasks).
   Auto-detects the title property and the first date property.
   Uses the stable REST API directly. Returns [] (safe) if not configured. */
export async function getNotionEvents(now: Date = new Date()): Promise<AgentEvent[]> {
  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.NOTION_DATABASE_ID;
  if (!token || !dbId) return [];

  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ page_size: 30 }),
    });
    if (!res.ok) {
      console.error("[notion]", res.status, await res.text().catch(() => ""));
      return [];
    }
    const data = (await res.json()) as { results?: Array<{ id: string; properties?: Record<string, NotionProp> }> };

    const events: AgentEvent[] = [];
    for (const page of data.results || []) {
      const props = page.properties || {};
      let title = "";
      let start: string | null = null;
      let allDay = false;

      for (const key of Object.keys(props)) {
        const p = props[key];
        if (p.type === "title" && p.title?.length) {
          title = p.title.map((t) => t.plain_text || "").join("").trim();
        }
        if (p.type === "date" && p.date?.start && !start) {
          start = p.date.start;
          allDay = !p.date.start.includes("T");
        }
      }
      if (!title || !start) continue;
      events.push({ id: page.id, title, start, allDay, source: "notion" });
    }

    const from = now.getTime() - 6 * 3600 * 1000;
    return events
      .filter((e) => new Date(e.start).getTime() >= from)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
      .slice(0, 6);
  } catch (e) {
    console.error("[notion] events fetch failed:", e instanceof Error ? e.message : e);
    return [];
  }
}
