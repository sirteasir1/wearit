"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  fetchBattle, castVote, deviceId, BattlePublic,
  REACTIONS, Reaction,
} from "@/lib/battle";
import { IconBattle, IconArrowRight, IconCheck } from "@/lib/icons";
import { useI18n, LangSwitch } from "@/lib/i18n";

export default function VotePage() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  // Stable per-browser id, computed once (no setState-in-effect). It isn't
  // rendered, so the server "" vs client value difference is invisible.
  const [device] = useState<string>(() => deviceId());
  const [battle, setBattle]   = useState<BattlePublic | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [pick, setPick]       = useState<string | null>(null);   // tentative selection
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const [busy, setBusy]       = useState(false);

  // Light refreshes (no image bytes) merge new counts into the cached options.
  const load = useCallback(async (light = false) => {
    try {
      const fresh = await fetchBattle(id, device, light);
      setBattle((prev) => light && prev
        ? { ...fresh, options: fresh.options.map((o) => ({ ...o, imageUrl: prev.options.find((p) => p.id === o.id)?.imageUrl || o.imageUrl })) }
        : fresh);
    } catch (e) { setError(e instanceof Error ? e.message : t.vote.notFound); }
  }, [id, device]);

  useEffect(() => { if (device) load(); }, [device, load]);

  // Once the viewer has voted (or it's closed), keep results fresh.
  const voted = !!battle?.myVote;
  useEffect(() => {
    if (!device || !battle) return;
    if (!voted && !battle.closed) return;
    const t = setInterval(() => load(true), 5000);
    return () => clearInterval(t);
  }, [device, battle, voted, load]);

  const submit = async () => {
    if (!pick || busy) return;
    setBusy(true);
    try { setBattle(await castVote(id, pick, reaction, device)); }
    catch (e) { setError(e instanceof Error ? e.message : t.vote.voteFailed); }
    finally { setBusy(false); }
  };

  if (error) return <Centered><p style={{ color: "var(--muted)" }}>{error}</p></Centered>;
  if (!battle) return <Centered><div className="spinner" style={{ width: 26, height: 26 }} /></Centered>;

  const showResults = voted || battle.closed;
  const total = battle.totalVotes || 0;
  const maxVotes = Math.max(1, ...battle.options.map((o) => o.votes));

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", padding: "28px 18px 40px" }}>
      <div style={{ width: "100%", maxWidth: 560 }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--brand)" }}>
            <IconBattle size={20} /> <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>{t.vote.badge}</span>
          </div>
          <LangSwitch />
        </div>
        <h1 className="serif" style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.03em", color: "var(--ink)", marginBottom: 6, lineHeight: 1.15 }}>
          {battle.question || t.vote.whichWins}
        </h1>
        {battle.closed ? (
          <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 22, fontWeight: 300 }}>{t.vote.ended}</p>
        ) : showResults ? (
          <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 22, fontWeight: 300 }}>{t.vote.votesSoFar(total)}</p>
        ) : (
          <p className="bt-tap" style={{ fontSize: 14.5, color: "var(--brand)", marginBottom: 22, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 7 }}>
            {t.vote.tapYoudPick}
          </p>
        )}

        {/* Options */}
        <div style={{ position: "relative", display: "grid", gridTemplateColumns: battle.options.length === 2 ? "1fr 1fr" : "repeat(auto-fill,minmax(150px,1fr))", gap: 12, marginBottom: 22 }}>
          {battle.options.length === 2 && <span className="bt-vs">{t.vote.vs}</span>}
          {battle.options.map((o) => {
            const selected = pick === o.id;
            const mine = battle.myVote === o.id;
            const pct = total ? Math.round((o.votes / total) * 100) : 0;
            const winning = showResults && o.votes === maxVotes && total > 0;
            return (
              <button
                key={o.id}
                onClick={() => { if (!showResults) setPick(o.id); }}
                disabled={showResults || busy}
                className={`bt-card${showResults ? " results" : ""}${(selected || mine) ? " on" : ""}`}
                style={{
                  position: "relative", padding: 0, borderRadius: 14, overflow: "hidden", background: "var(--card)",
                  cursor: showResults ? "default" : "pointer", textAlign: "left",
                  border: (selected || mine) ? "2.5px solid var(--brand)" : winning ? "2.5px solid var(--gold)" : "1px solid var(--border)",
                  boxShadow: winning ? "0 6px 24px rgba(176,138,62,0.22)" : undefined,
                }}
              >
                <div style={{ position: "relative", aspectRatio: "3/4", background: "#14100A" }}>
                  <img src={o.imageUrl} alt={o.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  {mine && (
                    <span style={{ position: "absolute", top: 8, right: 8, background: "var(--brand)", color: "#fff", borderRadius: 100, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center" }}><IconCheck size={15} /></span>
                  )}
                  {!showResults && !selected && <span className="bt-tap-pill">{t.vote.tapToPick}</span>}
                </div>
                {showResults && (
                  <div style={{ padding: "10px 12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: winning ? "var(--gold)" : "var(--ink)" }}>{pct}%</span>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>{t.vote.votes(o.votes)}</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: winning ? "var(--gold)" : "var(--brand)", borderRadius: 3, transition: "width 0.6s" }} />
                    </div>
                    {Object.keys(o.reactions || {}).length > 0 && (
                      <div style={{ display: "flex", gap: 8, marginTop: 8, fontSize: 13 }}>
                        {Object.entries(o.reactions).map(([r, n]) => (
                          <span key={r} style={{ color: "var(--muted)" }}>{r} {n}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Vote control (pre-vote only) */}
        {!showResults && (
          <div style={{ position: "sticky", bottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 12 }}>
              {REACTIONS.map((r) => (
                <button key={r} onClick={() => setReaction(reaction === r ? null : r)} disabled={!pick}
                  style={{ width: 46, height: 46, borderRadius: 100, fontSize: 22, cursor: pick ? "pointer" : "default", opacity: pick ? 1 : 0.4,
                    background: reaction === r ? "var(--brand-soft)" : "var(--card)", border: reaction === r ? "2px solid var(--brand)" : "1px solid var(--border)" }}>
                  {r}
                </button>
              ))}
            </div>
            <button className={`btn-dark${pick && !busy ? " btn-ready" : ""}`} onClick={submit} disabled={!pick || busy}
              style={{ width: "100%", padding: "16px", fontSize: 15, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {busy ? <div className="spinner" style={{ width: 18, height: 18 }} /> : pick ? t.vote.castMyVote : t.vote.pickFirst}
            </button>
          </div>
        )}

        {/* Post-vote CTA — the growth loop */}
        {showResults && (
          <div style={{ textAlign: "center", marginTop: 30, paddingTop: 26, borderTop: "1px solid var(--border)" }}>
            <p style={{ fontSize: 15, color: "var(--ink)", fontWeight: 500, marginBottom: 4 }}>{t.vote.settle}</p>
            <p style={{ fontSize: 13.5, color: "var(--muted)", marginBottom: 16, fontWeight: 300 }}>{t.vote.settleBody}</p>
            <Link href="/" className="btn-dark" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 22px", borderRadius: 10, fontSize: 14, textDecoration: "none" }}>
              {t.vote.makeYourOwn} <IconArrowRight size={15} />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>{children}</div>;
}
