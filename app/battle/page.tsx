"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import AppShell from "@/lib/app-shell";
import { getWardrobe, WardrobeItem, dataURLToThumb } from "@/lib/store";
import {
  createBattle, fetchMyBattles, Battle,
  MIN_OPTIONS, MAX_OPTIONS,
} from "@/lib/battle";
import { IconBattle, IconArrowRight, IconCheck, IconShare, IconSpark } from "@/lib/icons";
import { toast } from "@/lib/toast";

function timeLeft(expiresAt: number): string {
  const ms = expiresAt - Date.now();
  if (ms <= 0) return "Ended";
  const h = Math.floor(ms / 3_600_000);
  if (h >= 1) return `${h}h left`;
  return `${Math.max(1, Math.floor(ms / 60_000))}m left`;
}

function leader(b: Battle): { name: string; pct: number } | null {
  if (!b.totalVotes) return null;
  const top = [...b.options].sort((a, c) => c.votes - a.votes)[0];
  return { name: top.name, pct: Math.round((top.votes / b.totalVotes) * 100) };
}

export default function BattlePage() {
  const [uid, setUid]         = useState<string | null>(null);
  const [looks, setLooks]     = useState<WardrobeItem[]>([]);
  const [picked, setPicked]   = useState<string[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy]       = useState(false);
  const [created, setCreated] = useState<{ id: string; url: string } | null>(null);
  const [mine, setMine]       = useState<Battle[]>([]);

  const loadMine = useCallback(async () => {
    const t = await auth.currentUser?.getIdToken();
    if (!t) return;
    try { setMine(await fetchMyBattles(t)); } catch { /* ignore */ }
  }, []);

  useEffect(() => onAuthStateChanged(auth, (u) => {
    if (!u) return;
    setUid(u.uid);
    setLooks(getWardrobe(u.uid));
    loadMine();
  }), [loadMine]);

  const toggle = (id: string) => {
    setPicked((p) => {
      if (p.includes(id)) return p.filter((x) => x !== id);
      if (p.length >= MAX_OPTIONS) { toast(`Up to ${MAX_OPTIONS} looks`, "error"); return p; }
      return [...p, id];
    });
  };

  const create = async () => {
    if (picked.length < MIN_OPTIONS || busy) return;
    setBusy(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Please sign in again");
      // keep selection order; shrink each thumbnail so the battle doc stays light
      const chosen = await Promise.all(
        picked
          .map((id) => looks.find((l) => l.id === id))
          .filter((l): l is WardrobeItem => !!l)
          .map(async (l) => ({ name: l.name, score: l.score, image: await dataURLToThumb(l.img, 480, 0.6) }))
      );
      const res = await createBattle(token, { question: question.trim(), options: chosen });
      setCreated(res);
      setPicked([]); setQuestion("");
      toast("Battle created — share it!", "success");
      loadMine();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not create battle", "error");
    } finally {
      setBusy(false);
    }
  };

  const share = async (url: string) => {
    const nav = navigator as Navigator & { share?: (d: { title?: string; text?: string; url?: string }) => Promise<void> };
    const payload = { title: "Wearit · which look?", text: "Vote on my look 👀", url };
    try {
      if (nav.share) { await nav.share(payload); return; }
    } catch { /* fall through to copy */ }
    await navigator.clipboard.writeText(url);
    toast("Link copied", "success");
  };

  return (
    <AppShell>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px 80px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <IconBattle size={26} style={{ color: "var(--brand)" }} />
          <h1 className="serif" style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.035em", color: "var(--ink)" }}>Outfit Battle</h1>
        </div>
        <p style={{ fontSize: 15, color: "var(--muted)", marginBottom: 30, fontWeight: 300 }}>
          Pick {MIN_OPTIONS}–{MAX_OPTIONS} of your looks, send the link to friends, and let them vote on which one wins.
        </p>

        {/* Just-created share card */}
        {created && (
          <div style={{ border: "1px solid var(--brand)", background: "var(--card)", borderRadius: 14, padding: 18, marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, color: "var(--brand)" }}>
              <IconCheck size={18} /> <span style={{ fontWeight: 600, fontSize: 14 }}>Your battle is live</span>
            </div>
            <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14, wordBreak: "break-all" }}>{created.url}</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn-dark" onClick={() => share(created.url)} style={{ padding: "11px 18px", borderRadius: 8, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
                <IconShare size={16} /> Share
              </button>
              <Link href={`/b/${created.id}`} className="btn-ghost" style={{ padding: "11px 18px", borderRadius: 8, fontSize: 14, border: "1px solid var(--border)", color: "var(--ink)", textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}>
                See results <IconArrowRight size={15} />
              </Link>
            </div>
          </div>
        )}

        {/* Picker */}
        {looks.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 20px", border: "1px dashed var(--border)", borderRadius: 14, marginBottom: 36 }}>
            <div style={{ display: "inline-flex", color: "var(--faint)", marginBottom: 14 }}><IconSpark size={34} /></div>
            <h3 className="serif" style={{ fontSize: 22, fontWeight: 600, color: "var(--ink)", marginBottom: 8 }}>No looks yet</h3>
            <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 18, fontWeight: 300 }}>Try a few outfits on first — saved looks become your battle options.</p>
            <Link href="/app" className="btn-dark" style={{ padding: "12px 20px", borderRadius: 8, fontSize: 14, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8 }}>
              Try something on <IconArrowRight size={15} />
            </Link>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <p style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--faint)", fontWeight: 500 }}>Pick your contenders</p>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{picked.length}/{MAX_OPTIONS} selected</span>
            </div>
            <p className={picked.length === 0 ? "bt-tap" : undefined} style={{ fontSize: 13, color: picked.length === 0 ? "var(--brand)" : "var(--muted)", fontWeight: 400, marginBottom: 14, display: "inline-flex", alignItems: "center", gap: 6 }}>
              👆 Tap a look to add it — choose {MIN_OPTIONS}–{MAX_OPTIONS}.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 12, marginBottom: 20 }}>
              {looks.map((l) => {
                const idx = picked.indexOf(l.id);
                const on = idx !== -1;
                return (
                  <button key={l.id} onClick={() => toggle(l.id)} className={`bt-card${on ? " on" : ""}`} style={{
                    position: "relative", padding: 0, border: on ? "2.5px solid var(--brand)" : "1px solid var(--border)",
                    borderRadius: 12, overflow: "hidden", background: "var(--card)", cursor: "pointer", aspectRatio: "3/4",
                  }}>
                    <img src={l.img} alt={l.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    {on ? (
                      <span style={{ position: "absolute", top: 6, left: 6, width: 24, height: 24, borderRadius: 100, background: "var(--brand)", color: "#fff", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.25)" }}>{idx + 1}</span>
                    ) : (
                      <span className="bt-tap-pill">+ Add</span>
                    )}
                  </button>
                );
              })}
            </div>

            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question (optional) — e.g. Which for the date?"
              maxLength={140}
              style={{ width: "100%", padding: "13px 15px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", color: "var(--ink)", fontSize: 14, marginBottom: 16, fontFamily: "'Hanken Grotesk',sans-serif" }}
            />

            <button className={`btn-dark${picked.length >= MIN_OPTIONS && !busy ? " btn-ready" : ""}`} onClick={create} disabled={picked.length < MIN_OPTIONS || busy}
              style={{ width: "100%", padding: "16px", fontSize: 15, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 44 }}>
              {busy ? <div className="spinner" style={{ width: 18, height: 18 }} /> : <><IconBattle size={18} /> Create battle{picked.length >= MIN_OPTIONS ? ` · ${picked.length} looks` : ""}</>}
            </button>
          </>
        )}

        {/* My battles */}
        {mine.length > 0 && (
          <>
            <p style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--faint)", fontWeight: 500, marginBottom: 14 }}>Your battles</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {mine.map((b) => {
                const lead = leader(b);
                return (
                  <Link key={b.id} href={`/b/${b.id}`} style={{ display: "flex", alignItems: "center", gap: 14, padding: 12, border: "1px solid var(--border)", borderRadius: 12, background: "var(--card)", textDecoration: "none" }}>
                    <div style={{ display: "flex", flexShrink: 0 }}>
                      {b.options.slice(0, 3).map((o, i) => (
                        <img key={o.id} src={o.imageUrl} alt="" style={{ width: 44, height: 56, borderRadius: 7, objectFit: "cover", marginLeft: i ? -14 : 0, border: "2px solid var(--card)" }} />
                      ))}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.question || `${b.options.length}-way battle`}</div>
                      <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>
                        {b.totalVotes} vote{b.totalVotes === 1 ? "" : "s"}{lead ? ` · leading ${lead.pct}%` : ""} · {timeLeft(b.expiresAt)}
                      </div>
                    </div>
                    <IconArrowRight size={16} style={{ color: "var(--faint)", flexShrink: 0 }} />
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
