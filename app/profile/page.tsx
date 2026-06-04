"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged, signOut, updateProfile, User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import AppShell from "@/lib/app-shell";
import {
  getProfile, getWardrobe, getTryOns, getSettings, saveSettings,
  FREE_MONTHLY, UserProfile, UserSettings, defaultSettings,
} from "@/lib/store";
import { IconArrowRight, IconCheck } from "@/lib/icons";
import { toast } from "@/lib/toast";

export default function Profile() {
  const [user, setUser]         = useState<User | null>(null);
  const [editing, setEditing]   = useState(false);
  const [name, setName]         = useState("");
  const [profile, setProfile]   = useState<UserProfile | null>(null);
  const [stats, setStats]       = useState({ wardrobe: 0, tryons: 0, favorites: 0, left: FREE_MONTHLY });
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);

  useEffect(() => onAuthStateChanged(auth, (u) => {
    if (!u) return;
    setUser(u);
    setName(u.displayName || u.email?.split("@")[0] || "User");
    const p  = getProfile(u.uid);
    const wd = getWardrobe(u.uid);
    const t  = getTryOns(u.uid);
    setProfile(p);
    setSettings(getSettings(u.uid));
    setStats({
      wardrobe: wd.length,
      tryons: t,
      favorites: wd.filter(i => i.fav).length,
      left: Math.max(0, FREE_MONTHLY - t),
    });
  }), []);

  const saveName = async () => {
    if (user && name.trim()) await updateProfile(user, { displayName: name.trim() });
    setEditing(false);
    toast("Name updated", "success");
  };

  const toggleSetting = (k: keyof UserSettings) => {
    setSettings(prev => {
      const next = { ...prev, [k]: !prev[k] };
      if (user) saveSettings(user.uid, next);
      return next;
    });
  };

  const checklist = [
    { label: "Profile photo", done: !!profile?.photo },
    { label: "Height",        done: !!profile?.heightCm },
    { label: "Weight",        done: !!profile?.weightKg },
    { label: "Style preset",  done: !!profile?.gender },
  ];
  const checkDone = checklist.filter(c => c.done).length;

  const memberSince = user?.metadata?.creationTime
    ? new Date(user.metadata.creationTime).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "—";

  const initials = name.slice(0, 1).toUpperCase();

  const statCards = [
    { val: stats.tryons,    label: "Try-ons done",      accent: false },
    { val: stats.wardrobe,  label: "Items in wardrobe", accent: false },
    { val: stats.favorites, label: "Favorites saved",   accent: false },
    { val: stats.left,      label: "Credits left",      accent: true  },
  ];

  const physical = [
    { label: "Height", val: profile?.heightCm ? `${profile.heightCm} cm` : "—" },
    { label: "Weight", val: profile?.weightKg ? `${profile.weightKg} kg` : "—" },
    { label: "Shops",  val: profile?.gender ? ({female:"Womenswear",male:"Menswear",other:"All"} as Record<string,string>)[profile.gender] : "—" },
  ];

  return (
    <AppShell>
      <div className="page-in" style={{ padding:"48px 44px",maxWidth:880 }}>
        <p style={{ fontSize:11,letterSpacing:"0.15em",textTransform:"uppercase",color:"var(--muted)",marginBottom:14,fontWeight:600 }}>Account</p>
        <h1 className="serif" style={{ fontSize:46,fontWeight:600,letterSpacing:"-0.035em",color:"var(--ink)",marginBottom:32 }}>My profile</h1>

        {/* Identity card */}
        <div className="card" style={{ padding:"34px 32px",marginBottom:14,display:"flex",alignItems:"center",gap:26,position:"relative",overflow:"hidden" }}>
          <div aria-hidden style={{ position:"absolute",inset:0,background:"radial-gradient(130% 150% at 0% 0%, var(--sand), transparent 58%)",opacity:0.6,pointerEvents:"none" }}/>
          <div className="avatar" style={{ width:90,height:90,fontSize:32,overflow:"hidden",position:"relative",zIndex:1,boxShadow:"0 0 0 5px var(--card), 0 0 0 6px var(--border)" }}>
            {profile?.photo
              ? <img src={profile.photo} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }}/>
              : initials}
          </div>
          <div style={{ flex:1,minWidth:0,position:"relative",zIndex:1 }}>
            {editing ? (
              <div style={{ display:"flex",gap:10,alignItems:"center" }}>
                <input className="input" value={name} onChange={e=>setName(e.target.value)} style={{ maxWidth:240 }}/>
                <button className="btn-dark" onClick={saveName} style={{ padding:"10px 20px",fontSize:13 }}>Save</button>
              </div>
            ) : (
              <div style={{ display:"flex",alignItems:"center",gap:12 }}>
                <h2 className="serif" style={{ fontSize:28,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.025em" }}>{name}</h2>
                <button onClick={()=>setEditing(true)} style={{ fontSize:12,color:"var(--muted)",background:"none",border:"none",cursor:"pointer",padding:0,textDecoration:"underline",textUnderlineOffset:3 }}>Edit</button>
              </div>
            )}
            <div style={{ display:"flex",alignItems:"center",gap:10,marginTop:12,flexWrap:"wrap" }}>
              <span style={{ fontSize:12,fontWeight:600,letterSpacing:"0.04em",color:"var(--gold)",background:"rgba(176,138,62,0.1)",border:"1px solid rgba(176,138,62,0.3)",padding:"4px 11px",borderRadius:100 }}>FREE PLAN</span>
              <span style={{ fontSize:13,color:"var(--muted)" }}>Member since {memberSince}</span>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:14 }} className="profile-stats">
          {statCards.map(s => (
            <div key={s.label} className="card" style={{
              padding:"24px 18px 22px",textAlign:"center",
              ...(s.accent ? { background:"linear-gradient(180deg, var(--brand-soft), var(--card))", borderColor:"var(--brand-ring)" } : {}),
            }}>
              {s.accent ? (
                <div style={{ position:"relative",width:78,height:78,margin:"0 auto 8px" }}>
                  <svg className="ring-svg" width="78" height="78" viewBox="0 0 78 78">
                    <circle className="ring-track" cx="39" cy="39" r="32" strokeWidth="6"/>
                    <circle className="ring-fill" cx="39" cy="39" r="32" strokeWidth="6"
                      strokeDasharray={2*Math.PI*32}
                      strokeDashoffset={2*Math.PI*32*(1 - Math.min(1, s.val/FREE_MONTHLY))}/>
                  </svg>
                  <div style={{ position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center" }}>
                    <span className="serif" style={{ fontSize:28,fontWeight:600,color:"var(--brand)",letterSpacing:"-0.03em" }}>{s.val}</span>
                  </div>
                </div>
              ) : (
                <div className="serif" style={{ fontSize:44,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.04em",lineHeight:1,marginBottom:8 }}>{s.val}</div>
              )}
              <div style={{ fontSize:12,color:"var(--muted)",lineHeight:1.4 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Complete-your-profile checklist (only while incomplete) */}
        {checkDone < checklist.length && (
          <div className="card" style={{ padding:"24px 28px",marginBottom:14 }}>
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,marginBottom:16 }}>
              <div>
                <p className="serif" style={{ fontSize:18,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.02em" }}>Finish your profile</p>
                <p style={{ fontSize:13,color:"var(--muted)",marginTop:3,fontWeight:300 }}>{checkDone} of {checklist.length} done — better fits & sizing</p>
              </div>
              <Link href="/onboarding" className="btn-dark" style={{ padding:"9px 18px",fontSize:13,gap:6 }}>Complete <IconArrowRight size={14}/></Link>
            </div>
            <div style={{ height:6,borderRadius:100,background:"var(--border)",overflow:"hidden",marginBottom:16 }}>
              <div style={{ height:"100%",width:`${(checkDone/checklist.length)*100}%`,background:"var(--brand)",borderRadius:100,transition:"width 0.6s cubic-bezier(0.22,1,0.36,1)" }}/>
            </div>
            <div style={{ display:"flex",gap:10,flexWrap:"wrap" }}>
              {checklist.map(c => (
                <div key={c.label} style={{ display:"flex",alignItems:"center",gap:7,fontSize:13,color:c.done?"var(--ink)":"var(--muted)" }}>
                  <span style={{ width:18,height:18,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:c.done?"var(--brand)":"transparent",border:c.done?"none":"1px solid var(--border)",color:"#fff" }}>
                    {c.done && <IconCheck size={11}/>}
                  </span>
                  {c.label}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fit profile */}
        <div className="card" style={{ marginBottom:14,overflow:"hidden" }}>
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"26px 30px 22px" }}>
            <div>
              <p className="serif" style={{ fontSize:19,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.02em" }}>Fit profile</p>
              <p style={{ fontSize:13,color:"var(--muted)",marginTop:4,fontWeight:300 }}>Renders every try-on — and personalizes your size</p>
            </div>
            <Link href="/onboarding" style={{ fontSize:13,color:"var(--ink)",textDecoration:"none",display:"flex",alignItems:"center",gap:6,border:"1px solid var(--border)",padding:"9px 15px",borderRadius:6 }}>
              Edit <IconArrowRight size={14}/>
            </Link>
          </div>
          <div style={{ display:"flex",borderTop:"1px solid var(--border)" }}>
            {profile?.photo && (
              <img src={profile.photo} alt="You" style={{ width:128,aspectRatio:"3/4",objectFit:"cover",borderRight:"1px solid var(--border)",flexShrink:0 }}/>
            )}
            <div style={{ flex:1,display:"grid",gridTemplateColumns:"repeat(3,1fr)" }}>
              {physical.map((p,i) => (
                <div key={p.label} style={{ padding:"22px 22px",borderLeft:i>0?"1px solid var(--border)":undefined,display:"flex",flexDirection:"column",justifyContent:"center" }}>
                  <div style={{ fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",color:"var(--faint)",marginBottom:8,fontWeight:600 }}>{p.label}</div>
                  <div className="serif" style={{ fontSize:24,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.02em" }}>{p.val}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Plan */}
        <div style={{ background:"var(--ink)",borderRadius:16,padding:"30px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between",gap:20,flexWrap:"wrap" }}>
          <div>
            <p style={{ fontSize:11,color:"rgba(255,255,255,0.35)",letterSpacing:"0.1em",marginBottom:8,fontWeight:500 }}>CURRENT PLAN</p>
            <p style={{ fontSize:22,fontWeight:500,color:"#fff",marginBottom:4 }}>Free</p>
            <p style={{ fontSize:14,color:"rgba(255,255,255,0.45)",fontWeight:300 }}>{FREE_MONTHLY} credits · {stats.left} left · 1 credit = 1 try-on</p>
          </div>
          <Link href="/#pricing" style={{ background:"#fff",color:"var(--ink)",borderRadius:4,padding:"12px 26px",fontSize:14,fontWeight:500,textDecoration:"none",display:"flex",alignItems:"center",gap:8 }}>
            Upgrade to Pro <IconArrowRight size={15}/>
          </Link>
        </div>

        {/* Settings */}
        <div className="card" style={{ overflow:"hidden" }}>
          {([
            { k:"notifications" as const, label:"Email notifications", sub:"Updates and styling tips" },
            { k:"improveAI" as const,     label:"Improve try-on quality", sub:"Allow anonymized model training" },
            { k:"publicProfile" as const, label:"Public profile", sub:"Let others see your looks" },
          ]).map((s,i,arr) => (
            <div key={s.label} style={{ padding:"18px 24px",borderBottom:i<arr.length-1?"1px solid var(--border)":undefined,display:"flex",alignItems:"center",justifyContent:"space-between" }}>
              <div>
                <p style={{ fontSize:14,fontWeight:500,color:"var(--ink)" }}>{s.label}</p>
                <p style={{ fontSize:12,color:"var(--muted)",marginTop:2 }}>{s.sub}</p>
              </div>
              <Toggle on={settings[s.k]} onChange={()=>toggleSetting(s.k)}/>
            </div>
          ))}
        </div>

        <button
          onClick={async()=>{ await signOut(auth); window.location.href="/"; }}
          style={{ marginTop:24,fontSize:14,color:"var(--muted)",background:"none",border:"none",cursor:"pointer",padding:0 }}>
          Sign out
        </button>
      </div>
    </AppShell>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange} role="switch" aria-checked={on} style={{ width:44,height:24,borderRadius:100,background:on?"var(--brand)":"rgba(26,22,17,0.14)",border:"none",cursor:"pointer",position:"relative",transition:"background 0.25s",flexShrink:0 }}>
      <div style={{ position:"absolute",top:3,left:on?23:3,width:18,height:18,borderRadius:"50%",background:"#fff",transition:"left 0.25s cubic-bezier(0.22,1,0.36,1)",boxShadow:"0 1px 4px rgba(0,0,0,0.2)" }}/>
    </button>
  );
}
