"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import AppShell from "@/lib/app-shell";
import { getWardrobe, getProfile, getStyleProfile, saveStyleProfile, WardrobeItem, StyleProfile } from "@/lib/store";
import type { Suggestion, WardrobeBrief, Piece } from "@/lib/agent";
import { IconWand, IconSpark, IconHanger, IconSearch } from "@/lib/icons";
import { toast } from "@/lib/toast";
import { useI18n } from "@/lib/i18n";

type RecoState = { busy?: boolean; error?: string; pieces?: Piece[] };
type Provider = "google" | "notion";
type Cond = "clear" | "partly" | "overcast" | "fog" | "drizzle" | "rain" | "snow" | "showers" | "thunder";
type Weather = { tempC: number; cond: Cond; isDay: boolean };

const condEmoji: Record<Cond, string> = {
  clear: "☀️", partly: "⛅", overcast: "☁️", fog: "🌫️",
  drizzle: "🌦️", rain: "🌧️", snow: "❄️", showers: "🌧️", thunder: "⛈️",
};

/* Ask the browser for coordinates (for weather). Resolves null if denied/unavailable. */
const getCoords = (): Promise<{ lat: number; lon: number } | null> =>
  new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => resolve(null),
      { timeout: 6000, maximumAge: 600_000 },
    );
  });

type Coords = { lat: number; lon: number };
const COORDS_KEY = "wearit:coords";
/* Last-known coords, read synchronously so the page never blocks on the GPS prompt. */
const cachedCoords = (): Coords | null => {
  try { const v = localStorage.getItem(COORDS_KEY); return v ? (JSON.parse(v) as Coords) : null; }
  catch { return null; }
};
/* Refresh coords in the background for the next load — never awaited. */
const refreshCoords = () => {
  getCoords().then((c) => { if (c) try { localStorage.setItem(COORDS_KEY, JSON.stringify(c)); } catch {} });
};

/* Stale-while-revalidate cache for the stylist's suggestions (text only, tiny). */
type AgentCache = { suggestions: Suggestion[]; weather: Weather | null; usingCalendar: boolean };
const AGENT_KEY = (uid: string) => `wearit:agent:${uid}`;
const readAgentCache = (uid: string): AgentCache | null => {
  try { const v = localStorage.getItem(AGENT_KEY(uid)); return v ? (JSON.parse(v) as AgentCache) : null; }
  catch { return null; }
};
const writeAgentCache = (uid: string, c: AgentCache) => {
  try { localStorage.setItem(AGENT_KEY(uid), JSON.stringify(c)); } catch { /* ignore */ }
};

const brief = (wd: WardrobeItem[]): WardrobeBrief[] =>
  wd.map((w) => ({ id: w.id, name: w.name, category: w.category, verdict: w.verdict, score: w.score }));

export default function AgentPage() {
  const { t } = useI18n();
  const provLabel = (p: Provider) => (p === "google" ? t.agent.googleCalendar : t.agent.notion);

  /* Map a recommended piece's slot to a try-on category (drives layering). */
  const slotToCat = (slot?: string): "tops" | "bottoms" | "one-pieces" => {
    const s = (slot || "").toLowerCase();
    if (/(bottom|pant|trouser|jean|skirt|short)/.test(s)) return "bottoms";
    if (/(dress|jumpsuit|gown|one-?piece)/.test(s)) return "one-pieces";
    return "tops"; // top, outerwear, shoes → upper layer
  };

  /* Build a /app link that loads every photo piece of a look at once. */
  const wholeLookHref = (pieces: Piece[]): string => {
    const q = pieces
      .filter((p) => p.image)
      .slice(0, 4) // try-on caps at 4 garments
      .map((p) => `garment=${encodeURIComponent(p.image!)}&cat=${slotToCat(p.slot)}`)
      .join("&");
    return `/app?${q}`;
  };
  const [uid, setUid]                 = useState<string | null>(null);
  const [items, setItems]             = useState<WardrobeItem[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [usingCalendar, setUsing]     = useState(false);
  const [weather, setWeather]         = useState<Weather | null>(null);
  const [loading, setLoading]         = useState(true);
  const [style, setStyle]             = useState<StyleProfile | null>(null);
  const [learning, setLearning]       = useState(false);
  const [reco, setReco]               = useState<Record<string, RecoState>>({});
  const [conns, setConns]             = useState<Provider[]>([]);
  const [configured, setConfigured]   = useState<Record<Provider, boolean>>({ google: false, notion: false });

  const suggestOutfit = async (s: Suggestion) => {
    if (!uid) return;
    setReco((p) => ({ ...p, [s.id]: { busy: true } }));
    try {
      const gender = getProfile(uid).gender;
      const r = await fetch("/api/agent/recommend", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ occasion: s.occasion, vibe: s.vibe, style: style?.summary || "", gender }),
      });
      const d = await r.json();
      setReco((p) => ({ ...p, [s.id]: { pieces: d.pieces || [], error: d.error } }));
    } catch {
      setReco((p) => ({ ...p, [s.id]: { error: t.agent.couldntPutLook } }));
    }
  };

  /* Learn (or re-learn) the user's style from their wardrobe + gender. */
  const learnStyle = async (id: string, wd: WardrobeItem[]) => {
    setLearning(true);
    try {
      const gender = getProfile(id).gender;
      const r = await fetch("/api/agent/style", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wardrobe: brief(wd), gender }),
      });
      const s = (await r.json()) as StyleProfile;
      saveStyleProfile(id, s);
      setStyle(s);
      return s;
    } catch { return null; }
    finally { setLearning(false); }
  };

  const load = async (wd: WardrobeItem[], styleSummary: string, showSkeleton = true) => {
    if (showSkeleton) setLoading(true);
    refreshCoords(); // background — updates the cache for next time, never blocks this load
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const token = await auth.currentUser?.getIdToken();
      if (token) headers.Authorization = `Bearer ${token}`;
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const coords = cachedCoords(); // instant; server falls back to edge geo if absent
      const r = await fetch("/api/agent/suggest", {
        method: "POST", headers,
        body: JSON.stringify({ now: new Date().toISOString(), tz, wardrobe: brief(wd), style: styleSummary, ...(coords || {}) }),
      });
      const d = await r.json();
      const sugg: Suggestion[] = Array.isArray(d.suggestions) ? d.suggestions : [];
      const weather: Weather | null = d.weather ?? null;
      setSuggestions(sugg);
      setUsing(!!d.usingCalendar);
      setWeather(weather);
      const id = auth.currentUser?.uid;
      if (id) writeAgentCache(id, { suggestions: sugg, weather, usingCalendar: !!d.usingCalendar });
    } catch {
      if (showSkeleton) setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  const loadIntegrations = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const r = await fetch("/api/integrations", { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (Array.isArray(d.connected)) setConns(d.connected);
      if (d.configured) setConfigured(d.configured);
    } catch { /* ignore */ }
  };

  const connect = async (provider: Provider) => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return;
    window.location.href = `/api/${provider}/connect?token=${encodeURIComponent(token)}`;
  };

  const disconnect = async (provider: Provider) => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return;
    await fetch(`/api/integrations?provider=${provider}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    setConns((c) => c.filter((p) => p !== provider));
    toast(t.agent.disconnectedToast(provLabel(provider)));
    load(items, style?.summary || "");
  };

  // toast + clean up the ?connected / ?error params after an OAuth round-trip
  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    const connected = q.get("connected"), error = q.get("error");
    if (connected) toast(t.agent.connectedToast(connected === "google" ? t.agent.googleCalendar : t.agent.notion), "success");
    else if (error) {
      const msg = error.endsWith("not_configured") ? t.agent.notConfigured : t.agent.couldntConnect;
      toast(msg, "error");
    }
    if (connected || error) window.history.replaceState({}, "", "/agent");
  }, []);

  useEffect(() => onAuthStateChanged(auth, async (u) => {
    if (!u) return;
    setUid(u.uid);
    const wd = getWardrobe(u.uid);
    setItems(wd);
    let s = getStyleProfile(u.uid);
    setStyle(s);
    // Instant paint from the last result — then revalidate quietly (stale-while-revalidate).
    const cached = readAgentCache(u.uid);
    if (cached) {
      setSuggestions(cached.suggestions || []);
      setWeather(cached.weather ?? null);
      setUsing(!!cached.usingCalendar);
      setLoading(false);
    }
    loadIntegrations();
    // (re)learn if we've never learned, or the wardrobe changed since
    if (wd.length > 0 && (!s || s.basedOn !== wd.length)) {
      s = await learnStyle(u.uid, wd);
    }
    load(wd, s?.summary || "", !cached);
  }), []);

  const refresh = async () => {
    if (!uid) return;
    const s = items.length > 0 ? await learnStyle(uid, items) : style;
    load(items, s?.summary || "");
  };

  const imgFor = (id: string | null) => (id ? items.find((i) => i.id === id)?.img : undefined);

  /* Format the "when" chip in the browser's OWN timezone — never trust the server clock. */
  const whenText = (s: Suggestion): string => {
    if (!s.startIso) return s.when;
    const d = new Date(s.startIso);
    if (isNaN(d.getTime())) return s.when;
    const now = new Date();
    const key = (x: Date) => x.toLocaleDateString("en-CA"); // YYYY-MM-DD, local
    const tomorrow = new Date(now.getTime() + 86_400_000);
    const day = key(d) === key(now) ? "Today"
      : key(d) === key(tomorrow) ? "Tomorrow"
      : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    if (s.allDay) return day;
    return `${day} · ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  };

  return (
    <AppShell>
      <div className="page-in" style={{ padding: "48px 44px", maxWidth: 820 }}>
        <p style={{ fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 14, fontWeight: 600 }}>{t.agent.eyebrow}</p>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 28 }}>
          <h1 className="serif" style={{ fontSize: 46, fontWeight: 600, letterSpacing: "-0.035em", color: "var(--ink)" }}>{t.agent.title}</h1>
          <button onClick={refresh} disabled={learning} className="chip" style={{ padding: "9px 16px", borderRadius: 100, fontSize: 13, background: "var(--card)", border: "1px solid var(--border)", color: "var(--ink)", cursor: "pointer", display: "flex", alignItems: "center", gap: 7, opacity: learning ? 0.6 : 1 }}>
            <IconWand size={15} /> {learning ? t.agent.learning : t.agent.refresh}
          </button>
        </div>

        {/* Weather — drives the day's outfit suggestions */}
        {weather && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink)", background: "var(--card)", border: "1px solid var(--border)", padding: "7px 14px", borderRadius: 100, marginBottom: 18 }}>
            <span style={{ fontSize: 15 }}>{condEmoji[weather.cond]}</span>
            <span style={{ color: "var(--muted)" }}>{t.agent.weatherNow}:</span>
            <span style={{ fontWeight: 600 }}>{weather.tempC}°C</span>
            <span style={{ color: "var(--muted)" }}>· {t.agent.weatherConds[weather.cond]}</span>
          </div>
        )}

        {/* Learned style — the agent's memory of your taste */}
        {style && style.summary && (
          <div className="card" style={{ padding: "20px 24px", marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ display: "inline-flex", color: "var(--brand)" }}><IconWand size={16} /></span>
              <p style={{ fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 600 }}>{t.agent.styleLearned}</p>
            </div>
            <p className="serif" style={{ fontSize: 18, fontWeight: 400, color: "var(--ink)", lineHeight: 1.5, letterSpacing: "-0.01em", marginBottom: style.tags?.length ? 14 : 0 }}>{style.summary}</p>
            {style.tags?.length > 0 && (
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {style.tags.map((t) => (
                  <span key={t} style={{ fontSize: 12, color: "var(--brand)", background: "rgba(47,76,110,0.08)", border: "1px solid var(--brand-ring)", padding: "4px 11px", borderRadius: 100 }}>{t}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Connect your calendars — each user links their own Google / Notion */}
        <div className="card" style={{ padding: "18px 22px", marginBottom: 18, background: conns.length ? "var(--card)" : "linear-gradient(180deg, var(--brand-soft), var(--card))", borderColor: "var(--brand-ring)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <span style={{ width: 38, height: 38, borderRadius: 10, background: "var(--brand)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><IconWand size={18} /></span>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{conns.length ? t.agent.yourCalendars : t.agent.connectCalendar}</p>
              <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>{t.agent.calendarDesc}</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {(["google", "notion"] as Provider[]).map((p) => {
              const on = conns.includes(p);
              const label = provLabel(p);
              return on ? (
                <span key={p} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 500, color: "var(--ink)", background: "var(--card)", border: "1px solid var(--brand-ring)", padding: "8px 14px", borderRadius: 100 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#1a7a2e" }} /> {t.agent.connected(label)}
                  <button onClick={() => disconnect(p)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 12, padding: 0, marginLeft: 2, textDecoration: "underline" }}>{t.agent.disconnect}</button>
                </span>
              ) : (
                <button key={p} onClick={() => connect(p)} disabled={!configured[p]} className="btn-dark" style={{ padding: "9px 16px", fontSize: 13, gap: 7, opacity: configured[p] ? 1 : 0.45 }}>
                  {t.agent.connect(label)}{!configured[p] && t.agent.soon}
                </button>
              );
            })}
          </div>
        </div>

        {/* Suggestions */}
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[0, 1, 2].map((i) => <div key={i} className="sk" style={{ height: 116, borderRadius: 16 }} />)}
          </div>
        ) : suggestions.length === 0 ? (
          <div style={{ border: "1px dashed var(--border)", borderRadius: 16, padding: "60px 32px", textAlign: "center", background: "var(--card)" }}>
            <div style={{ display: "inline-flex", color: "var(--faint)", marginBottom: 14 }}><IconWand size={36} /></div>
            <p style={{ fontSize: 15, color: "var(--muted)" }}>{t.agent.nothingToSuggest}</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {suggestions.map((s) => {
              const img = imgFor(s.lookId);
              return (
                <div key={s.id} className="card" style={{ padding: 0, overflow: "hidden", display: "flex", alignItems: "stretch" }}>
                  {img && (
                    <img src={img} alt={s.lookName || ""} style={{ width: 120, objectFit: "cover", flexShrink: 0, borderRight: "1px solid var(--border)" }} />
                  )}
                  <div style={{ padding: "20px 22px", flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--brand)", background: "rgba(47,76,110,0.1)", border: "1px solid var(--brand-ring)", padding: "3px 10px", borderRadius: 100 }}>{whenText(s)}</span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{s.occasion}</span>
                      {s.vibe && <span style={{ fontSize: 12, color: "var(--muted)" }}>· {s.vibe}</span>}
                    </div>
                    <p className="serif" style={{ fontSize: 17, fontWeight: 400, color: "var(--ink)", lineHeight: 1.45, letterSpacing: "-0.01em", marginBottom: 8 }}>{s.message}</p>
                    {s.reason && <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6, marginBottom: 14 }}>{s.reason}</p>}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {s.action === "wardrobe" && s.lookId && (
                        <Link href="/wardrobe" className="btn-dark" style={{ padding: "9px 16px", fontSize: 13, gap: 7 }}>
                          <IconHanger size={15} /> {t.agent.wearThisLook}
                        </Link>
                      )}
                      {s.action === "tryon" && (
                        <Link href="/app" className="btn-dark" style={{ padding: "9px 16px", fontSize: 13, gap: 7 }}>
                          <IconSpark size={15} /> {t.agent.tryALookOn}
                        </Link>
                      )}
                      <button onClick={() => suggestOutfit(s)} disabled={reco[s.id]?.busy} className={s.action === "shop" ? "btn-dark" : "btn-outline"} style={{ padding: "9px 16px", fontSize: 13, gap: 7, display: "inline-flex", alignItems: "center" }}>
                        <IconSearch size={15} /> {reco[s.id]?.busy ? t.agent.puttingTogether : reco[s.id]?.pieces ? t.agent.suggestAnother : t.agent.whatToWear}
                      </button>
                    </div>

                    {/* Outfit recommendation */}
                    {reco[s.id] && !reco[s.id].busy && (
                      reco[s.id].error ? (
                        <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 14 }}>{reco[s.id].error}</p>
                      ) : reco[s.id].pieces?.length ? (
                        <div style={{ marginTop: 16, padding: "16px 18px", border: "1px solid var(--brand-ring)", borderRadius: 12, background: "var(--brand-soft)" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                            <p style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--brand)", fontWeight: 600 }}>{t.agent.heresALook}</p>
                            {reco[s.id].pieces!.filter((p) => p.image).length > 1 && (
                              <Link href={wholeLookHref(reco[s.id].pieces!)} className="btn-dark" style={{ padding: "8px 14px", fontSize: 12.5, gap: 6 }}>
                                <IconSpark size={14} /> {t.agent.tryWholeLook(Math.min(4, reco[s.id].pieces!.filter((p) => p.image).length))}
                              </Link>
                            )}
                          </div>
                          {reco[s.id].pieces!.some((p) => p.image) ? (
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(132px,1fr))", gap: 12 }}>
                              {reco[s.id].pieces!.map((p, pi) => (
                                <div key={pi} style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", background: "var(--card)", display: "flex", flexDirection: "column" }}>
                                  <div style={{ aspectRatio: "3/4", background: "#fff", overflow: "hidden", position: "relative" }}>
                                    {p.image
                                      ? <img src={p.image} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                      : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--faint)" }}><IconHanger size={26} /></div>}
                                    <span style={{ position: "absolute", top: 8, left: 8, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600, color: "var(--brand)", background: "rgba(255,255,255,0.9)", padding: "3px 7px", borderRadius: 100 }}>{p.slot}</span>
                                  </div>
                                  <div style={{ padding: "10px 11px", display: "flex", flexDirection: "column", gap: 5, flex: 1 }}>
                                    <p style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.name}</p>
                                    {(p.brand || p.price) && (
                                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginTop: "auto" }}>
                                        {p.brand && <span style={{ fontSize: 10, color: "var(--faint)", textTransform: "capitalize" }}>{p.brand}</span>}
                                        {p.price && <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>{p.price}</span>}
                                      </div>
                                    )}
                                    <div style={{ display: "flex", gap: 6 }}>
                                      {p.link && <a href={p.link} target="_blank" rel="noopener noreferrer" className="btn-outline" style={{ flex: 1, padding: "6px", fontSize: 11, justifyContent: "center" }}>{t.agent.view}</a>}
                                      {p.image && <Link href={`/app?garment=${encodeURIComponent(p.image)}`} className="btn-dark" style={{ flex: 1, padding: "6px", fontSize: 11, justifyContent: "center", gap: 4 }}><IconSpark size={12} /> {t.agent.tryShort}</Link>}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                              {reco[s.id].pieces!.map((p, pi) => (
                                <div key={pi} style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
                                  <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 100, background: "var(--brand)", color: "#fff", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1 }}>{pi + 1}</span>
                                  <div style={{ minWidth: 0 }}>
                                    <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", lineHeight: 1.4 }}>{p.name}</p>
                                    {p.detail && <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5, marginTop: 1 }}>{p.detail}</p>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : null
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
