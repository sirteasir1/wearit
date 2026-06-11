"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useI18n, LangSwitch } from "@/lib/i18n";

/* ── scroll reveal ── */
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>(".reveal");
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).classList.add("in");
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);
}

/* ── animated number counter ── */
function AnimNum({ to, suffix = "" }: { to: number; suffix?: string }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        obs.disconnect();
        let start = 0;
        const step = () => {
          start += to / 44;
          setVal(Math.min(Math.round(start), to));
          if (start < to) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      },
      { threshold: 0.5 }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [to]);
  return <span ref={ref}>{val}{suffix}</span>;
}

const TICKER_ITEMS = ["ZARA","WILDBERRIES","ASOS","H&M","UNIQLO","LAMODA","ZALANDO","SHEIN","PULL&BEAR","MANGO","BERSHKA","MASSIMO DUTTI"];

/* ── premium word "shuffle" — fade + blur + scale crossfade, one word at a time ──
   Reusable: <ShuffleWord words={["style","identity","confidence","expression"]} />  */
const SHUFFLE_WORDS = ["buy", "wear", "own", "love", "keep"];
function ShuffleWord({ words = SHUFFLE_WORDS, interval = 2800 }: { words?: string[]; interval?: number }) {
  const [idx, setIdx]   = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  const idxRef    = useRef(0);
  const paused    = useRef(false);
  const wordsRef  = useRef(words);
  const intervalRef = useRef(interval);
  wordsRef.current = words;
  intervalRef.current = interval;

  useEffect(() => {
    const id = setInterval(() => {
      if (paused.current) return;            // pause on hover
      const cur  = idxRef.current;
      const next = (cur + 1) % wordsRef.current.length;
      idxRef.current = next;
      setPrev(cur);
      setIdx(next);
    }, intervalRef.current);                 // slow, minimal cadence
    return () => clearInterval(id);
  }, []);

  /* drop the outgoing word once its fade-out finishes */
  useEffect(() => {
    if (prev === null) return;
    const t = setTimeout(() => setPrev(null), 760);
    return () => clearTimeout(t);
  }, [idx, prev]);

  return (
    <span
      className="shuffle-word"
      onMouseEnter={() => { paused.current = true; }}
      onMouseLeave={() => { paused.current = false; }}
    >
      {/* invisible sizer keeps the box at the current word's width — no layout shift */}
      <span className="shuffle-sizer" aria-hidden="true">{words[idx]}</span>
      {prev !== null && (
        <span key={`o${idx}`} className="shuffle-layer shuffle-out" aria-hidden="true">{words[prev]}</span>
      )}
      <span key={`i${idx}`} className="shuffle-layer shuffle-in">{words[idx]}</span>
    </span>
  );
}

/* Visual styling for testimonial cards — paired by index with the localized copy. */
const TESTIMONIAL_GRADIENTS = [
  "linear-gradient(135deg,#C9A84C,#8B6914)",
  "linear-gradient(135deg,#7A9E7E,#4A6A60)",
  "linear-gradient(135deg,#8B5E6E,#5C3347)",
  "linear-gradient(135deg,#6B7A8D,#3D4A5C)",
  "linear-gradient(135deg,#A07B5A,#6B4A2A)",
  "linear-gradient(135deg,#9B8EA0,#6B5A70)",
];
type Testimonial = { quote: string; name: string; detail: string; look: string; initial: string; gradient: string };

/* Minimal SVG icons */
const IconDiamond = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M9 1.5L16.5 9L9 16.5L1.5 9L9 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
  </svg>
);
const IconRack = () => (
  <svg width="20" height="18" viewBox="0 0 20 18" fill="none">
    <path d="M10 1v3M7 4C5.5 4 2 5.5 2 8h16c0-2.5-3.5-4-5-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    <path d="M2 8v7a1 1 0 001 1h14a1 1 0 001-1V8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
);
const IconHeart = () => (
  <svg width="19" height="17" viewBox="0 0 19 17" fill="none">
    <path d="M9.5 15S2 10.5 2 5.5A3.5 3.5 0 019.5 4.2 3.5 3.5 0 0117 5.5C17 10.5 9.5 15 9.5 15Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
  </svg>
);
const IconArrow = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M4.5 13.5L13.5 4.5M13.5 4.5H7M13.5 4.5V11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconCalendar = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <rect x="2" y="3" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.2"/>
    <path d="M6 2v2M12 2v2M2 7h14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
);
const IconSearch = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.2"/>
    <path d="M12 12l3.5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
);
const Star = () => (
  <svg width="15" height="15" viewBox="0 0 14 14" fill="currentColor">
    <path d="M7 .6l1.83 3.96 4.34.5-3.22 2.97.86 4.3L7 10.78 3.19 12.33l.86-4.3L.83 5.06l4.34-.5L7 .6z"/>
  </svg>
);
const IconCheck = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <path d="M2.5 6.2l2.3 2.3L9.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

/* Instagram SVG */
const IconInstagram = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <rect x="2" y="2" width="20" height="20" rx="5" stroke="currentColor" strokeWidth="1.5"/>
    <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5"/>
    <circle cx="17.5" cy="6.5" r="1" fill="currentColor"/>
  </svg>
);
/* Twitter / X SVG */
const IconX = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.736l7.73-8.835L1.254 2.25H8.08l4.259 5.623 5.905-5.623zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);
/* Email SVG */
const IconMail = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M2 8l10 7 10-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

/* ── testimonials — dual-row auto-scrolling marquee ── */
function TCard({ item }: { item: Testimonial }) {
  return (
    <figure className="tcard">
      <div className="tcard-stars" aria-label="5 out of 5">{[0,1,2,3,4].map(s => <Star key={s} />)}</div>
      <blockquote className="tcard-quote">&ldquo;{item.quote}&rdquo;</blockquote>
      <figcaption className="tcard-foot">
        <span className="tcard-avatar" style={{ background: item.gradient }}>{item.initial}</span>
        <span className="tcard-meta">
          <span className="tcard-name">{item.name}</span>
          <span className="tcard-detail">{item.detail} · {item.look}</span>
        </span>
      </figcaption>
    </figure>
  );
}

function Testimonials() {
  const { t } = useI18n();
  const items: Testimonial[] = t.landing.testimonials.items.map((it, i) => ({
    ...it, initial: it.name.slice(0, 1), gradient: TESTIMONIAL_GRADIENTS[i % TESTIMONIAL_GRADIENTS.length],
  }));
  const rowA = items;
  const rowB = [...items].reverse();
  return (
    <section className="sec-testimonials">
      <div className="sec-inner" style={{ textAlign: "center", marginBottom: 56 }}>
        <div className="reveal reveal-up">
          <p style={{ fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 16, fontWeight: 600 }}>{t.landing.testimonials.eyebrow}</p>
          <h2 className="serif" style={{ fontSize: "clamp(32px,4vw,56px)", fontWeight: 500, letterSpacing: "-0.035em", lineHeight: 1.04, color: "var(--ink)" }}>
            {t.landing.testimonials.titleA}<br /><em style={{ fontStyle: "italic" }}>{t.landing.testimonials.titleB}</em>
          </h2>
        </div>
      </div>

      <div className="tmq">
        <div className="tmq-row">
          {[...rowA, ...rowA].map((it, i) => <TCard key={`a${i}`} item={it} />)}
        </div>
        <div className="tmq-row tmq-row-rev">
          {[...rowB, ...rowB].map((it, i) => <TCard key={`b${i}`} item={it} />)}
        </div>
      </div>
    </section>
  );
}

/* ── interactive "How it works" stepper ── */
const HOW_MEDIA = [
  { n: "01", img: "/images/step-1-phone.jpg", pos: "center top" },
  { n: "02", img: "/images/step-2-phone.jpg", pos: "center top" },
  { n: "03", img: "/images/step-3-phone.jpg", pos: "center top" },
];

function HowItWorks() {
  const { t } = useI18n();
  const HOW_STEPS = t.landing.how.steps.map((st, i) => ({ ...st, ...HOW_MEDIA[i] }));
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = HOW_STEPS.length;

  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => setActive((a) => (a + 1) % n), 4800);
    return () => clearTimeout(t);
  }, [active, paused, n]);

  const s = HOW_STEPS[active];

  return (
    <section id="how" className="sec-how">
      <div className="sec-inner">
        <div className="reveal reveal-up" style={{ marginBottom: 8 }}>
          <p style={{ fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 16, fontWeight: 600 }}>{t.landing.how.eyebrow}</p>
          <h2 className="serif" style={{ fontSize: "clamp(38px,5vw,68px)", fontWeight: 500, letterSpacing: "-0.035em", lineHeight: 1.02, color: "var(--ink)", maxWidth: 600 }}>
            {t.landing.how.titleA}<br />
            <em style={{ fontStyle: "italic" }}>{t.landing.how.titleB}</em>
          </h2>
        </div>

        {/* Stepper */}
        <div className="how-stepper reveal reveal-up">
          <div className="how-track">
            <div className="how-track-fill" style={{ width: `${(active / (n - 1)) * 100}%` }} />
          </div>
          {HOW_STEPS.map((st, i) => (
            <button
              key={st.n}
              className={`how-node${i === active ? " active" : ""}${i < active ? " done" : ""}`}
              onClick={() => setActive(i)}
              aria-label={st.title}
            >
              <span className="how-node-dot">{i < active ? <IconCheck /> : i + 1}</span>
              <span className="how-node-label">{st.short}</span>
            </button>
          ))}
        </div>

        {/* Stage */}
        <div
          className="how-stage reveal reveal-up"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div className="how-media">
            <div className="how-screen">
              <img key={active} src={s.img} alt={s.title} className="how-img" style={{ objectPosition: s.pos }} />
            </div>
            <span className="how-island" aria-hidden="true" />
          </div>
          <div className="how-copy">
            <div key={active} className="how-copy-in">
              <div className="serif how-bignum">{s.n}</div>
              <h3 className="serif" style={{ fontSize: "clamp(24px,2.6vw,34px)", fontWeight: 600, letterSpacing: "-0.025em", color: "var(--ink)", marginBottom: 16 }}>{s.title}</h3>
              <p style={{ fontSize: 16, color: "var(--muted)", lineHeight: 1.8, fontWeight: 300, maxWidth: 420 }}>{s.body}</p>
              <div className="how-progress-dots">
                {HOW_STEPS.map((_, i) => (
                  <button key={i} className={`how-dot${i === active ? " on" : ""}`} onClick={() => setActive(i)} aria-label={t.landing.how.stepAria(i + 1)} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── FAQ accordion ── */
function FAQ() {
  const { t } = useI18n();
  const FAQS = t.landing.faq.items;
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="sec-faq">
      <div className="sec-inner faq-grid">
        <div className="faq-head reveal reveal-up">
          <p style={{ fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 16, fontWeight: 600 }}>{t.landing.faq.eyebrow}</p>
          <h2 className="serif" style={{ fontSize: "clamp(32px,4vw,56px)", fontWeight: 500, letterSpacing: "-0.035em", lineHeight: 1.04, color: "var(--ink)" }}>
            {t.landing.faq.titleA}<br /><em style={{ fontStyle: "italic" }}>{t.landing.faq.titleB}</em>
          </h2>
          <p style={{ fontSize: 15, color: "var(--muted)", lineHeight: 1.7, fontWeight: 300, marginTop: 22, maxWidth: 300 }}>
            {t.landing.faq.lead}
            <a href="mailto:rgalbeke@gmail.com" style={{ color: "var(--ink)", textDecoration: "underline", textUnderlineOffset: 3 }}>{t.landing.faq.emailUs}</a>.
          </p>
        </div>

        <div className="faq-list reveal reveal-up" style={{ transitionDelay: "0.1s" }}>
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={i} className={`faq-item${isOpen ? " open" : ""}`}>
                <button className="faq-q" onClick={() => setOpen(isOpen ? null : i)} aria-expanded={isOpen}>
                  <span>{f.q}</span>
                  <span className="faq-icon" aria-hidden="true"><span /><span /></span>
                </button>
                <div className="faq-a">
                  <div><p>{f.a}</p></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default function Landing() {
  const { t } = useI18n();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mouseX,   setMouseX]   = useState(0);
  const [showPro,  setShowPro]  = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  useReveal();

  /* Force muted autoplay (works around the browser autoplay block) */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    const p = v.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  }, []);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const fn = () => setMenuOpen(false);
    window.addEventListener("scroll", fn, { passive: true, once: true });
    return () => window.removeEventListener("scroll", fn);
  }, [menuOpen]);

  const onMove = (e: React.MouseEvent) => {
    setMouseX((e.clientX / window.innerWidth - 0.5) * 8);
  };

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh" }} onMouseMove={onMove}>

      {/* ── NAV ── */}
      <nav className={`nav${scrolled ? " scrolled" : ""}`}>
        <Link href="/" className="brand-lock nav-logo">
          <img src="/logo-mark.png" alt="Wearit" className="brand-mark" />
          <span className="brand-word" style={{ fontSize: 21 }}>Wearit</span>
        </Link>

        <div className="nav-links">
          <a href="#how"       className="nav-link">{t.landing.nav.how}</a>
          <a href="#pricing"   className="nav-link">{t.landing.nav.pricing}</a>
          <Link href="/signin" className="nav-link nav-link-dark">{t.landing.nav.signIn}</Link>
          <LangSwitch />
          <Link href="/signup" className="btn-dark nav-cta" style={{ padding: "9px 22px", fontSize: 13 }}>
            {t.landing.nav.getStarted}
          </Link>
        </div>

        <button className="hamburger-btn" onClick={() => setMenuOpen(o => !o)} aria-label="Toggle menu">
          {menuOpen ? (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          )}
        </button>
      </nav>

      {menuOpen && (
        <div className="mobile-menu">
          <a href="#how"     className="mobile-menu-link" onClick={() => setMenuOpen(false)}>{t.landing.nav.how}</a>
          <a href="#pricing" className="mobile-menu-link" onClick={() => setMenuOpen(false)}>{t.landing.nav.pricing}</a>
          <Link href="/signin" className="mobile-menu-link" onClick={() => setMenuOpen(false)}>{t.landing.nav.signIn}</Link>
          <div style={{ marginTop: 16, display: "flex", justifyContent: "center" }}><LangSwitch /></div>
          <Link
            href="/signup"
            className="btn-dark"
            style={{ marginTop: 16, padding: "14px", fontSize: 15, width: "100%", justifyContent: "center" }}
            onClick={() => setMenuOpen(false)}
          >
            {t.landing.nav.getStarted}
          </Link>
        </div>
      )}

      {/* ── HERO ── */}
      <div className="hero-section">
        <video
          ref={videoRef}
          className="hero-bg-img"
          src="https://res.cloudinary.com/dbqafbjoi/video/upload/q_auto,w_1920/v1780476558/7679830-uhd_4096_2160_25fps_ezsc5y.mp4"
          poster="/images/hero-bg.jpg"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
        />
        <div className="hero-darken" />

        <div className="hero-inner">
          {/* Eyebrow */}
          <div className="anim-up" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28 }}>
            <div style={{ width: 20, height: 1, background: "rgba(255,255,255,0.35)" }} />
            <span style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(255,255,255,0.7)", fontWeight: 500 }}>
              {t.landing.hero.eyebrow}
            </span>
            <div style={{ width: 20, height: 1, background: "rgba(255,255,255,0.35)" }} />
          </div>

          <div style={{ marginBottom: 24, transform: `translateX(${mouseX}px)`, transition: "transform 0.5s ease" }}>
            <h1
              className="serif hero-title-fx"
              style={{
                fontSize: "clamp(56px, 9vw, 116px)",
                fontWeight: 300,
                lineHeight: 1.0,
                letterSpacing: "-0.04em",
                maxWidth: 900,
                color: "#fff",
              }}
            >
              {t.landing.hero.titleLine1}<br />
              <em style={{ fontStyle: "italic", fontWeight: 300 }}>{t.landing.hero.titleYou} <ShuffleWord words={t.landing.hero.shuffle} /></em>
            </h1>
          </div>

          <p
            className="anim-up-2"
            style={{
              fontSize: "clamp(15px,1.6vw,17px)",
              color: "rgba(255,255,255,0.78)",
              maxWidth: 380,
              lineHeight: 1.8,
              marginBottom: 40,
              fontWeight: 300,
              letterSpacing: "0.01em",
              textShadow: "0 1px 20px rgba(0,0,0,0.3)",
            }}
          >
            {t.landing.hero.subtitle}
          </p>

          <div className="anim-up-3" style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/signup" className="btn-light" style={{ padding: "14px 36px", fontSize: 14 }}>{t.landing.hero.tryFree}</Link>
            <a     href="#how"   className="btn-ghost" style={{ padding: "14px 36px", fontSize: 14 }}>{t.landing.hero.how}</a>
          </div>

          <div className="anim-up-4" style={{ marginTop: 56 }}>
            <a href="#how" className="scroll-cue" aria-label={t.landing.hero.scrollDown}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M1.5 3.5L6 8.5L10.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>
          </div>
        </div>

        {/* Stats row */}
        <div className="anim-up-4 hero-stats">
          {[
            { val: 33, suffix: "%", sub: t.landing.hero.stat1 },
            { val: 15, suffix: "s",  sub: t.landing.hero.stat2 },
          ].map(s => (
            <div key={s.sub} style={{ textAlign: "center" }}>
              <div className="serif" style={{ fontSize: "clamp(28px,3.6vw,38px)", color: "#fff", letterSpacing: "-0.03em", fontWeight: 300, textShadow: "0 2px 24px rgba(0,0,0,0.35)" }}>
                <AnimNum to={s.val} suffix={s.suffix} />
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 5, letterSpacing: "0.02em" }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── BRAND TICKER ── */}
      <div style={{ overflow: "hidden", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", padding: "18px 0", background: "var(--bg)" }}>
        <div className="ticker-track">
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((t, i) => (
            <span key={i} className="serif" style={{ padding: "0 22px", fontSize: "clamp(15px,1.7vw,22px)", fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.01em", whiteSpace: "nowrap", opacity: 0.55 }}>
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* ── SPLIT DEMO ── */}
      <section className="sec-demo">
        <div className="sec-inner">
          <div className="macbook reveal reveal-up">
            <div className="macbook-screen">
              <span className="macbook-notch" />
              <video
                className="demo-video"
                src="https://res.cloudinary.com/dbqafbjoi/video/upload/q_auto,w_1920/v1780834276/demo_uqh3ku.mp4"
                poster="/images/hero-bg.jpg"
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
              />
            </div>
            <div className="macbook-base" />
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <HowItWorks />

      {/* ── TESTIMONIALS ── */}
      <Testimonials />

      {/* ── FEATURES ── */}
      <section className="sec-features">
        <div className="sec-inner">
          <div className="reveal reveal-up" style={{ textAlign: "center", marginBottom: 64 }}>
            <p style={{ fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 16, fontWeight: 500 }}>{t.landing.features.eyebrow}</p>
            <h2 className="serif" style={{ fontSize: "clamp(32px,4.2vw,56px)", fontWeight: 500, letterSpacing: "-0.035em", color: "var(--ink)" }}>
              {t.landing.features.title}
            </h2>
          </div>
          <div className="stagger features-grid reveal reveal-scale" style={{ opacity: 1, transform: "none" }}>
            {[
              { Icon: IconDiamond,  ...t.landing.features.items[0], soon: false },
              { Icon: IconRack,     ...t.landing.features.items[1], soon: false },
              { Icon: IconHeart,    ...t.landing.features.items[2], soon: false },
              { Icon: IconArrow,    ...t.landing.features.items[3], soon: false },
              { Icon: IconCalendar, ...t.landing.features.items[4], soon: true  },
              { Icon: IconSearch,   ...t.landing.features.items[5], soon: true  },
            ].map((f, i) => (
              <div key={i} className={`reveal reveal-up feature-item${i === 0 || i === 5 ? " feat-wide" : ""}`} style={{ transitionDelay: `${i * 0.07}s` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
                  <span className="serif" style={{ fontSize: 13, fontWeight: 700, color: "var(--faint)", letterSpacing: "0.06em" }}>0{i + 1}</span>
                  <span className="feat-icon" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: "50%", border: "1px solid var(--border)", color: "var(--ink)", background: "var(--bg)" }}><f.Icon /></span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <h4 className="serif" style={{ fontSize: 20, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.02em" }}>{f.title}</h4>
                  {f.soon && (
                    <span style={{ fontSize: 10, letterSpacing: "0.08em", color: "var(--faint)", border: "1px solid var(--border)", padding: "2px 8px", borderRadius: 100 }}>
                      {t.landing.features.soon}
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.8, fontWeight: 300 }}>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── STATS STRIP ── */}
      <section className="sec-stats">
        <div className="stagger stats-grid sec-inner" style={{ maxWidth: 960 }}>
          {[
            { val: 30, suf: "%",  label: t.landing.stats.s1 },
            { val: 15, suf: "s",  label: t.landing.stats.s2 },
            { val: 10, suf: "K+", label: t.landing.stats.s3 },
          ].map((s, i) => (
            <div key={s.label} className="reveal reveal-up stat-item">
              <div
                className="serif"
                style={{ fontSize: "clamp(48px,6vw,80px)", fontWeight: 300, color: "var(--ink)", letterSpacing: "-0.04em", lineHeight: 1 }}
              >
                <AnimNum to={s.val} suffix={s.suf} />
              </div>
              <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 12, lineHeight: 1.6, letterSpacing: "0.01em", fontWeight: 300 }}>{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="sec-pricing">
        <div className="sec-inner-sm">
          <div className="reveal reveal-up" style={{ textAlign: "center", marginBottom: 60 }}>
            <p style={{ fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 16, fontWeight: 500 }}>{t.landing.pricing.eyebrow}</p>
            <h2 className="serif" style={{ fontSize: "clamp(32px,4.2vw,56px)", fontWeight: 500, letterSpacing: "-0.035em", marginBottom: 12, color: "var(--ink)" }}>
              {t.landing.pricing.title}
            </h2>
            <p style={{ color: "var(--muted)", fontSize: 15, fontWeight: 300 }}>{t.landing.pricing.subtitle}</p>
          </div>

          <div className="reveal reveal-up pricing-grid">
            {/* Free */}
            <div className="card" style={{ padding: "48px 44px" }}>
              <p style={{ fontSize: 11, color: "var(--faint)", marginBottom: 24, letterSpacing: "0.12em", fontWeight: 500 }}>{t.landing.pricing.free}</p>
              <div className="serif" style={{ fontSize: 56, letterSpacing: "-0.04em", color: "var(--ink)", marginBottom: 32, fontWeight: 300, lineHeight: 1 }}>$0</div>
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 28, marginBottom: 32 }}>
                {t.landing.pricing.freeFeatures.map(f => (
                  <div key={f} style={{ display: "flex", gap: 12, marginBottom: 14, fontSize: 14, color: "var(--muted)", fontWeight: 300, alignItems: "flex-start" }}>
                    <span style={{ color: "var(--ink)", marginTop: 1 }}>—</span>
                    {f}
                  </div>
                ))}
              </div>
              <Link href="/signup" className="btn-outline" style={{ width: "100%", padding: "13px", fontSize: 14 }}>
                {t.landing.pricing.getStartedFree}
              </Link>
            </div>

            {/* Pro — firing up */}
            <div className="pro-wrap">
              {/* fire layers (behind the opaque card) */}
              <span className="pro-aura" aria-hidden="true" />
              <span className="pro-fire" aria-hidden="true" />
              <div className="pro-embers" aria-hidden="true">
                {[
                  { l: 26, d: 5.5, delay: 0,   x: "-14px" },
                  { l: 34, d: 6.4, delay: 1.2, x: "10px"  },
                  { l: 44, d: 4.9, delay: 2.1, x: "-8px"  },
                  { l: 50, d: 6.0, delay: 0.6, x: "16px"  },
                  { l: 58, d: 5.2, delay: 2.8, x: "-12px" },
                  { l: 66, d: 6.8, delay: 1.7, x: "8px"   },
                  { l: 74, d: 5.0, delay: 3.3, x: "-6px"  },
                ].map((e, i) => (
                  <span
                    key={i}
                    className="ember"
                    style={{ left: `${e.l}%`, animationDuration: `${e.d}s`, animationDelay: `${e.delay}s`, "--drift": e.x } as React.CSSProperties}
                  />
                ))}
              </div>

              <div className="card pro-card" onClick={() => setShowPro(true)} style={{ padding: "48px 44px", background: "var(--ink)", borderColor: "transparent", cursor: "pointer" }}>
              <div className="pro-content">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: "0.12em", fontWeight: 500 }}>{t.landing.pricing.pro}</p>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "#FFD9A8", border: "1px solid rgba(255,150,60,0.4)", background: "rgba(255,110,35,0.14)", padding: "3px 11px", borderRadius: 100, letterSpacing: "0.06em" }}>
                    <svg width="11" height="13" viewBox="0 0 11 13" fill="none">
                      <path d="M5.5 0.5C6 3 8.2 3.6 8.2 6.4c0 1-.5 2-.5 2s1.3-.4 1.6-1.9c.8 1 1.2 2.2 1.2 3.3C10.5 11.4 8.3 12.5 5.5 12.5S0.5 11.4.5 9.8C.5 7.4 2.8 6 3.2 3.4 3.9 4 4.2 4.8 4.2 4.8S3.4 2.8 5.5 0.5z" fill="#FF8A2A"/>
                    </svg>
                    {t.landing.pricing.mostPopular}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 32 }}>
                  <span className="serif" style={{ fontSize: 56, letterSpacing: "-0.04em", color: "#fff", fontWeight: 300, lineHeight: 1 }}>$13</span>
                  <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 16, fontWeight: 300 }}>{t.landing.pricing.perMo}</span>
                </div>
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 28, marginBottom: 32 }}>
                  {t.landing.pricing.proFeatures.map(f => (
                    <div key={f} style={{ display: "flex", gap: 12, marginBottom: 14, fontSize: 14, color: "rgba(255,255,255,0.62)", fontWeight: 300, alignItems: "flex-start" }}>
                      <span style={{ color: "#FF9A4A", marginTop: 1 }}>—</span>
                      {f}
                    </div>
                  ))}
                </div>
                <Link href="/signup" className="btn-pro" onClick={(e) => e.stopPropagation()}>
                  {t.landing.pricing.startTrial}
                </Link>
                <span className="pro-tap-hint">{t.landing.pricing.tapHint} <IconArrow /></span>
              </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── BIG CTA ── */}
      <section className="sec-cta">
        <img className="cta-illo cta-illo-left" src="/images/wolf-struggle.png" alt="" aria-hidden="true" />
        <img className="cta-illo cta-illo-right" src="/images/wolf-relax.png" alt="" aria-hidden="true" />

        <div className="reveal">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 34 }}>
            <div className="cta-eyebrow-line" />
            <span style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 500 }}>{t.landing.cta.eyebrow}</span>
            <div className="cta-eyebrow-line" />
          </div>

          <h2
            className="serif"
            style={{ fontSize: "clamp(46px,8.5vw,104px)", fontWeight: 500, letterSpacing: "-0.045em", lineHeight: 1.0, marginBottom: 44, color: "var(--ink)" }}
          >
            <span className="cta-line"><span>{t.landing.cta.lineA}</span></span>
            <span className="cta-line"><span><em className="cta-accent" style={{ fontStyle: "italic" }}>{t.landing.cta.lineB}</em></span></span>
          </h2>

          <Link href="/signup" className="btn-cta">
            {t.landing.cta.tryFree}
            <span className="btn-cta-arrows">
              <span>
                <svg viewBox="0 0 16 16" fill="none"><path d="M3 8h9M8.5 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <svg viewBox="0 0 16 16" fill="none"><path d="M3 8h9M8.5 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </span>
            </span>
          </Link>

          <p style={{ marginTop: 24, fontSize: 13, color: "var(--faint)", fontWeight: 300, letterSpacing: "0.02em" }}>
            {t.landing.cta.note}
          </p>
        </div>
      </section>

      {/* ── FAQ ── */}
      <FAQ />

      {/* ── FOOTER ── */}
      <footer className="site-footer">
        <div className="footer-watermark" aria-hidden="true" />
        <div className="footer-inner">

          {/* Top row: brand + CTA */}
          <div className="footer-top">
            <div>
              <div className="brand-lock">
                <img src="/logo-mark.png" alt="Wearit" className="brand-mark brand-mark-light" style={{ height: 40 }} />
                <span className="serif" style={{ fontSize: 46, fontWeight: 600, color: "#fff", letterSpacing: "-0.03em", lineHeight: 1 }}>Wearit</span>
              </div>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.3)", marginTop: 18, fontWeight: 300, letterSpacing: "0.01em" }}>
                {t.landing.footer.tagline}
              </p>
            </div>
            <Link href="/signup" className="footer-cta-btn">
              {t.landing.footer.tryFree}
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ opacity: 0.6 }}>
                <path d="M2.5 9.5L9.5 2.5M9.5 2.5H4M9.5 2.5V8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
          </div>

          {/* Links row: 3 columns */}
          <div className="footer-links-row">
            <div>
              <p className="footer-col-label">{t.landing.footer.product}</p>
              <a href="#how"         className="footer-link">{t.landing.footer.how}</a>
              <Link href="/app"      className="footer-link">{t.landing.footer.tryOn}</Link>
              <Link href="/wardrobe" className="footer-link">{t.landing.footer.wardrobe}</Link>
              <a href="#pricing"     className="footer-link">{t.landing.footer.pricing}</a>
              <a href="#faq"         className="footer-link">{t.landing.footer.faq}</a>
            </div>
            <div>
              <p className="footer-col-label">{t.landing.footer.company}</p>
              <a href="#" className="footer-link">{t.landing.footer.about}</a>
              <a href="#" className="footer-link">{t.landing.footer.blog}</a>
              <a href="#" className="footer-link">{t.landing.footer.careers}</a>
              <a href="mailto:rgalbeke@gmail.com" className="footer-link">{t.landing.footer.contact}</a>
            </div>
            <div>
              <p className="footer-col-label">{t.landing.footer.connect}</p>
              <a href="https://www.instagram.com/zherik.tl?igsh=bjdwNTN0ejNpbHRk&utm_source=qr" target="_blank" rel="noopener noreferrer" className="footer-link">
                <IconInstagram />
                Instagram
              </a>
              <a href="https://x.com/dkzherik?s=21" target="_blank" rel="noopener noreferrer" className="footer-link">
                <IconX />
                Twitter / X
              </a>
              <a href="mailto:rgalbeke@gmail.com" className="footer-link">
                <IconMail />
                rgalbeke@gmail.com
              </a>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="footer-bottom">
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.18)", letterSpacing: "0.01em" }}>
              {t.landing.footer.rights}
            </span>
            <div style={{ display: "flex", gap: 28, alignItems: "center" }}>
              <a href="#" className="footer-legal-link">{t.landing.footer.privacy}</a>
              <a href="#" className="footer-legal-link">{t.landing.footer.terms}</a>
              <a href="#" className="footer-legal-link">{t.landing.footer.cookies}</a>
            </div>
          </div>

        </div>
      </footer>

      {showPro && <LandingProModal onClose={() => setShowPro(false)} />}
    </div>
  );
}

/* Pro details — Free vs Pro breakdown, opened from the pricing card. */
function LandingProModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  // [label, free, pro, highlighted = a real upgrade over free]
  const ROWS = t.landing.proModal.rows;
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(20,16,10,0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", background: "var(--ink)", borderRadius: 18, padding: "30px 28px", position: "relative", boxShadow: "0 30px 80px rgba(0,0,0,0.45)" }}>
        <button onClick={onClose} aria-label={t.common.close} style={{ position: "absolute", top: 16, right: 16, width: 30, height: 30, borderRadius: 100, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 17, lineHeight: 1, padding: 0 }}>×</button>

        <p style={{ fontSize: 11, letterSpacing: "0.14em", color: "#FFD9A8", fontWeight: 600, marginBottom: 8 }}>{t.landing.proModal.eyebrow}</p>
        <h2 className="serif" style={{ fontSize: 30, fontWeight: 600, color: "#fff", letterSpacing: "-0.03em", marginBottom: 6 }}>{t.landing.proModal.title}</h2>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", fontWeight: 300, marginBottom: 22 }}>
          <span style={{ fontSize: 26, color: "#fff", fontWeight: 500 }}>{t.landing.proModal.price}</span>{t.landing.proModal.priceSuffix}
        </p>

        <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, overflow: "hidden", marginBottom: 22 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.3fr 0.9fr 1.1fr", padding: "10px 14px", fontSize: 11, letterSpacing: "0.06em", color: "rgba(255,255,255,0.4)", borderBottom: "1px solid rgba(255,255,255,0.1)", fontWeight: 600 }}>
            <span></span><span>{t.landing.proModal.free}</span><span style={{ color: "#FFD9A8" }}>{t.landing.proModal.pro}</span>
          </div>
          {ROWS.map(([label, free, pro, hot], i) => (
            <div key={label} style={{ display: "grid", gridTemplateColumns: "1.3fr 0.9fr 1.1fr", alignItems: "center", padding: "11px 14px", borderBottom: i < ROWS.length - 1 ? "1px solid rgba(255,255,255,0.07)" : undefined, background: hot ? "rgba(176,138,62,0.08)" : undefined }}>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", fontWeight: hot ? 500 : 400 }}>{label}</span>
              <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.4)" }}>{free}</span>
              <span style={{ fontSize: 12.5, color: hot ? "#FFD9A8" : "rgba(255,255,255,0.85)", fontWeight: hot ? 600 : 400, display: "flex", alignItems: "center", gap: 5 }}>
                {hot && <IconCheck />}{pro}
              </span>
            </div>
          ))}
        </div>

        <Link href="/signup" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "#fff", color: "var(--ink)", borderRadius: 8, padding: "15px", fontSize: 15, fontWeight: 600, textDecoration: "none" }}>
          {t.landing.proModal.startTrial}
        </Link>
      </div>
    </div>
  );
}
