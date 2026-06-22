"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getProfile, saveProfile, pullRemote, fileToResizedDataURL, dataURLToThumb, UserProfile } from "@/lib/store";
import { pickTemplateModel } from "@/lib/template-models";
import { track } from "@/lib/posthog";
import { toast } from "@/lib/toast";
import { IconCamera, IconArrowRight, IconCheck, IconUpload, IconWand } from "@/lib/icons";
import { useI18n, LangSwitch } from "@/lib/i18n";
import CameraCapture from "@/components/CameraCapture";

export default function Onboarding() {
  const { t } = useI18n();
  const GENDERS: { v: UserProfile["gender"]; label: string }[] = [
    { v: "female", label: t.onboarding.genderWoman },
    { v: "male",   label: t.onboarding.genderMan },
    { v: "other",  label: t.onboarding.genderOther },
  ];
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [user, setUser]   = useState<User | null | "loading">("loading");
  const [wasOnboarded, setWasOnboarded] = useState(false);

  const [photo, setPhoto]   = useState<string | null>(null); // the user's OWN photo (or generated body)
  const [gender, setGender] = useState<UserProfile["gender"]>("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [busy, setBusy]     = useState(false);
  const [err, setErr]       = useState("");
  const [cam, setCam]       = useState<null | "direct" | "avatar">(null);
  const [avatarBusy, setAvatarBusy] = useState(false);

  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u)), []);

  useEffect(() => {
    if (user === null) { router.replace("/signin"); return; }
    if (user && user !== "loading" && !user.emailVerified) { router.replace("/verify-email"); return; }
    if (user && user !== "loading") {
      let cancelled = false;
      (async () => {
        await Promise.race([pullRemote(user.uid), new Promise((r) => setTimeout(r, 4000))]);
        if (cancelled) return;
        const p = getProfile(user.uid);
        setWasOnboarded(p.onboarded);
        // Only restore a previously saved OWN photo — a template stand-in is
        // recomputed live from the measurements below.
        if (p.photo && !p.photoIsTemplate) setPhoto(p.photo);
        if (p.gender)   setGender(p.gender);
        if (p.heightCm) setHeight(String(p.heightCm));
        if (p.weightKg) setWeight(String(p.weightKg));
      })();
      return () => { cancelled = true; };
    }
  }, [user, router]);

  if (user === "loading" || user === null) {
    return (
      <div style={{ display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"var(--bg)" }}>
        <div className="spinner-dark" style={{ width:24,height:24 }} />
      </div>
    );
  }

  const heightNum = height ? Number(height) : null;
  const weightNum = weight ? Number(weight) : null;
  const templateSrc = pickTemplateModel(gender, heightNum, weightNum);
  const modelSrc = photo ?? templateSrc;   // what we render in the preview
  const isTemplate = !photo;               // true while showing the stand-in

  const onUpload = async (f: File) => {
    if (!f.type.startsWith("image/")) return;
    setErr("");
    try {
      setPhoto(await fileToResizedDataURL(f, 880, 0.72));
    } catch {
      setErr(t.onboarding.errReadImage);
    }
  };

  const onCameraShot = async (dataUrl: string) => {
    const mode = cam;
    setCam(null);
    if (mode === "avatar") { await runAvatar(dataUrl); return; }
    setErr("");
    setPhoto(dataUrl); // already a downsized JPEG from the capture
  };

  const runAvatar = async (selfie: string) => {
    setErr("");
    setAvatarBusy(true);
    try {
      const token = await (user as User).getIdToken();
      const res = await fetch("/api/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ selfie, heightCm: heightNum, weightKg: weightNum, gender }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.image) throw new Error(d.error || "failed");
      setPhoto(await dataURLToThumb(d.image, 880, 0.82));
      toast(t.onboarding.yourPhoto, "success");
    } catch {
      setErr(t.onboarding.avatarFailed);
    } finally {
      setAvatarBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    const usingOwn = !!photo;
    saveProfile(user.uid, {
      onboarded: true,
      photo: usingOwn ? photo : templateSrc,
      photoIsTemplate: !usingOwn,
      gender,
      heightCm: heightNum ? Math.round(heightNum) : null,
      weightKg: weightNum ? Math.round(weightNum) : null,
    });
    if (!wasOnboarded) track("onboarding_completed", { gender, hasMeasurements: !!(height && weight), usedTemplate: !usingOwn });
    router.replace(wasOnboarded ? "/profile" : "/app");
  };

  return (
    <div style={{ minHeight:"100vh",background:"var(--bg)",display:"flex",flexDirection:"column" }}>
      {/* Top bar */}
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"22px 32px" }}>
        <Link href="/" className="brand-lock">
          <img src="/logo-mark.png" alt="Wearit" className="brand-mark" style={{ height:28 }} />
          <span className="brand-word" style={{ fontSize:19, color:"var(--ink)" }}>Wearit</span>
        </Link>
        <div style={{ display:"flex",alignItems:"center",gap:14 }}>
          <LangSwitch />
          <span style={{ fontSize:12,color:"var(--faint)",letterSpacing:"0.04em" }}>{t.onboarding.step}</span>
        </div>
      </div>

      <div style={{ flex:1,display:"flex",alignItems:"center",justifyContent:"center",padding:"24px" }}>
        <div style={{ width:"100%",maxWidth:880,display:"grid",gridTemplateColumns:"1fr 1fr",gap:56,alignItems:"center" }} className="onboard-grid">

          {/* LEFT — copy + fields */}
          <div className="anim-up">
            <p style={{ fontSize:11,letterSpacing:"0.16em",textTransform:"uppercase",color:"var(--muted)",marginBottom:16,fontWeight:500 }}>{t.onboarding.eyebrow}</p>
            <h1 className="serif" style={{ fontSize:"clamp(34px,4vw,52px)",fontWeight:300,letterSpacing:"-0.03em",lineHeight:1.05,color:"var(--ink)",marginBottom:16 }}>
              {t.onboarding.titleA}<br/><em style={{ fontStyle:"italic" }}>{t.onboarding.titleB}</em>
            </h1>
            <p style={{ fontSize:15,color:"var(--muted)",lineHeight:1.75,fontWeight:300,marginBottom:36,maxWidth:380 }}>
              {t.onboarding.intro}
            </p>

            {/* Height + Weight */}
            <div style={{ display:"flex",gap:14,marginBottom:24 }}>
              <label style={{ flex:1 }}>
                <span style={{ fontSize:12,fontWeight:500,color:"var(--muted)",display:"block",marginBottom:8 }}>{t.onboarding.height}</span>
                <div style={{ position:"relative" }}>
                  <input className="input" inputMode="numeric" value={height}
                    onChange={e=>setHeight(e.target.value.replace(/[^0-9]/g,"").slice(0,3))}
                    placeholder="175" style={{ paddingRight:42 }} />
                  <span style={{ position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",fontSize:13,color:"var(--faint)" }}>cm</span>
                </div>
              </label>
              <label style={{ flex:1 }}>
                <span style={{ fontSize:12,fontWeight:500,color:"var(--muted)",display:"block",marginBottom:8 }}>{t.onboarding.weight}</span>
                <div style={{ position:"relative" }}>
                  <input className="input" inputMode="numeric" value={weight}
                    onChange={e=>setWeight(e.target.value.replace(/[^0-9]/g,"").slice(0,3))}
                    placeholder="68" style={{ paddingRight:42 }} />
                  <span style={{ position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",fontSize:13,color:"var(--faint)" }}>kg</span>
                </div>
              </label>
            </div>

            {/* Gender */}
            <div style={{ marginBottom:32 }}>
              <span style={{ fontSize:12,fontWeight:500,color:"var(--muted)",display:"block",marginBottom:8 }}>{t.onboarding.iShop}</span>
              <div style={{ display:"flex",gap:8 }}>
                {GENDERS.map(g => (
                  <button key={g.v} onClick={()=>setGender(g.v)} style={{
                    flex:1,padding:"11px 0",borderRadius:6,fontSize:13,cursor:"pointer",fontFamily:"'Hanken Grotesk',sans-serif",
                    transition:"all .15s",
                    background: gender===g.v ? "var(--brand)" : "#fff",
                    color:      gender===g.v ? "#fff" : "var(--muted)",
                    border:     gender===g.v ? "1px solid var(--brand)" : "1px solid var(--border)",
                    fontWeight: gender===g.v ? 500 : 400,
                  }}>{g.label}</button>
                ))}
              </div>
            </div>

            {err && (
              <div style={{ marginBottom:18,padding:"10px 14px",borderRadius:8,background:"#fdecea",border:"1px solid #f5c6c2",color:"#b71c1c",fontSize:13 }}>
                {err}
              </div>
            )}

            <button className="btn-cta" onClick={finish} disabled={busy} style={{ width:"100%",justifyContent:"center" }}>
              {busy ? t.onboarding.saving : (wasOnboarded ? t.onboarding.saveChanges : t.onboarding.startTryingOn)}
              <span className="btn-cta-arrows"><span><IconArrowRight size={16}/><IconArrowRight size={16}/></span></span>
            </button>
            <p style={{ textAlign:"center",fontSize:12,color:"var(--faint)",marginTop:14 }}>{t.onboarding.privateNote}</p>
          </div>

          {/* RIGHT — model preview (template stand-in until they add their own) */}
          <div className="anim-up-1">
            <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }}
              onChange={e=>{ const f=e.target.files?.[0]; if(f) onUpload(f); e.target.value=""; }} />

            <div className="upload-zone" style={{ aspectRatio:"3/4",position:"relative",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center" }}>
              <img src={modelSrc} alt="Your model" style={{ position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover" }} />

              {/* Badge */}
              <div style={{ position:"absolute",top:12,left:12,display:"flex",alignItems:"center",gap:6,background:"rgba(255,255,255,0.92)",backdropFilter:"blur(8px)",padding:"5px 11px",borderRadius:100,fontSize:12,fontWeight:500,
                color: isTemplate ? "var(--muted)" : "#1a7a2e" }}>
                {isTemplate ? <>{t.onboarding.usingTemplate}</> : <><IconCheck size={13}/> {t.onboarding.yourPhoto}</>}
              </div>

              {/* Replace control when showing the user's own photo */}
              {!isTemplate && (
                <button onClick={()=>fileRef.current?.click()}
                  style={{ position:"absolute",bottom:12,right:12,background:"rgba(255,255,255,0.92)",border:"1px solid var(--border)",borderRadius:6,fontSize:12,padding:"7px 14px",cursor:"pointer",backdropFilter:"blur(8px)",color:"var(--ink)" }}>
                  {t.onboarding.change}
                </button>
              )}

              {avatarBusy && (
                <div style={{ position:"absolute",inset:0,background:"rgba(255,255,255,0.78)",backdropFilter:"blur(2px)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12 }}>
                  <div className="spinner-dark" style={{ width:26,height:26 }} />
                  <p style={{ fontSize:13,color:"var(--ink)",fontWeight:500 }}>{t.onboarding.generatingAvatar}</p>
                </div>
              )}
            </div>

            {isTemplate ? (
              <>
                <p style={{ fontSize:12,color:"var(--faint)",margin:"12px 2px 14px",lineHeight:1.6 }}>{t.onboarding.templateNote}</p>
                <div style={{ display:"flex",gap:10 }}>
                  <button type="button" onClick={()=>fileRef.current?.click()} disabled={avatarBusy}
                    style={btnSecondary}>
                    <IconUpload size={17}/> {t.onboarding.upload}
                  </button>
                  <button type="button" onClick={()=>setCam("direct")} disabled={avatarBusy}
                    style={btnSecondary}>
                    <IconCamera size={17}/> {t.onboarding.useCamera}
                  </button>
                </div>
                <button type="button" onClick={()=>setCam("avatar")} disabled={avatarBusy}
                  style={{ width:"100%",marginTop:10,padding:"12px",borderRadius:10,border:"1px dashed var(--border)",background:"transparent",color:"var(--muted)",fontSize:13,fontFamily:"'Hanken Grotesk',sans-serif",cursor:avatarBusy?"default":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8 }}>
                  <IconWand size={16}/> {t.onboarding.avatarFromSelfie}
                </button>
              </>
            ) : (
              <p style={{ fontSize:12,color:"var(--faint)",marginTop:14,lineHeight:1.6,textAlign:"center" }}>
                {t.onboarding.lookingGood}
              </p>
            )}
          </div>
        </div>
      </div>

      {cam && (
        <CameraCapture
          onCapture={onCameraShot}
          onClose={()=>setCam(null)}
          onPickFile={()=>fileRef.current?.click()}
        />
      )}
    </div>
  );
}

const btnSecondary: React.CSSProperties = {
  flex:1,padding:"13px",borderRadius:10,border:"1px solid var(--border)",background:"var(--card)",
  color:"var(--ink)",fontSize:14,fontWeight:500,fontFamily:"'Hanken Grotesk',sans-serif",cursor:"pointer",
  display:"flex",alignItems:"center",justifyContent:"center",gap:9,
};
