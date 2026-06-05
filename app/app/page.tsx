"use client";
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import AppShell from "@/lib/app-shell";
import {
  getProfile, getTryOns, incTryOns, addWardrobeItem, dataURLToFile, dataURLToThumb,
  pullRemote, creditLimit, WardrobeItem, FREE_MONTHLY,
} from "@/lib/store";

const PRO_PRODUCT = process.env.NEXT_PUBLIC_POLAR_PRO_PRODUCT_ID;
function checkoutHref(uid: string | null, email: string | null): string {
  if (uid && PRO_PRODUCT) {
    return `/api/checkout?products=${PRO_PRODUCT}&customerExternalId=${uid}&customerEmail=${encodeURIComponent(email || "")}`;
  }
  return "/#pricing";
}
import {
  IconSpark, IconUpload, IconHeart, IconHeartFilled, IconShare,
  IconLink, IconBulb, IconInstagram, IconCheck, IconArrowRight,
  IconTikTok, IconWhatsApp, IconDownload, IconLinkChain, IconScrub,
} from "@/lib/icons";
import { toast } from "@/lib/toast";

type Category = "tops" | "bottoms" | "one-pieces";
type Verdict  = "buy" | "skip" | "maybe";
interface StyleAdvice { verdict: Verdict; score: number; summary: string; pros: string[]; cons: string[]; tip: string; recommendedSize?: string; sizeReason?: string; }
type Body = { heightCm: number | null; weightKg: number | null; gender: string };
interface Result { resultImageUrl: string; styleAdvice: StyleAdvice; remaining: number | "unlimited"; }
type GItem = { id: string; file?: File; url: string; cat: Category };
const MAX_GARMENTS = 4;

const VERDICT = {
  buy:   { label: "Buy it",  color: "#1a7a2e", tag: "tag-green" },
  skip:  { label: "Skip it", color: "#b71c1c", tag: "tag-red"   },
  maybe: { label: "Maybe",   color: "#a16207", tag: "tag-amber" },
};

const CAT_LABEL: Record<Category, WardrobeItem["category"]> = {
  tops: "Tops", bottoms: "Bottoms", "one-pieces": "One-pieces",
};

/* Before / after comparison slider */
function BeforeAfter({ before, after }: { before: string; after: string }) {
  const [pos, setPos] = useState(50);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef(false);
  const move = (clientX: number) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  };
  return (
    <div
      ref={ref}
      className="ba result-img"
      onPointerDown={(e) => { drag.current = true; ref.current?.setPointerCapture(e.pointerId); move(e.clientX); }}
      onPointerMove={(e) => { if (drag.current) move(e.clientX); }}
      onPointerUp={() => { drag.current = false; }}
      onPointerCancel={() => { drag.current = false; }}
    >
      <img className="ba-after" src={after} alt="Try-on" />
      <img className="ba-before" src={before} alt="You" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} />
      <span className="ba-tag" style={{ left: 14 }}>You</span>
      <span className="ba-tag" style={{ right: 14 }}>Try-on</span>
      <div className="ba-divider" style={{ left: `${pos}%` }}>
        <div className="ba-handle"><IconScrub size={18} /></div>
      </div>
    </div>
  );
}

/* Confetti burst — fires once when a look gets a "Buy it" verdict */
const CONFETTI_COLORS = ["#C9A84C", "#1a7a2e", "#FF8A2A", "#6B7A8D", "#B08A3E", "#E8C97A", "#fff"];
function Confetti() {
  const pieces = useMemo(() => Array.from({ length: 22 }).map((_, i) => {
    const angle = (i / 22) * Math.PI * 2 + Math.random() * 0.5;
    const dist  = 90 + Math.random() * 150;
    const w = 6 + Math.random() * 5;
    return {
      tx: Math.cos(angle) * dist,
      ty: Math.sin(angle) * dist * 0.6 + 90, // bias downward (gravity)
      rot: Math.random() * 720 - 360,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: Math.random() * 0.12,
      w,
    };
  }), []);
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <i key={i} style={{
          background: p.color, width: p.w, height: p.w * 1.7,
          "--tx": `${p.tx}px`, "--ty": `${p.ty}px`, "--rot": `${p.rot}deg`,
          animationDelay: `${p.delay}s`,
        } as React.CSSProperties} />
      ))}
    </div>
  );
}

export default function TryOnApp() {
  const [uid, setUid]         = useState<string | null>(null);
  const [photo, setPhoto]     = useState<string | null>(null);
  const [garments, setGarments] = useState<GItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<Result|null>(null);
  const [error, setError]     = useState<string|null>(null);
  const [prog, setProg]       = useState(0);
  const [saved, setSaved]     = useState(false);
  const [drag, setDrag]       = useState(false);
  const [credits, setCredits] = useState(FREE_MONTHLY);
  const [body, setBody]       = useState<Body>({ heightCm: null, weightKg: null, gender: "" });
  const [linkUrl, setLinkUrl] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [email, setEmail]     = useState<string | null>(null);

  const garmentRef = useRef<HTMLInputElement>(null);

  /* The model photo + measurements + credits come from the saved profile */
  useEffect(() => onAuthStateChanged(auth, async (u) => {
    if (!u) return;
    setUid(u.uid);
    setEmail(u.email);
    // if we just came back from a successful upgrade, re-sync the plan first
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("upgraded")) {
      await pullRemote(u.uid);
      toast("Welcome to Pro — 40 credits unlocked", "success");
    }
    const p = getProfile(u.uid);
    setPhoto(p.photo);
    setBody({ heightCm: p.heightCm, weightKg: p.weightKg, gender: p.gender });
    setCredits(Math.max(0, creditLimit(u.uid) - getTryOns(u.uid)));
  }), []);

  useEffect(() => {
    if (!loading) { setProg(0); return; }
    setProg(10);
    const id = setInterval(() => setProg(p => p < 82 ? p + Math.random()*5 : p), 700);
    return () => clearInterval(id);
  }, [loading]);

  const addGarment = (g: Omit<GItem, "id">): boolean => {
    let added = false;
    setGarments((prev) => {
      if (prev.length >= MAX_GARMENTS) return prev;
      added = true;
      return [...prev, { ...g, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }];
    });
    setResult(null); setError(null); setSaved(false);
    return added;
  };
  const removeGarment   = (id: string) => setGarments((prev) => prev.filter((g) => g.id !== id));
  const setGarmentCat   = (id: string, cat: Category) => setGarments((prev) => prev.map((g) => (g.id === id ? { ...g, cat } : g)));

  const onGarment = useCallback((f: File) => {
    if (!f.type.startsWith("image/") || f.size > 10_000_000) return;
    setGarments((prev) => {
      if (prev.length >= MAX_GARMENTS) { toast(`Up to ${MAX_GARMENTS} pieces per look`, "error"); return prev; }
      return [...prev, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, file: f, url: URL.createObjectURL(f), cat: "tops" }];
    });
    setResult(null); setError(null); setSaved(false);
  }, []);

  const useLink = async (rawUrl?: string) => {
    const u = (rawUrl ?? linkUrl).trim();
    if (!u || linkBusy) return;
    if (garments.length >= MAX_GARMENTS) { toast(`Up to ${MAX_GARMENTS} pieces per look`, "error"); return; }
    setLinkBusy(true); setError(null);
    try {
      const r = await fetch("/api/fetch-image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: u }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Couldn't load that link");
      const file = await dataURLToFile(d.dataUrl, "garment.jpg");
      if (addGarment({ file, url: d.dataUrl, cat: "tops" })) { setLinkUrl(""); toast("Garment added from link", "success"); }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't load that link", "error");
    } finally {
      setLinkBusy(false);
    }
  };

  // Auto-load a garment handed off from the Stylist's Shop Discovery (?garment=<url>).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const g = new URLSearchParams(window.location.search).get("garment");
    if (!g) return;
    useLink(g);
    // clear the param so a refresh doesn't reload it
    const url = new URL(window.location.href);
    url.searchParams.delete("garment");
    window.history.replaceState({}, "", url.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generate = async () => {
    const cost = garments.length;
    if (!photo || cost === 0 || loading) return;
    if (credits < cost) {
      setError(cost > 1
        ? `This look needs ${cost} credits — you have ${credits} left. Upgrade to Pro for more.`
        : "You're out of credits. Upgrade to Pro for 40 a month.");
      return;
    }
    setLoading(true); setError(null); setResult(null); setSaved(false);
    try {
      const modelFile = await dataURLToFile(photo, "model.jpg");
      const fd = new FormData();
      fd.append("modelImage", modelFile);
      // layer order: bottoms → tops → one-pieces reads oddly; keep the user's add order
      for (const g of garments) {
        fd.append("garmentImage", g.file!);
        fd.append("category", g.cat);
      }
      if (body.heightCm) fd.append("heightCm", String(body.heightCm));
      if (body.weightKg) fd.append("weightKg", String(body.weightKg));
      if (body.gender)   fd.append("gender", body.gender);
      const r = await fetch("/api/tryon-demo", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed");
      setProg(100);
      await new Promise(res => setTimeout(res, 300));
      setResult(d);
      if (uid) { const n = incTryOns(uid, cost); setCredits(Math.max(0, creditLimit(uid) - n)); }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const saveToWardrobe = async () => {
    if (!result || !uid || saved) return;
    setSaved(true);
    // store a small thumbnail (not the full-res image) so localStorage never overflows
    const thumb = await dataURLToThumb(result.resultImageUrl, 560, 0.72);
    const primaryCat = garments[0]?.cat ?? "tops";
    addWardrobeItem(uid, {
      id: String(Date.now()),
      name: garments.length > 1 ? `Full look · ${garments.length} pieces` : `${CAT_LABEL[primaryCat]} try-on`,
      category: CAT_LABEL[primaryCat],
      verdict: result.styleAdvice.verdict,
      score: result.styleAdvice.score,
      img: thumb,
      fav: true,
      createdAt: Date.now(),
    });
    toast("Saved to your wardrobe", "success");
  };

  const SHARE_TEXT = "My new look, tried on with Wearit ✨";

  const getResultFile = async () => {
    const res = await fetch(result!.resultImageUrl);
    const blob = await res.blob();
    return new File([blob], "wearit-look.jpg", { type: blob.type || "image/jpeg" });
  };

  const downloadImage = async () => {
    const a = document.createElement("a");
    a.href = result!.resultImageUrl;
    a.download = "wearit-look.jpg";
    document.body.appendChild(a); a.click(); a.remove();
  };

  /* Native share sheet with the actual image (Instagram / TikTok / WhatsApp on mobile) */
  const nativeShare = async () => {
    try {
      const file = await getResultFile();
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.canShare && nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], text: SHARE_TEXT, title: "Wearit" });
        return true;
      }
    } catch { /* user cancelled or unsupported */ }
    return false;
  };

  const share = async (platform: string) => {
    if (!result) return;
    if (platform === "copy") { await navigator.clipboard.writeText(result.resultImageUrl); toast("Link copied"); return; }
    if (platform === "download") { await downloadImage(); return; }

    // Try the native share sheet first — it routes the real photo to IG/TikTok/WhatsApp.
    const shared = await nativeShare();
    if (shared) return;

    // Desktop / unsupported fallback: save the photo, then open the app to post it.
    await downloadImage();
    const open: Record<string, string> = {
      instagram: "https://www.instagram.com/",
      tiktok:    "https://www.tiktok.com/upload",
      whatsapp:  `https://wa.me/?text=${encodeURIComponent(SHARE_TEXT)}`,
    };
    if (open[platform]) {
      toast("Photo saved — opening " + platform[0].toUpperCase() + platform.slice(1) + " to post it", "success");
      window.open(open[platform], "_blank");
    }
  };

  const vc = result ? VERDICT[result.styleAdvice.verdict] : null;
  const phase = prog < 35 ? "Reading your fit" : prog < 70 ? "Draping the garment" : "Scoring the look";

  return (
    <AppShell>
      <div style={{ display:"grid",gridTemplateColumns:(result||loading)?"1fr 1fr":"1fr",minHeight:"100vh" }} className="tryon-grid">

        {/* LEFT */}
        <div className="page-in" style={{ padding:"48px 44px",borderRight:result?"1px solid var(--border)":undefined,maxWidth:result?undefined:620,margin:result?undefined:"0 auto",width:"100%" }}>
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,marginBottom:14 }}>
            <p style={{ fontSize:11,letterSpacing:"0.15em",textTransform:"uppercase",color:"var(--muted)",fontWeight:500 }}>New try-on</p>
            <span style={{ display:"inline-flex",alignItems:"center",gap:7,fontSize:12,fontWeight:500,color:"var(--ink)",background:"var(--card)",border:"1px solid var(--border)",padding:"5px 12px",borderRadius:100 }}>
              <span style={{ width:6,height:6,borderRadius:"50%",background:credits>0?"#1a7a2e":"#b71c1c" }} />
              {credits} {credits === 1 ? "credit" : "credits"} left
            </span>
          </div>
          <h1 className="serif" style={{ fontSize:46,fontWeight:600,letterSpacing:"-0.035em",marginBottom:8,color:"var(--ink)" }}>Try on anything</h1>
          <p style={{ fontSize:15,color:"var(--muted)",marginBottom:32,fontWeight:300 }}>
            {photo ? "Your photo is ready. Just drop in a garment." : "Add your photo to your profile, then come back to try things on."}
          </p>

          {photo ? (
            <>
              <input ref={garmentRef} type="file" accept="image/*" style={{ display:"none" }} disabled={loading} onChange={e=>{const f=e.target.files?.[0];if(f)onGarment(f);}}/>

              {/* Model chip — saved profile photo */}
              <div style={{ display:"flex",alignItems:"center",gap:14,padding:"12px 14px",border:"1px solid var(--border)",borderRadius:12,background:"var(--card)",marginBottom:22 }}>
                <img src={photo} alt="You" style={{ width:44,height:44,borderRadius:8,objectFit:"cover",flexShrink:0 }}/>
                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ fontSize:13,fontWeight:500,color:"var(--ink)" }}>Wearing your photo</div>
                  <div style={{ fontSize:12,color:"var(--muted)",marginTop:1 }}>From your fit profile</div>
                </div>
                <Link href="/onboarding" style={{ fontSize:12,color:"var(--ink)",textDecoration:"none",border:"1px solid var(--border)",padding:"7px 14px",borderRadius:6 }}>Change</Link>
              </div>

              {/* Your look — one or more pieces, layered on you together */}
              <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8 }}>
                <p style={{ fontSize:11,letterSpacing:"0.1em",textTransform:"uppercase",color:"var(--faint)",fontWeight:500 }}>Your look</p>
                <span style={{ fontSize:12,color:"var(--muted)" }}>{garments.length}/{MAX_GARMENTS} pieces</span>
              </div>
              <p style={{ fontSize:13,color:"var(--muted)",lineHeight:1.6,fontWeight:300,marginBottom:16 }}>Add one piece or build a full outfit — a top, bottoms, shoes and a jacket get layered on you together. Each piece uses 1 credit; set the right type under each.</p>

              {garments.length === 0 ? (
                /* Empty state — one clean, full-width drop zone */
                <div
                  className={`upload-zone${drag?" drag":""}`}
                  style={{ minHeight:280,position:"relative",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:22,cursor:"pointer" }}
                  onClick={()=>garmentRef.current?.click()}
                  onDragOver={e=>{e.preventDefault();setDrag(true);}}
                  onDragLeave={()=>setDrag(false)}
                  onDrop={e=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f)onGarment(f);}}
                >
                  <div style={{ textAlign:"center",padding:28,pointerEvents:"none",color:"var(--muted)" }}>
                    <div className="up-float" style={{ display:"inline-flex",color:"var(--faint)",marginBottom:14 }}><IconUpload size={34}/></div>
                    <p style={{ fontSize:15,color:"var(--ink)",fontWeight:500,marginBottom:6 }}>Drop a garment photo</p>
                    <p style={{ fontSize:13,color:"var(--muted)",lineHeight:1.6,fontWeight:300 }}>Any item from any store — a screenshot or product image.<br/><span style={{ fontSize:11,color:"var(--faint)" }}>JPG · PNG · WebP · max 10MB</span></p>
                  </div>
                </div>
              ) : (
                <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:12,marginBottom:22 }}>
                  {garments.map((g,i) => (
                    <div key={g.id} style={{ border:"1px solid var(--border)",borderRadius:12,overflow:"hidden",background:"var(--card)" }}>
                      <div style={{ position:"relative",aspectRatio:"3/4",background:"#fff" }}>
                        <img src={g.url} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }}/>
                        <span style={{ position:"absolute",top:8,left:8,width:22,height:22,borderRadius:100,background:"var(--brand)",color:"#fff",fontSize:11,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center" }}>{i+1}</span>
                        <button onClick={()=>removeGarment(g.id)} aria-label="Remove piece" disabled={loading} style={{ position:"absolute",top:8,right:8,width:24,height:24,borderRadius:100,background:"rgba(255,252,247,0.94)",border:"1px solid var(--border)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(8px)",color:"var(--ink)",fontSize:15,lineHeight:1,padding:0 }}>×</button>
                      </div>
                      <div style={{ display:"flex",gap:4,padding:6 }}>
                        {(["tops","bottoms","one-pieces"] as Category[]).map(c => (
                          <button key={c} onClick={()=>setGarmentCat(g.id,c)} disabled={loading} style={{
                            flex:1,padding:"5px 0",borderRadius:6,fontSize:10.5,cursor:"pointer",fontFamily:"'Hanken Grotesk',sans-serif",
                            background: g.cat===c ? "var(--brand)":"transparent",
                            color:      g.cat===c ? "#fff":"var(--muted)",
                            border:     g.cat===c ? "1px solid var(--brand)":"1px solid var(--border)",
                          }}>{c==="one-pieces"?"Full":c==="tops"?"Top":"Bottom"}</button>
                        ))}
                      </div>
                    </div>
                  ))}

                  {garments.length < MAX_GARMENTS && (
                    <div
                      className={`upload-zone${drag?" drag":""}`}
                      style={{ aspectRatio:"3/4",position:"relative",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}
                      onClick={()=>garmentRef.current?.click()}
                      onDragOver={e=>{e.preventDefault();setDrag(true);}}
                      onDragLeave={()=>setDrag(false)}
                      onDrop={e=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f)onGarment(f);}}
                    >
                      <div style={{ textAlign:"center",padding:14,pointerEvents:"none",color:"var(--muted)" }}>
                        <div className="up-float" style={{ display:"inline-flex",color:"var(--faint)",marginBottom:8 }}><IconUpload size={24}/></div>
                        <p style={{ fontSize:13,color:"var(--ink)",fontWeight:500 }}>Add another</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* …or paste a product link */}
              <div style={{ marginBottom:26 }}>
                <p style={{ fontSize:11,letterSpacing:"0.1em",textTransform:"uppercase",color:"var(--faint)",marginBottom:10,fontWeight:500 }}>…or paste a product link</p>
                <div className="linkbar">
                  <input
                    value={linkUrl}
                    onChange={e=>setLinkUrl(e.target.value)}
                    onKeyDown={e=>{ if(e.key==="Enter") useLink(); }}
                    placeholder="https://… store page or image URL"
                    disabled={linkBusy || garments.length>=MAX_GARMENTS}
                  />
                  <button className="btn-dark" onClick={() => useLink()} disabled={linkBusy || !linkUrl.trim() || garments.length>=MAX_GARMENTS} style={{ padding:"0 18px",borderRadius:8,display:"flex",alignItems:"center",gap:7,fontSize:14 }}>
                    {linkBusy ? <div className="spinner" style={{ width:16,height:16 }}/> : <IconLinkChain size={16}/>}
                    Add
                  </button>
                </div>
              </div>

              {error && <div style={{ marginBottom:16,padding:"12px 16px",borderRadius:8,background:"#fdecea",border:"1px solid #f5c6c2",color:"#b71c1c",fontSize:14 }}>{error}</div>}

              {loading && (
                <div style={{ marginBottom:14,height:3,background:"rgba(26,22,17,0.08)",borderRadius:2,overflow:"hidden" }}>
                  <div style={{ height:"100%",width:`${prog}%`,background:"var(--brand)",borderRadius:2,transition:"width 0.5s ease" }}/>
                </div>
              )}

              {credits <= 0 ? (
                <a href={checkoutHref(uid, email)} className="btn-dark" style={{ width:"100%",padding:"16px",fontSize:15,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",gap:8 }}>
                  Out of credits — upgrade to Pro <IconArrowRight size={16}/>
                </a>
              ) : (
                <button className={`btn-dark${garments.length>0&&!loading?" btn-ready":""}`} onClick={generate} disabled={garments.length===0||loading}
                  style={{ width:"100%",padding:"16px",fontSize:15,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",gap:10 }}>
                  {loading
                    ? <><div className="spinner" style={{ width:18,height:18 }}/>{garments.length>1?`Layering ${garments.length} pieces…`:"Generating your look…"}</>
                    : <><IconSpark size={18}/> {garments.length<=1?"Try it on · 1 credit":`Try on ${garments.length} pieces · ${garments.length} credits`}</>}
                </button>
              )}
              <p style={{ textAlign:"center",fontSize:12,color:"var(--faint)",marginTop:12 }}>
                {garments.length>1
                  ? `~${garments.length*12}s · uses ${garments.length} credits (1 per piece)`
                  : "Result in ~15 seconds · uses 1 credit"}
              </p>
            </>
          ) : (
            /* No saved photo yet */
            <div style={{ border:"1px dashed var(--border)",borderRadius:16,padding:"56px 32px",textAlign:"center",background:"var(--card)" }}>
              <div style={{ display:"inline-flex",color:"var(--faint)",marginBottom:16 }}><IconUpload size={36}/></div>
              <h3 className="serif" style={{ fontSize:24,fontWeight:600,color:"var(--ink)",marginBottom:10,letterSpacing:"-0.025em" }}>Set up your photo first</h3>
              <p style={{ fontSize:14,color:"var(--muted)",fontWeight:300,marginBottom:26,maxWidth:320,marginInline:"auto",lineHeight:1.7 }}>
                Add a full-length photo to your fit profile once — then every try-on only needs the garment.
              </p>
              <Link href="/onboarding" className="btn-dark" style={{ padding:"12px 26px",fontSize:14,gap:8 }}>
                Add your photo <IconArrowRight size={15}/>
              </Link>
            </div>
          )}
        </div>

        {/* RIGHT — generating skeleton */}
        {loading && !result && (
          <div className="anim-up" style={{ display:"flex",flexDirection:"column" }}>
            <div className="gen-skel">
              <div className="gen-status">
                <div className="gen-ring" />
                <div key={phase} className="gen-status-text" style={{ fontSize:14,fontWeight:500,color:"var(--ink)",letterSpacing:"0.01em" }}>{phase}…</div>
                <div style={{ fontSize:12,color:"var(--muted)" }}>{Math.round(prog)}%</div>
              </div>
            </div>
          </div>
        )}

        {/* RIGHT — result */}
        {result && (
          <div className="anim-up" style={{ display:"flex",flexDirection:"column",position:"relative" }}>
            {result.styleAdvice.verdict === "buy" && <Confetti key={result.resultImageUrl} />}
            <div style={{ position:"relative",flexShrink:0,overflow:"hidden" }}>
              {photo
                ? <BeforeAfter before={photo} after={result.resultImageUrl} />
                : <img src={result.resultImageUrl} alt="Your look" className="result-img" style={{ width:"100%",display:"block",height:"70vh",objectFit:"contain",background:"#14100A" }}/>}
              <div style={{ position:"absolute",top:16,right:16,display:"flex",gap:8,zIndex:5 }}>
                <button onClick={saveToWardrobe} aria-label="Save to wardrobe" style={{ background:"rgba(255,252,247,0.9)",border:"none",borderRadius:100,width:38,height:38,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(8px)",color:saved?"#b71c1c":"var(--ink)",transition:"transform .2s" }}
                  onMouseEnter={e=>(e.currentTarget.style.transform="scale(1.08)")} onMouseLeave={e=>(e.currentTarget.style.transform="scale(1)")}>
                  {saved ? <IconHeartFilled size={18}/> : <IconHeart size={18}/>}
                </button>
                <button onClick={()=>share("native")} aria-label="Share" style={{ background:"rgba(255,252,247,0.9)",border:"none",borderRadius:100,width:38,height:38,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(8px)",color:"var(--ink)",transition:"transform .2s" }}
                  onMouseEnter={e=>(e.currentTarget.style.transform="scale(1.08)")} onMouseLeave={e=>(e.currentTarget.style.transform="scale(1)")}>
                  <IconShare size={17}/>
                </button>
              </div>
            </div>

            {vc && (
              <div style={{ padding:"26px 30px",flex:1,overflowY:"auto" }}>
                <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14 }}>
                  <span className={`tag ${vc.tag}`} style={{ fontSize:13,padding:"4px 14px" }}>{vc.label}</span>
                  <span className="serif" style={{ fontSize:24,fontWeight:300,color:"rgba(26,22,17,0.25)",letterSpacing:"-0.02em" }}>{result.styleAdvice.score}/10</span>
                </div>

                <div style={{ height:3,background:"rgba(26,22,17,0.07)",borderRadius:2,marginBottom:20,overflow:"hidden" }}>
                  <div style={{ height:"100%",width:`${result.styleAdvice.score*10}%`,background:vc.color,borderRadius:2,transition:"width 1s ease" }}/>
                </div>

                {/* Prominent save action */}
                <button
                  onClick={saveToWardrobe}
                  disabled={saved}
                  className={saved ? "btn-outline" : "btn-dark"}
                  style={{ width:"100%",padding:"14px",fontSize:14,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",gap:9,marginBottom:20,...(saved?{color:"#1a7a2e",borderColor:"rgba(26,122,46,0.4)"}:{}) }}>
                  {saved
                    ? <><IconCheck size={16}/> Saved to wardrobe</>
                    : <><IconHeart size={17}/> Save to wardrobe</>}
                </button>

                <p style={{ fontSize:15,color:"rgba(26,22,17,0.78)",lineHeight:1.7,marginBottom:20,fontWeight:300 }}>{result.styleAdvice.summary}</p>

                {result.styleAdvice.recommendedSize && (
                  <div className="size-pop" style={{ display:"flex",alignItems:"center",gap:14,padding:"16px",border:"1px solid var(--border)",borderRadius:14,background:"var(--card)",marginBottom:20 }}>
                    <div style={{ width:56,height:56,borderRadius:12,background:"var(--brand)",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                      <span className="serif" style={{ fontSize:23,fontWeight:600,letterSpacing:"-0.02em" }}>{result.styleAdvice.recommendedSize}</span>
                    </div>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontSize:11,letterSpacing:"0.09em",textTransform:"uppercase",color:"var(--faint)",marginBottom:4,fontWeight:600 }}>Your size</div>
                      <div style={{ fontSize:14,color:"var(--muted)",lineHeight:1.55 }}>{result.styleAdvice.sizeReason || "Picked for your height & weight."}</div>
                    </div>
                  </div>
                )}

                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,marginBottom:20 }}>
                  <div>
                    <p style={{ fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",color:"var(--faint)",marginBottom:9 }}>Works well</p>
                    {result.styleAdvice.pros.map(p=><div key={p} style={{ fontSize:13,color:"var(--muted)",marginBottom:7,display:"flex",gap:8,alignItems:"flex-start" }}><span style={{ color:"#1a7a2e",marginTop:1 }}>+</span>{p}</div>)}
                  </div>
                  <div>
                    <p style={{ fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",color:"var(--faint)",marginBottom:9 }}>Watch out</p>
                    {result.styleAdvice.cons.map(c=><div key={c} style={{ fontSize:13,color:"var(--muted)",marginBottom:7,display:"flex",gap:8,alignItems:"flex-start" }}><span style={{ color:"#b71c1c",marginTop:1 }}>−</span>{c}</div>)}
                  </div>
                </div>

                <div style={{ padding:"14px 16px",background:"var(--surface)",borderRadius:8,borderLeft:`2px solid ${vc.color}`,fontSize:13,color:"var(--muted)",lineHeight:1.7,marginBottom:22,display:"flex",gap:10 }}>
                  <span style={{ color:"var(--ink)",flexShrink:0,marginTop:1 }}><IconBulb size={16}/></span>
                  {result.styleAdvice.tip}
                </div>

                <div>
                  <p style={{ fontSize:11,letterSpacing:"0.1em",textTransform:"uppercase",color:"var(--faint)",marginBottom:10 }}>Share your look</p>
                  <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
                    <button className="share-btn" onClick={()=>share("instagram")}><IconInstagram size={14}/> Instagram</button>
                    <button className="share-btn" onClick={()=>share("tiktok")}><IconTikTok size={14}/> TikTok</button>
                    <button className="share-btn" onClick={()=>share("whatsapp")}><IconWhatsApp size={14}/> WhatsApp</button>
                    <button className="share-btn" onClick={()=>share("download")}><IconDownload size={15}/> Download</button>
                    <button className="share-btn" onClick={()=>share("copy")}><IconLink size={15}/> Copy link</button>
                  </div>
                </div>

                <button onClick={()=>{ setResult(null); setGarments([]); setError(null); }} className="btn-outline"
                  style={{ width:"100%",padding:"13px",fontSize:14,marginTop:20,borderRadius:8 }}>
                  Start a new look
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
