"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged, signOut, updateProfile, User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import AppShell from "@/lib/app-shell";
import {
  getProfile, getWardrobe, getTryOns, getSettings, saveSettings,
  getPlan, creditsRemaining, creditTotal, getReferralCount, REFERRAL_MILESTONE,
  FREE_MONTHLY, PRO_MONTHLY, Plan, UserProfile, UserSettings, defaultSettings,
} from "@/lib/store";

const PRO_PRODUCT    = process.env.NEXT_PUBLIC_POLAR_PRO_PRODUCT_ID;
const WEEKLY_PRODUCT = process.env.NEXT_PUBLIC_POLAR_WEEKLY_PRODUCT_ID;
const coHref = (product: string | undefined, uid: string, email: string | null) =>
  product ? `/api/checkout?products=${product}&customerExternalId=${uid}&customerEmail=${encodeURIComponent(email || "")}` : "/#pricing";
import { IconArrowRight, IconCheck, IconLink, IconShare } from "@/lib/icons";
import { toast } from "@/lib/toast";
import { track } from "@/lib/posthog";
import { useI18n } from "@/lib/i18n";

export default function Profile() {
  const { t } = useI18n();
  const [user, setUser]         = useState<User | null>(null);
  const [editing, setEditing]   = useState(false);
  const [name, setName]         = useState("");
  const [profile, setProfile]   = useState<UserProfile | null>(null);
  const [stats, setStats]       = useState({ wardrobe: 0, tryons: 0, favorites: 0, left: FREE_MONTHLY, total: FREE_MONTHLY });
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [plan, setPlan]         = useState<Plan>("free");
  const [showPro, setShowPro]   = useState(false);

  useEffect(() => onAuthStateChanged(auth, (u) => {
    if (!u) return;
    setUser(u);
    setName(u.displayName || u.email?.split("@")[0] || t.common.user);
    const p  = getProfile(u.uid);
    const wd = getWardrobe(u.uid);
    const tn = getTryOns(u.uid);
    setProfile(p);
    setSettings(getSettings(u.uid));
    setPlan(getPlan(u.uid));
    setStats({
      wardrobe: wd.length,
      tryons: tn,
      favorites: wd.filter(i => i.fav).length,
      left: creditsRemaining(u.uid),
      total: creditTotal(u.uid),
    });
  }), []);

  const saveName = async () => {
    if (user && name.trim()) await updateProfile(user, { displayName: name.trim() });
    setEditing(false);
    toast(t.profile.nameUpdated, "success");
  };

  const toggleSetting = (k: keyof UserSettings) => {
    setSettings(prev => {
      const next = { ...prev, [k]: !prev[k] };
      if (user) saveSettings(user.uid, next);
      return next;
    });
  };

  const checklist = [
    { label: t.profile.checkPhoto,  done: !!profile?.photo },
    { label: t.profile.checkHeight, done: !!profile?.heightCm },
    { label: t.profile.checkWeight, done: !!profile?.weightKg },
    { label: t.profile.checkPreset, done: !!profile?.gender },
  ];
  const checkDone = checklist.filter(c => c.done).length;

  const memberSince = user?.metadata?.creationTime
    ? new Date(user.metadata.creationTime).toLocaleDateString(t.profile.dateLocale, { month: "long", year: "numeric" })
    : t.profile.memberSinceDash;

  const initials = name.slice(0, 1).toUpperCase();

  const statCards = [
    { val: stats.tryons,    label: t.profile.statTryons,    accent: false },
    { val: stats.wardrobe,  label: t.profile.statWardrobe,  accent: false },
    { val: stats.favorites, label: t.profile.statFavorites, accent: false },
    { val: stats.left,      label: t.profile.statCredits,   accent: true  },
  ];

  const physical = [
    { label: t.profile.pHeight, val: profile?.heightCm ? `${profile.heightCm} cm` : t.profile.memberSinceDash },
    { label: t.profile.pWeight, val: profile?.weightKg ? `${profile.weightKg} kg` : t.profile.memberSinceDash },
    { label: t.profile.pShops,  val: profile?.gender ? ({female:t.profile.womenswear,male:t.profile.menswear,other:t.profile.allShops} as Record<string,string>)[profile.gender] : t.profile.memberSinceDash },
  ];

  return (
    <AppShell>
      <div className="page-in" style={{ padding:"48px 44px",maxWidth:880 }}>
        <p style={{ fontSize:11,letterSpacing:"0.15em",textTransform:"uppercase",color:"var(--muted)",marginBottom:14,fontWeight:600 }}>{t.profile.eyebrow}</p>
        <h1 className="serif" style={{ fontSize:46,fontWeight:600,letterSpacing:"-0.035em",color:"var(--ink)",marginBottom:32 }}>{t.profile.title}</h1>

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
                <button className="btn-dark" onClick={saveName} style={{ padding:"10px 20px",fontSize:13 }}>{t.profile.save}</button>
              </div>
            ) : (
              <div style={{ display:"flex",alignItems:"center",gap:12 }}>
                <h2 className="serif" style={{ fontSize:28,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.025em" }}>{name}</h2>
                <button onClick={()=>setEditing(true)} style={{ fontSize:12,color:"var(--muted)",background:"none",border:"none",cursor:"pointer",padding:0,textDecoration:"underline",textUnderlineOffset:3 }}>{t.profile.edit}</button>
              </div>
            )}
            <div style={{ display:"flex",alignItems:"center",gap:10,marginTop:12,flexWrap:"wrap" }}>
              <span style={{ fontSize:12,fontWeight:600,letterSpacing:"0.04em",color:"var(--gold)",background:"rgba(176,138,62,0.1)",border:"1px solid rgba(176,138,62,0.3)",padding:"4px 11px",borderRadius:100 }}>{plan === "pro" ? t.profile.proPlanBadge : plan === "weekly" ? t.profile.weeklyPlanBadge : plan === "trial" ? t.profile.trialPlanBadge : t.profile.freePlanBadge}</span>
              <span style={{ fontSize:13,color:"var(--muted)" }}>{t.profile.memberSince(memberSince)}</span>
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
                      strokeDashoffset={2*Math.PI*32*(1 - Math.min(1, s.val/Math.max(1, stats.total)))}/>
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
                <p className="serif" style={{ fontSize:18,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.02em" }}>{t.profile.finishProfile}</p>
                <p style={{ fontSize:13,color:"var(--muted)",marginTop:3,fontWeight:300 }}>{t.profile.finishProgress(checkDone, checklist.length)}</p>
              </div>
              <Link href="/onboarding" className="btn-dark" style={{ padding:"9px 18px",fontSize:13,gap:6 }}>{t.profile.complete} <IconArrowRight size={14}/></Link>
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
              <p className="serif" style={{ fontSize:19,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.02em" }}>{t.profile.fitProfile}</p>
              <p style={{ fontSize:13,color:"var(--muted)",marginTop:4,fontWeight:300 }}>{t.profile.fitProfileDesc}</p>
            </div>
            <Link href="/onboarding" style={{ fontSize:13,color:"var(--ink)",textDecoration:"none",display:"flex",alignItems:"center",gap:6,border:"1px solid var(--border)",padding:"9px 15px",borderRadius:6 }}>
              {t.profile.edit2} <IconArrowRight size={14}/>
            </Link>
          </div>
          <div className="fit-row" style={{ display:"flex",borderTop:"1px solid var(--border)" }}>
            {profile?.photo && (
              <img className="fit-photo" src={profile.photo} alt="You" style={{ width:128,aspectRatio:"3/4",objectFit:"cover",borderRight:"1px solid var(--border)",flexShrink:0 }}/>
            )}
            <div className="fit-stats" style={{ flex:1,display:"grid",gridTemplateColumns:"repeat(3,1fr)" }}>
              {physical.map((p,i) => (
                <div key={p.label} className="fit-cell" style={{ padding:"22px 22px",borderLeft:i>0?"1px solid var(--border)":undefined,display:"flex",flexDirection:"column",justifyContent:"center" }}>
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
            <p style={{ fontSize:11,color:"rgba(255,255,255,0.35)",letterSpacing:"0.1em",marginBottom:8,fontWeight:500 }}>{t.profile.currentPlan}</p>
            <p style={{ fontSize:22,fontWeight:500,color:"#fff",marginBottom:4 }}>{plan === "pro" ? t.profile.pro : plan === "weekly" ? t.profile.weekly : plan === "trial" ? t.profile.trial : t.profile.free}</p>
            <p style={{ fontSize:14,color:"rgba(255,255,255,0.45)",fontWeight:300 }}>{t.profile.planSummary(stats.total, stats.left)}</p>
          </div>
          {plan === "pro" ? (
            <span style={{ display:"inline-flex",alignItems:"center",gap:8,background:"rgba(176,138,62,0.18)",color:"#FFD9A8",border:"1px solid rgba(176,138,62,0.4)",borderRadius:100,padding:"10px 20px",fontSize:13,fontWeight:600,letterSpacing:"0.04em" }}>
              {t.profile.proActive}
            </span>
          ) : (
            <button
              onClick={()=>setShowPro(true)}
              style={{ background:"#fff",color:"var(--ink)",borderRadius:4,padding:"12px 26px",fontSize:14,fontWeight:500,border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:8,fontFamily:"'Hanken Grotesk',sans-serif" }}>
              {t.profile.seePro} <IconArrowRight size={15}/>
            </button>
          )}
        </div>

        {/* Invite friends — referral loop (give 3, get 3) */}
        {user && (() => {
          const link = `${typeof window !== "undefined" ? window.location.origin : ""}/signup?ref=${user.uid}`;
          const invited = getReferralCount(user.uid);
          const toGo = REFERRAL_MILESTONE - (invited % REFERRAL_MILESTONE);
          const copy = async () => {
            try { await navigator.clipboard.writeText(link); toast(t.profile.inviteCopied, "success"); }
            catch { toast(t.profile.inviteCopyFailed, "error"); }
          };
          const share = async () => {
            const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
            if (nav.share) { try { await nav.share({ title: "Wearit", text: t.profile.inviteShareMessage, url: link }); return; } catch { /* cancelled */ } }
            copy();
          };
          return (
            <div style={{ border:"1px solid var(--border)",borderRadius:16,padding:"22px 24px",marginBottom:16,background:"var(--card)" }}>
              <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:6 }}>
                <span style={{ color:"var(--gold)" }}><IconShare size={18}/></span>
                <h3 style={{ fontSize:17,fontWeight:600,color:"var(--ink)" }}>{t.profile.inviteTitle}</h3>
              </div>
              <p style={{ fontSize:14,color:"var(--muted)",fontWeight:300,lineHeight:1.6,marginBottom:invited>0?10:16 }}>{t.profile.inviteBody}</p>
              {invited > 0 && (
                <div style={{ display:"inline-flex",alignItems:"center",gap:7,fontSize:12.5,fontWeight:500,color:"var(--gold)",background:"rgba(176,138,62,0.1)",border:"1px solid rgba(176,138,62,0.25)",padding:"5px 12px",borderRadius:100,marginBottom:16 }}>
                  {t.profile.inviteProgress(invited, toGo)}
                </div>
              )}
              <div className="linkbar" style={{ marginBottom:0 }}>
                <input value={link} readOnly onFocus={(e)=>e.currentTarget.select()} style={{ fontSize:13 }} />
                <button className="btn-dark" onClick={copy} style={{ padding:"0 16px",borderRadius:8,display:"flex",alignItems:"center",gap:7,fontSize:14 }}>
                  <IconLink size={15}/> {t.profile.inviteCopy}
                </button>
                <button className="btn-dark" onClick={share} aria-label={t.profile.inviteShare} style={{ padding:"0 14px",borderRadius:8,display:"flex",alignItems:"center" }}>
                  <IconShare size={16}/>
                </button>
              </div>
            </div>
          );
        })()}

        {showPro && (
          <ProModal
            onClose={()=>setShowPro(false)}
            checkoutHref={user ? coHref(PRO_PRODUCT, user.uid, user.email) : "/#pricing"}
            weeklyHref={user && WEEKLY_PRODUCT ? coHref(WEEKLY_PRODUCT, user.uid, user.email) : null}
          />
        )}

        {/* Settings */}
        <div className="card" style={{ overflow:"hidden" }}>
          {([
            { k:"notifications" as const, label:t.profile.settingsNotif, sub:t.profile.settingsNotifSub },
            { k:"improveAI" as const,     label:t.profile.settingsImprove, sub:t.profile.settingsImproveSub },
            { k:"publicProfile" as const, label:t.profile.settingsPublic, sub:t.profile.settingsPublicSub },
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
          {t.profile.signOut}
        </button>
      </div>
    </AppShell>
  );
}

/* Pro details — what you unlock, vs the free plan, with the checkout CTA. */
function ProModal({ onClose, checkoutHref, weeklyHref }: { onClose: () => void; checkoutHref: string; weeklyHref: string | null }) {
  const { t } = useI18n();
  // [label, free value, pro value, highlighted = a real upgrade]
  const ROWS = t.profile.proRows(FREE_MONTHLY, PRO_MONTHLY);
  return (
    <div
      onClick={onClose}
      style={{ position:"fixed",inset:0,zIndex:50,background:"rgba(20,16,10,0.55)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",padding:18 }}>
      <div
        onClick={(e)=>e.stopPropagation()}
        style={{ width:"100%",maxWidth:460,maxHeight:"90vh",overflowY:"auto",background:"var(--ink)",borderRadius:18,padding:"28px 26px",position:"relative",boxShadow:"0 30px 80px rgba(0,0,0,0.4)" }}>
        <button onClick={onClose} aria-label={t.common.close} style={{ position:"absolute",top:16,right:16,width:30,height:30,borderRadius:100,border:"1px solid rgba(255,255,255,0.18)",background:"transparent",color:"rgba(255,255,255,0.7)",cursor:"pointer",fontSize:17,lineHeight:1,padding:0 }}>×</button>

        <p style={{ fontSize:11,letterSpacing:"0.14em",color:"#FFD9A8",fontWeight:600,marginBottom:8 }}>{t.profile.proEyebrow}</p>
        <h2 className="serif" style={{ fontSize:30,fontWeight:600,color:"#fff",letterSpacing:"-0.03em",marginBottom:6 }}>{t.profile.proTitle}</h2>
        <p style={{ fontSize:14,color:"rgba(255,255,255,0.5)",fontWeight:300,marginBottom:22 }}>
          <span style={{ fontSize:26,color:"#fff",fontWeight:500 }}>{t.profile.proPrice}</span>{t.profile.proPriceSuffix}
        </p>

        {/* Comparison */}
        <div style={{ border:"1px solid rgba(255,255,255,0.12)",borderRadius:12,overflow:"hidden",marginBottom:22 }}>
          <div style={{ display:"grid",gridTemplateColumns:"1.3fr 0.9fr 1.1fr",padding:"10px 14px",fontSize:11,letterSpacing:"0.06em",color:"rgba(255,255,255,0.4)",borderBottom:"1px solid rgba(255,255,255,0.1)",fontWeight:600 }}>
            <span></span><span>{t.profile.proFree}</span><span style={{ color:"#FFD9A8" }}>{t.profile.proPro}</span>
          </div>
          {ROWS.map(([label, free, pro, hot], i) => (
            <div key={label} style={{ display:"grid",gridTemplateColumns:"1.3fr 0.9fr 1.1fr",alignItems:"center",padding:"11px 14px",borderBottom:i<ROWS.length-1?"1px solid rgba(255,255,255,0.07)":undefined,background:hot?"rgba(176,138,62,0.08)":undefined }}>
              <span style={{ fontSize:13,color:"rgba(255,255,255,0.85)",fontWeight:hot?500:400 }}>{label}</span>
              <span style={{ fontSize:12.5,color:"rgba(255,255,255,0.4)" }}>{free}</span>
              <span style={{ fontSize:12.5,color:hot?"#FFD9A8":"rgba(255,255,255,0.85)",fontWeight:hot?600:400,display:"flex",alignItems:"center",gap:5 }}>
                {hot && <IconCheck size={13}/>}{pro}
              </span>
            </div>
          ))}
        </div>

        <a href={checkoutHref} onClick={() => track("checkout_started", { plan: "pro", source: "profile" })}
          style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:"#fff",color:"var(--ink)",borderRadius:8,padding:"15px",fontSize:15,fontWeight:600,textDecoration:"none" }}>
          {t.profile.upgradeToPro} <IconArrowRight size={16}/>
        </a>
        {weeklyHref && (
          <a href={weeklyHref} onClick={() => track("checkout_started", { plan: "weekly", source: "profile" })}
            style={{ display:"block",textAlign:"center",marginTop:16,paddingTop:16,borderTop:"1px solid rgba(255,255,255,0.1)",fontSize:13,color:"rgba(255,255,255,0.7)",textDecoration:"none" }}>
            {t.common.weeklyOption}
          </a>
        )}
      </div>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange} role="switch" aria-checked={on} style={{ width:44,height:24,borderRadius:100,background:on?"var(--brand)":"rgba(26,22,17,0.14)",border:"none",cursor:"pointer",position:"relative",transition:"background 0.25s",flexShrink:0 }}>
      <div style={{ position:"absolute",top:3,left:on?23:3,width:18,height:18,borderRadius:"50%",background:"#fff",transition:"left 0.25s cubic-bezier(0.22,1,0.36,1)",boxShadow:"0 1px 4px rgba(0,0,0,0.2)" }}/>
    </button>
  );
}
