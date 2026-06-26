"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import AppShell from "@/lib/app-shell";
import {
  getProfile, getWardrobe, WardrobeItem, creditsRemaining, incTryOns, dataURLToThumb,
} from "@/lib/store";
import {
  THEMES, VIBES, generateLook, joinQueue, submitLook, triggerJudge, leaveMatch, fetchMatchState,
  type Theme, type ArenaMatch, type LookScore,
} from "@/lib/arena";
import { useI18n, type Lang } from "@/lib/i18n";
import { IconSpark, IconArrowRight, IconShare, IconWand, IconCheck, IconX } from "@/lib/icons";
import { toast } from "@/lib/toast";

/* ── local bilingual copy (self-contained, kept out of the global Dict) ── */
const S = {
  title:       { en: "Style Arena",                                  ru: "Арена стиля" },
  tagline:     { en: "Get matched with a live rival, build a look for the theme, let the AI judge decide.", ru: "Тебя сводят с живым соперником, оба собираете образ под тему — AI-судья решает." },
  howTitle:    { en: "How it works",                                 ru: "Как это работает" },
  how1:        { en: "Tap Find a rival — you're matched with another player in real time", ru: "Жми «Найти соперника» — тебя сведут с другим игроком в реальном времени" },
  how2:        { en: "You both get the same theme — pick a saved look or generate a new one", ru: "Обоим выпадает одна тема — выбери сохранённый образ или сгенерь новый" },
  how3:        { en: "The AI judge scores both outfits and crowns a winner", ru: "AI-судья оценивает оба образа и выбирает победителя" },
  pickTheme:   { en: "Seed a theme (optional)",                      ru: "Зерно темы (по желанию)" },
  themeHint:   { en: "If someone's already waiting, you'll join their theme.", ru: "Если кто-то уже ждёт — попадёшь в его тему." },
  random:      { en: "🎲 Surprise me",                               ru: "🎲 Случайная" },
  findRival:   { en: "Find a rival",                                 ru: "Найти соперника" },
  searching:   { en: "Finding you a rival…",                         ru: "Ищу соперника…" },
  searchingSub:{ en: "Matching you with another player. Hang tight.", ru: "Подбираю другого игрока. Секунду." },
  cancel:      { en: "Cancel",                                       ru: "Отмена" },
  matched:     { en: "Rival found!",                                 ru: "Соперник найден!" },
  buildFor:    { en: "Build your look for",                          ru: "Собери образ для темы" },
  savedLooks:  { en: "Pick a saved look",                            ru: "Выбери сохранённый образ" },
  free:        { en: "free",                                         ru: "бесплатно" },
  orGenerate:  { en: "or generate a fresh one",                      ru: "или сгенерь новый" },
  vibe:        { en: "Vibe",                                         ru: "Вайб" },
  generate:    { en: "Generate look",                                ru: "Сгенерить" },
  cost1:       { en: "1 credit",                                     ru: "1 кредит" },
  building:    { en: "Styling…",                                     ru: "Собираю…" },
  lockIn:      { en: "Lock in my look",                              ru: "Заблокировать образ" },
  locked:      { en: "Look locked in",                               ru: "Образ заблокирован" },
  waitingRival:{ en: "Waiting for your rival to finish…",            ru: "Ждём, пока соперник закончит…" },
  rivalStyling:{ en: "Your rival is styling…",                       ru: "Соперник собирает образ…" },
  rivalReady:  { en: "Rival locked in ✓",                            ru: "Соперник готов ✓" },
  needAsset:   { en: "Add credits or save a look first to play",     ru: "Чтобы играть, пополни кредиты или сохрани образ" },
  getCredits:  { en: "Get credits",                                  ru: "Пополнить" },
  tryOnFirst:  { en: "Try something on",                             ru: "Примерить" },
  judging:     { en: "The judge is deciding…",                       ru: "Судья решает…" },
  you:         { en: "You",                                          ru: "Ты" },
  youWin:      { en: "You win! 👑",                                  ru: "Ты победил! 👑" },
  youLose:     { en: "Your rival took it",                           ru: "Соперник забрал победу" },
  tie:         { en: "It's a tie!",                                  ru: "Ничья!" },
  playAgain:   { en: "Play again",                                   ru: "Ещё раз" },
  share:       { en: "Share",                                        ru: "Поделиться" },
  leave:       { en: "Leave",                                        ru: "Выйти" },
  themeFit:    { en: "Theme fit",                                    ru: "Попадание в тему" },
  coordination:{ en: "Coordination",                                 ru: "Сочетание" },
  originality: { en: "Originality",                                  ru: "Оригинальность" },
  judgesNote:  { en: "Judge's verdict",                              ru: "Вердикт судьи" },
  rivalLeft:   { en: "Your rival left the match.",                   ru: "Соперник вышел из матча." },
  secs:        { en: "s left",                                       ru: "с" },
  shareText:   { en: "I just won an outfit battle in Wearit's Style Arena 👕⚔️", ru: "Я выиграл баттл образов на Арене стиля в Wearit 👕⚔️" },
};
const tr = (k: keyof typeof S, lang: Lang) => S[k][lang];

export default function ArenaPage() {
  const { lang } = useI18n();
  const [uid, setUid] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [name, setName] = useState("Player");
  const [credits, setCredits] = useState(0);
  const [wardrobe, setWardrobe] = useState<WardrobeItem[]>([]);

  const [seedTheme, setSeedTheme] = useState<Theme | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [match, setMatch] = useState<ArenaMatch | null>(null);
  const [myLook, setMyLook] = useState<string | null>(null);    // chosen/generated look, before lock-in
  const [vibes, setVibes] = useState<string[]>([]);
  const [busy, setBusy] = useState<null | "queue" | "gen" | "submit">(null);
  const [revealed, setRevealed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const judgedRef = useRef(false);

  useEffect(() => onAuthStateChanged(auth, (u) => {
    if (!u) return;
    setUid(u.uid);
    const p = getProfile(u.uid);
    setPhoto(p.photo);
    setName(u.displayName || u.email?.split("@")[0] || "Player");
    setCredits(creditsRemaining(u.uid));
    setWardrobe(getWardrobe(u.uid));
  }), []);

  // Live match state via server polling (no client Firestore read rules needed).
  useEffect(() => {
    if (!matchId) return;
    let alive = true;
    const poll = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        const m = await fetchMatchState(token, matchId);
        if (!alive) return;
        setMatch(m);
        if (m?.status === "done") clearInterval(iv); // freeze once the verdict is in
      } catch { /* transient — keep polling */ }
    };
    const iv = setInterval(poll, 1600);
    poll();
    return () => { alive = false; clearInterval(iv); };
  }, [matchId]);

  // Build-phase countdown tick.
  useEffect(() => {
    if (match?.status !== "building") return;
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [match?.status]);

  // When both are in, exactly one client fires the judge (host first; the other
  // as a fallback). The judge route guards against double-runs.
  useEffect(() => {
    if (!match || !uid || match.status !== "judging" || judgedRef.current) return;
    const isHost = match.hostUid === uid;
    const tmr = setTimeout(async () => {
      judgedRef.current = true;
      try {
        const token = await auth.currentUser?.getIdToken();
        if (token) await triggerJudge(token, match.id, lang);
      } catch { /* the other client will cover it */ }
    }, isHost ? 0 : 4000);
    return () => clearTimeout(tmr);
  }, [match?.status, match?.id, uid, lang]);

  // Reveal scores once the verdict lands; reset on the way out (cleanup, not body).
  useEffect(() => {
    if (match?.status !== "done") return;
    const t = setTimeout(() => setRevealed(true), 80);
    return () => { clearTimeout(t); setRevealed(false); };
  }, [match?.status]);

  const resetToLobby = () => { setMatchId(null); setMatch(null); setMyLook(null); setVibes([]); judgedRef.current = false; };

  const findRival = async () => {
    if (!uid || busy) return;
    setBusy("queue");
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Sign in again");
      const theme = seedTheme || THEMES[Math.floor(Math.random() * THEMES.length)];
      judgedRef.current = false;
      const { matchId: id } = await joinQueue(token, { theme: theme.id, name });
      setMatchId(id);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Matchmaking failed", "error");
    } finally { setBusy(null); }
  };

  const leave = async () => {
    const token = await auth.currentUser?.getIdToken();
    if (token && matchId) await leaveMatch(token, matchId);
    resetToLobby();
  };

  async function ensureDataUrl(src: string): Promise<string> {
    if (src.startsWith("data:")) return src;
    const res = await fetch(src);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string); r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  const generate = async () => {
    if (!uid || !match || !photo || busy) return;
    if (credits < 1) { toast(tr("getCredits", lang), "error"); return; }
    setBusy("gen");
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Sign in again");
      const modelPhoto = await ensureDataUrl(photo);
      const { image, remaining } = await generateLook(token, { theme: match.theme, vibes, modelPhoto });
      setMyLook(image);
      incTryOns(uid);
      setCredits(remaining);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Generation failed", "error");
    } finally { setBusy(null); }
  };

  const lockIn = async () => {
    if (!myLook || !matchId || busy) return;
    setBusy("submit");
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Sign in again");
      const thumb = await dataURLToThumb(myLook, 680, 0.72);
      await submitLook(token, matchId, thumb);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not submit", "error");
    } finally { setBusy(null); }
  };

  const share = async () => {
    const nav = navigator as Navigator & { share?: (d: { title?: string; text?: string; url?: string }) => Promise<void> };
    const payload = { title: "Wearit · Style Arena", text: tr("shareText", lang), url: typeof window !== "undefined" ? window.location.origin + "/arena" : "" };
    try { if (nav.share) { await nav.share(payload); return; } } catch { /* fall through */ }
    try { await navigator.clipboard.writeText(`${payload.text} ${payload.url}`); toast(lang === "ru" ? "Скопировано" : "Copied", "success"); } catch { /* ignore */ }
  };

  // ── derive view ──
  const status = match?.status;
  const oppUid = match && uid ? match.uids.find((u) => u !== uid) : undefined;
  const meP = match && uid ? match.players[uid] : undefined;
  const oppP = match && oppUid ? match.players[oppUid] : undefined;
  const iLocked = !!meP?.ready;
  const secsLeft = match?.buildDeadline ? Math.max(0, Math.ceil((match.buildDeadline - now) / 1000)) : null;

  return (
    <AppShell>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 18px 96px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <span style={{ fontSize: 30, lineHeight: 1 }}>⚔️</span>
          <h1 className="serif" style={{ fontSize: 38, fontWeight: 700, letterSpacing: "-0.035em", color: "var(--ink)" }}>{tr("title", lang)}</h1>
        </div>
        <p style={{ fontSize: 15, color: "var(--muted)", marginBottom: 26, fontWeight: 300 }}>{tr("tagline", lang)}</p>

        <AnimatePresence mode="wait">
          {/* ── LOBBY ── */}
          {!matchId && (
            <motion.div key="lobby" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.25 }}>
              {/* how it works */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, marginBottom: 28 }}>
                {[tr("how1", lang), tr("how2", lang), tr("how3", lang)].map((h, i) => (
                  <div key={i} style={{ padding: "16px", borderRadius: 14, background: "var(--card)", border: "1px solid var(--border)" }}>
                    <div style={{ width: 26, height: 26, borderRadius: 100, background: "var(--brand)", color: "#fff", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>{i + 1}</div>
                    <p style={{ fontSize: 13.5, color: "var(--ink)", lineHeight: 1.45 }}>{h}</p>
                  </div>
                ))}
              </div>

              <p style={lblStyle}>{tr("pickTheme", lang)}</p>
              <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12 }}>{tr("themeHint", lang)}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 26 }}>
                <button onClick={() => setSeedTheme(null)} style={chip(!seedTheme)}>{tr("random", lang)}</button>
                {THEMES.map((tm) => (
                  <button key={tm.id} onClick={() => setSeedTheme(tm)} style={chip(seedTheme?.id === tm.id)}>{tm.emoji} {tm.label[lang]}</button>
                ))}
              </div>

              <button onClick={findRival} disabled={busy === "queue"} className="btn-dark btn-ready" style={ctaStyle}>
                {busy === "queue" ? <><div className="spinner" style={{ width: 18, height: 18 }} /> {tr("searching", lang)}</> : <>⚔️ {tr("findRival", lang)}</>}
              </button>
            </motion.div>
          )}

          {/* ── SEARCHING ── (shows instantly while the first poll resolves) */}
          {matchId && (!match || status === "waiting") && (
            <motion.div key="searching" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ textAlign: "center", padding: "60px 20px" }}>
              <motion.div animate={{ scale: [1, 1.12, 1], opacity: [0.6, 1, 0.6] }} transition={{ duration: 1.4, repeat: Infinity }} style={{ fontSize: 56, marginBottom: 22 }}>🛰️</motion.div>
              <h2 className="serif" style={{ fontSize: 24, fontWeight: 600, color: "var(--ink)", marginBottom: 8 }}>{tr("searching", lang)}</h2>
              <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 8 }}>{tr("searchingSub", lang)}</p>
              {match && <p style={{ fontSize: 13, color: "var(--faint)", marginBottom: 26 }}>{themeOf(match, lang)}</p>}
              <button onClick={leave} className="btn-ghost" style={ghostStyle}><IconX size={15} /> {tr("cancel", lang)}</button>
            </motion.div>
          )}

          {/* ── BUILDING ── */}
          {status === "building" && match && (
            <motion.div key="building" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              <ThemeBanner match={match} lang={lang} secsLeft={secsLeft} />

              {/* rival status */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "14px 0 20px", fontSize: 13.5, color: oppP?.ready ? "#1a7a2e" : "var(--muted)" }}>
                <span style={{ width: 8, height: 8, borderRadius: 100, background: oppP?.ready ? "#1a7a2e" : "var(--gold)", display: "inline-block" }} />
                {oppP ? (oppP.ready ? `${oppP.name} · ${tr("rivalReady", lang)}` : `${oppP.name} · ${tr("rivalStyling", lang)}`) : tr("matched", lang)}
              </div>

              {iLocked ? (
                /* I'm done — waiting on the rival */
                <div style={{ textAlign: "center", padding: "30px 20px" }}>
                  {myLook && <img src={myLook} alt="" style={{ width: 200, borderRadius: 14, border: "2px solid var(--brand)", marginBottom: 18, boxShadow: "0 12px 36px rgba(0,0,0,0.14)" }} />}
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--brand)", fontWeight: 600, fontSize: 15, marginBottom: 6 }}><IconCheck size={18} /> {tr("locked", lang)}</div>
                  <p style={{ fontSize: 14, color: "var(--muted)" }}>{tr("waitingRival", lang)}</p>
                  <button onClick={leave} className="btn-ghost" style={{ ...ghostStyle, marginTop: 20 }}>{tr("leave", lang)}</button>
                </div>
              ) : (
                <BuildPanel
                  lang={lang} wardrobe={wardrobe} myLook={myLook} setMyLook={setMyLook}
                  vibes={vibes} setVibes={setVibes} photo={photo} credits={credits}
                  busy={busy} onGenerate={generate} onLock={lockIn} onLeave={leave}
                />
              )}
            </motion.div>
          )}

          {/* ── JUDGING ── */}
          {status === "judging" && (
            <motion.div key="judging" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ textAlign: "center", padding: "70px 20px" }}>
              <motion.div animate={{ rotate: [0, -12, 12, -8, 0], scale: [1, 1.1, 1] }} transition={{ duration: 1.1, repeat: Infinity }} style={{ fontSize: 60, marginBottom: 18 }}>⚖️</motion.div>
              <p className="serif" style={{ fontSize: 22, fontWeight: 600, color: "var(--ink)" }}>{tr("judging", lang)}</p>
            </motion.div>
          )}

          {/* ── RESULT ── */}
          {status === "done" && match && meP && (
            <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <ResultScreen
                lang={lang} me={meP} opp={oppP} winnerUid={match.winnerUid} myUid={uid!}
                callout={match.callout} revealed={revealed}
                onAgain={() => { resetToLobby(); }} onShare={share} onLeave={() => { resetToLobby(); }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppShell>
  );
}

/* ── helpers / pieces ── */

function themeOf(m: ArenaMatch, lang: Lang): string {
  const t = THEMES.find((x) => x.id === m.theme);
  return t ? `${t.emoji} ${t.label[lang]}` : "";
}

function ThemeBanner({ match, lang, secsLeft }: { match: ArenaMatch; lang: Lang; secsLeft: number | null }) {
  const t = THEMES.find((x) => x.id === match.theme);
  if (!t) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", borderRadius: 16, background: "linear-gradient(110deg, var(--brand-soft), var(--card))", border: "1px solid var(--brand-ring)" }}>
      <span style={{ fontSize: 38, lineHeight: 1 }}>{t.emoji}</span>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--brand)", fontWeight: 600 }}>{S.buildFor[lang]}</p>
        <h2 className="serif" style={{ fontSize: 23, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.02em" }}>{t.label[lang]}</h2>
      </div>
      {secsLeft !== null && (
        <div style={{ textAlign: "center", flexShrink: 0 }}>
          <div className="serif" style={{ fontSize: 26, fontWeight: 700, color: secsLeft <= 20 ? "#b71c1c" : "var(--ink)", lineHeight: 1 }}>{secsLeft}</div>
          <div style={{ fontSize: 10.5, color: "var(--faint)" }}>{S.secs[lang]}</div>
        </div>
      )}
    </div>
  );
}

function BuildPanel({ lang, wardrobe, myLook, setMyLook, vibes, setVibes, photo, credits, busy, onGenerate, onLock, onLeave }: {
  lang: Lang; wardrobe: WardrobeItem[]; myLook: string | null; setMyLook: (s: string | null) => void;
  vibes: string[]; setVibes: (v: string[]) => void; photo: string | null; credits: number;
  busy: string | null; onGenerate: () => void; onLock: () => void; onLeave: () => void;
}) {
  const toggleVibe = (id: string) => {
    if (vibes.includes(id)) setVibes(vibes.filter((x) => x !== id));
    else if (vibes.length >= 3) toast(lang === "ru" ? "Максимум 3" : "Up to 3", "error");
    else setVibes([...vibes, id]);
  };
  const canPlay = wardrobe.length > 0 || (!!photo && credits >= 1);

  return (
    <div>
      {/* saved looks */}
      {wardrobe.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
            <p style={{ ...lblStyle, margin: 0 }}>{tr("savedLooks", lang)}</p>
            <span style={{ fontSize: 11, color: "#1a7a2e", fontWeight: 600 }}>{tr("free", lang)}</span>
          </div>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6, marginBottom: 22 }}>
            {wardrobe.slice(0, 16).map((w) => {
              const on = myLook === w.img;
              return (
                <button key={w.id} onClick={() => setMyLook(on ? null : w.img)} style={{ position: "relative", flexShrink: 0, padding: 0, border: on ? "2.5px solid var(--brand)" : "1px solid var(--border)", borderRadius: 10, overflow: "hidden", background: "var(--card)", cursor: "pointer", width: 86, height: 112 }}>
                  <img src={w.img} alt={w.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  {on && <span style={{ position: "absolute", top: 5, right: 5, width: 20, height: 20, borderRadius: 100, background: "var(--brand)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}><IconCheck size={12} /></span>}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* generate */}
      <p style={lblStyle}>{wardrobe.length > 0 ? tr("orGenerate", lang) : tr("generate", lang)}</p>
      <p style={{ fontSize: 12, color: "var(--faint)", marginBottom: 10 }}>{tr("vibe", lang)}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        {VIBES.map((v) => (
          <button key={v.id} onClick={() => toggleVibe(v.id)} style={chip(vibes.includes(v.id))}>{v.label[lang]}</button>
        ))}
      </div>

      {!photo ? (
        <Link href="/profile" className="btn-ghost" style={ghostStyle}>{lang === "ru" ? "Добавь фото в профиле" : "Add a profile photo"} <IconArrowRight size={15} /></Link>
      ) : credits < 1 ? (
        <Link href="/profile" className="btn-ghost" style={ghostStyle}><IconSpark size={15} /> {tr("getCredits", lang)}</Link>
      ) : (
        <button onClick={onGenerate} disabled={busy === "gen"} className="btn-ghost" style={ghostStyle}>
          {busy === "gen" ? <><div className="spinner-dark" style={{ width: 16, height: 16 }} /> {tr("building", lang)}</> : <><IconWand size={16} /> {tr("generate", lang)} · <span style={{ opacity: 0.6 }}>{tr("cost1", lang)}</span></>}
        </button>
      )}

      {/* preview of the currently chosen look */}
      {myLook && (
        <div style={{ textAlign: "center", margin: "20px 0" }}>
          <img src={myLook} alt="" style={{ width: 180, borderRadius: 14, border: "2px solid var(--brand)", boxShadow: "0 12px 36px rgba(0,0,0,0.14)" }} />
        </div>
      )}

      {/* lock-in */}
      <button onClick={onLock} disabled={!myLook || busy === "submit"} className={`btn-dark${myLook ? " btn-ready" : ""}`} style={{ ...ctaStyle, marginTop: 16, opacity: myLook ? 1 : 0.5 }}>
        {busy === "submit" ? <div className="spinner" style={{ width: 18, height: 18 }} /> : <>⚔️ {tr("lockIn", lang)}</>}
      </button>

      {!canPlay && (
        <p style={{ textAlign: "center", fontSize: 13, color: "var(--muted)", marginTop: 12 }}>
          {tr("needAsset", lang)} · <Link href="/app" style={{ color: "var(--brand)" }}>{tr("tryOnFirst", lang)}</Link>
        </p>
      )}
      <div style={{ textAlign: "center", marginTop: 14 }}>
        <button onClick={onLeave} style={{ background: "none", border: "none", color: "var(--faint)", fontSize: 13, cursor: "pointer" }}>{tr("leave", lang)}</button>
      </div>
    </div>
  );
}

function ResultScreen({ lang, me, opp, winnerUid, myUid, callout, revealed, onAgain, onShare, onLeave }: {
  lang: Lang; me: { name: string; lookUrl: string | null; score: LookScore | null };
  opp?: { name: string; lookUrl: string | null; score: LookScore | null }; winnerUid: string | null; myUid: string;
  callout: string | null; revealed: boolean; onAgain: () => void; onShare: () => void; onLeave: () => void;
}) {
  const iWon = winnerUid === myUid;
  const tie = winnerUid === null;
  const headline = iWon ? tr("youWin", lang) : tie ? tr("tie", lang) : tr("youLose", lang);
  const headColor = iWon ? "var(--gold)" : tie ? "var(--muted)" : "var(--ink)";

  return (
    <div>
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 16 }} style={{ textAlign: "center", marginBottom: 18 }}>
        <h2 className="serif" style={{ fontSize: 30, fontWeight: 700, color: headColor, letterSpacing: "-0.03em" }}>{headline}</h2>
      </motion.div>

      <div style={{ display: "grid", gridTemplateColumns: opp ? "1fr auto 1fr" : "1fr", alignItems: "start", gap: 12, marginBottom: 22 }}>
        <LookColumn label={tr("you", lang)} img={me.lookUrl} score={me.score} highlight={iWon || tie} crown={iWon} revealed={revealed} lang={lang} />
        {opp && <div style={{ alignSelf: "center", fontWeight: 800, fontSize: 20, color: "var(--faint)", paddingTop: 30 }}>VS</div>}
        {opp && <LookColumn label={opp.name} img={opp.lookUrl} score={opp.score} highlight={!iWon && !tie} crown={!iWon && !tie} revealed={revealed} lang={lang} />}
      </div>

      {callout && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: revealed ? 1 : 0, y: revealed ? 0 : 8 }} transition={{ delay: 0.5 }}
          style={{ background: "var(--dark)", color: "#F2E9D9", borderRadius: 14, padding: "16px 18px", marginBottom: 22 }}>
          <p style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.6, marginBottom: 6 }}>⚖️ {tr("judgesNote", lang)}</p>
          <p style={{ fontSize: 15.5, fontWeight: 500, lineHeight: 1.4 }}>{callout}</p>
        </motion.div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={onAgain} className="btn-dark btn-ready" style={{ ...ctaStyle, flex: 1, minWidth: 150 }}>⚔️ {tr("playAgain", lang)}</button>
        <button onClick={onShare} className="btn-ghost" style={{ ...ghostStyle, width: "auto" }}><IconShare size={16} /> {tr("share", lang)}</button>
        <button onClick={onLeave} className="btn-ghost" style={{ ...ghostStyle, width: "auto" }}>{tr("leave", lang)}</button>
      </div>
    </div>
  );
}

function LookColumn({ label, img, score, highlight, crown, revealed, lang }: {
  label: string; img: string | null; score: LookScore | null; highlight: boolean; crown: boolean; revealed: boolean; lang: Lang;
}) {
  return (
    <div>
      <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", border: highlight ? "2.5px solid var(--gold)" : "1px solid var(--border)", boxShadow: highlight ? "0 12px 36px rgba(176,138,62,0.28)" : "0 6px 20px rgba(0,0,0,0.08)" }}>
        {crown && <span style={{ position: "absolute", top: 8, left: 8, fontSize: 22, zIndex: 2, filter: "drop-shadow(0 2px 3px rgba(0,0,0,.3))" }}>👑</span>}
        {img ? <img src={img} alt="" style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", display: "block" }} />
             : <div style={{ width: "100%", aspectRatio: "3/4", background: "var(--sand)" }} />}
        {score && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: revealed ? 1 : 0 }} transition={{ delay: 0.3 }}
            style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "20px 10px 8px", background: "linear-gradient(transparent, rgba(0,0,0,0.78))", color: "#fff", textAlign: "center" }}>
            <span style={{ fontSize: 26, fontWeight: 800, lineHeight: 1 }}>{score.total}</span><span style={{ fontSize: 13, opacity: 0.7 }}>/30</span>
          </motion.div>
        )}
      </div>
      <p style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)", margin: "8px 0 6px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</p>
      {score && <>
        <Bar label={tr("themeFit", lang)} v={score.themeFit} revealed={revealed} d={0} />
        <Bar label={tr("coordination", lang)} v={score.coordination} revealed={revealed} d={0.1} />
        <Bar label={tr("originality", lang)} v={score.originality} revealed={revealed} d={0.2} />
        {score.roast && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: revealed ? 1 : 0 }} transition={{ delay: 0.55 }}
            style={{ fontSize: 12.5, color: "var(--muted)", fontStyle: "italic", marginTop: 8, lineHeight: 1.35 }}>“{score.roast}”</motion.p>
        )}
      </>}
    </div>
  );
}

function Bar({ label, v, revealed, d }: { label: string; v: number; revealed: boolean; d: number }) {
  return (
    <div style={{ marginBottom: 5 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--muted)", marginBottom: 2 }}>
        <span>{label}</span><span style={{ fontWeight: 700, color: "var(--ink)" }}>{v}</span>
      </div>
      <div style={{ height: 5, borderRadius: 100, background: "var(--sand)", overflow: "hidden" }}>
        <motion.div initial={{ width: 0 }} animate={{ width: revealed ? `${v * 10}%` : 0 }} transition={{ delay: d + 0.2, duration: 0.6, ease: "easeOut" }}
          style={{ height: "100%", borderRadius: 100, background: v >= 8 ? "var(--gold)" : "var(--brand)" }} />
      </div>
    </div>
  );
}

/* ── shared inline styles ── */
const lblStyle: React.CSSProperties = { fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--faint)", fontWeight: 600, marginBottom: 12 };
const ctaStyle: React.CSSProperties = { width: "100%", padding: "16px", fontSize: 15, borderRadius: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 9, textDecoration: "none" };
const ghostStyle: React.CSSProperties = { width: "100%", padding: "14px 18px", fontSize: 14.5, borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", color: "var(--ink)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, textDecoration: "none" };
const chip = (on: boolean): React.CSSProperties => ({
  padding: "8px 14px", borderRadius: 100, fontSize: 13.5, fontWeight: 500, cursor: "pointer",
  border: on ? "1.5px solid var(--brand)" : "1px solid var(--border)",
  background: on ? "var(--brand-soft)" : "var(--card)", color: on ? "var(--brand)" : "var(--ink)", transition: "all .15s",
});
