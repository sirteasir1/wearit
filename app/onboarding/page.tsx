"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getProfile, saveProfile, pullRemote, fileToResizedDataURL, UserProfile } from "@/lib/store";
import { IconCamera, IconArrowRight, IconCheck } from "@/lib/icons";

const GENDERS: { v: UserProfile["gender"]; label: string }[] = [
  { v: "female", label: "Woman" },
  { v: "male",   label: "Man" },
  { v: "other",  label: "Other" },
];

export default function Onboarding() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [user, setUser]   = useState<User | null | "loading">("loading");
  const [wasOnboarded, setWasOnboarded] = useState(false);

  const [photo, setPhoto]   = useState<string | null>(null);
  const [gender, setGender] = useState<UserProfile["gender"]>("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [busy, setBusy]     = useState(false);
  const [err, setErr]       = useState("");

  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u)), []);

  useEffect(() => {
    if (user === null) { router.replace("/signin"); return; }
    if (user && user !== "loading") {
      let cancelled = false;
      (async () => {
        await Promise.race([pullRemote(user.uid), new Promise((r) => setTimeout(r, 4000))]);
        if (cancelled) return;
        const p = getProfile(user.uid);
        setWasOnboarded(p.onboarded);
        if (p.photo)    setPhoto(p.photo);
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

  const onPhoto = async (f: File) => {
    if (!f.type.startsWith("image/")) return;
    setErr("");
    try {
      setPhoto(await fileToResizedDataURL(f, 1000, 0.8));
    } catch {
      setErr("Couldn't read that image. Try another.");
    }
  };

  const finish = async () => {
    if (!photo) { setErr("Add a photo of yourself so we can dress you."); return; }
    setBusy(true);
    saveProfile(user.uid, {
      onboarded: true,
      photo,
      gender,
      heightCm: height ? Math.round(Number(height)) : null,
      weightKg: weight ? Math.round(Number(weight)) : null,
    });
    router.replace(wasOnboarded ? "/profile" : "/app");
  };

  const stepDone = !!photo;

  return (
    <div style={{ minHeight:"100vh",background:"var(--bg)",display:"flex",flexDirection:"column" }}>
      {/* Top bar */}
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"22px 32px" }}>
        <Link href="/" className="brand-lock">
          <img src="/logo-mark.png" alt="Wearit" className="brand-mark" style={{ height:28 }} />
          <span className="brand-word" style={{ fontSize:19, color:"var(--ink)" }}>Wearit</span>
        </Link>
        <span style={{ fontSize:12,color:"var(--faint)",letterSpacing:"0.04em" }}>Step 1 of 1</span>
      </div>

      <div style={{ flex:1,display:"flex",alignItems:"center",justifyContent:"center",padding:"24px" }}>
        <div style={{ width:"100%",maxWidth:880,display:"grid",gridTemplateColumns:"1fr 1fr",gap:56,alignItems:"center" }} className="onboard-grid">

          {/* LEFT — copy + fields */}
          <div className="anim-up">
            <p style={{ fontSize:11,letterSpacing:"0.16em",textTransform:"uppercase",color:"var(--muted)",marginBottom:16,fontWeight:500 }}>Your fit profile</p>
            <h1 className="serif" style={{ fontSize:"clamp(34px,4vw,52px)",fontWeight:300,letterSpacing:"-0.03em",lineHeight:1.05,color:"var(--ink)",marginBottom:16 }}>
              Tell us about<br/><em style={{ fontStyle:"italic" }}>your body</em>
            </h1>
            <p style={{ fontSize:15,color:"var(--muted)",lineHeight:1.75,fontWeight:300,marginBottom:36,maxWidth:380 }}>
              We set this up once. After that you only ever upload the clothes — your photo and measurements stay saved.
            </p>

            {/* Height + Weight */}
            <div style={{ display:"flex",gap:14,marginBottom:24 }}>
              <label style={{ flex:1 }}>
                <span style={{ fontSize:12,fontWeight:500,color:"var(--muted)",display:"block",marginBottom:8 }}>Height</span>
                <div style={{ position:"relative" }}>
                  <input className="input" inputMode="numeric" value={height}
                    onChange={e=>setHeight(e.target.value.replace(/[^0-9]/g,"").slice(0,3))}
                    placeholder="175" style={{ paddingRight:42 }} />
                  <span style={{ position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",fontSize:13,color:"var(--faint)" }}>cm</span>
                </div>
              </label>
              <label style={{ flex:1 }}>
                <span style={{ fontSize:12,fontWeight:500,color:"var(--muted)",display:"block",marginBottom:8 }}>Weight</span>
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
              <span style={{ fontSize:12,fontWeight:500,color:"var(--muted)",display:"block",marginBottom:8 }}>I usually shop</span>
              <div style={{ display:"flex",gap:8 }}>
                {GENDERS.map(g => (
                  <button key={g.v} onClick={()=>setGender(g.v)} style={{
                    flex:1,padding:"11px 0",borderRadius:6,fontSize:13,cursor:"pointer",fontFamily:"'Hanken Grotesk',sans-serif",
                    transition:"all .15s",
                    background: gender===g.v ? "var(--ink)" : "#fff",
                    color:      gender===g.v ? "#fff" : "var(--muted)",
                    border:     gender===g.v ? "1px solid var(--ink)" : "1px solid var(--border)",
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
              {busy ? "Saving…" : (wasOnboarded ? "Save changes" : "Start trying on")}
              <span className="btn-cta-arrows"><span><IconArrowRight size={16}/><IconArrowRight size={16}/></span></span>
            </button>
            <p style={{ textAlign:"center",fontSize:12,color:"var(--faint)",marginTop:14 }}>Private to you · used only to render your try-ons</p>
          </div>

          {/* RIGHT — photo upload */}
          <div className="anim-up-1">
            <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }}
              onChange={e=>{ const f=e.target.files?.[0]; if(f) onPhoto(f); }} />
            <div
              onClick={()=>fileRef.current?.click()}
              className="upload-zone"
              style={{ aspectRatio:"3/4",display:"flex",alignItems:"center",justifyContent:"center",position:"relative" }}
            >
              {photo ? (
                <>
                  <img src={photo} alt="You" style={{ position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover" }} />
                  <div style={{ position:"absolute",top:12,left:12,display:"flex",alignItems:"center",gap:6,background:"rgba(255,255,255,0.92)",backdropFilter:"blur(8px)",padding:"5px 11px",borderRadius:100,fontSize:12,color:"#1a7a2e",fontWeight:500 }}>
                    <IconCheck size={13}/> Photo added
                  </div>
                  <button onClick={(e)=>{e.stopPropagation();fileRef.current?.click();}}
                    style={{ position:"absolute",bottom:12,right:12,background:"rgba(255,255,255,0.92)",border:"1px solid var(--border)",borderRadius:6,fontSize:12,padding:"7px 14px",cursor:"pointer",backdropFilter:"blur(8px)",color:"var(--ink)" }}>
                    Change
                  </button>
                </>
              ) : (
                <div style={{ textAlign:"center",padding:32,pointerEvents:"none",color:"var(--muted)" }}>
                  <div style={{ display:"inline-flex",color:"var(--faint)",marginBottom:14 }}><IconCamera size={34}/></div>
                  <p style={{ fontSize:14,color:"var(--ink)",fontWeight:500,marginBottom:6 }}>Add a full-length photo</p>
                  <p style={{ fontSize:13,lineHeight:1.6,fontWeight:300 }}>Stand straight, good light, plain background works best.<br/><span style={{ fontSize:11,color:"var(--faint)" }}>JPG · PNG · WebP</span></p>
                </div>
              )}
            </div>
            <p style={{ fontSize:12,color:"var(--faint)",marginTop:14,lineHeight:1.6,textAlign:"center" }}>
              {stepDone ? "Looking good. You can change this any time in your profile." : "This becomes your model for every try-on."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
