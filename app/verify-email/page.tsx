"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { onAuthStateChanged, sendEmailVerification, signOut, User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useI18n, LangSwitch } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { IconCheck } from "@/lib/icons";

export default function VerifyEmail() {
  const { t } = useI18n();
  const router = useRouter();
  const [user, setUser]       = useState<User | null | "loading">("loading");
  const [checking, setChecking] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [notYet, setNotYet]   = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* Once verified, send them into the app (AppShell handles onboarding). */
  const proceed = () => router.replace("/app");

  useEffect(() => onAuthStateChanged(auth, (u) => {
    if (!u) { router.replace("/signin"); return; }
    if (u.emailVerified) { proceed(); return; }
    setUser(u);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  /* Quietly poll: when the user clicks the link in another tab, reload() flips
     emailVerified and we let them straight in. */
  useEffect(() => {
    if (user === "loading" || user === null) return;
    pollRef.current = setInterval(async () => {
      try {
        await user.reload();
        if (auth.currentUser?.emailVerified) { clearInterval(pollRef.current!); proceed(); }
      } catch { /* offline — keep trying */ }
    }, 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  /* Resend cooldown ticker */
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  if (user === "loading" || user === null) {
    return (
      <div style={{ display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"var(--bg)" }}>
        <div className="spinner-dark" style={{ width:24,height:24 }} />
      </div>
    );
  }

  const email = user.email || "";

  const check = async () => {
    setChecking(true); setNotYet(false);
    try {
      await user.reload();
      if (auth.currentUser?.emailVerified) { proceed(); return; }
      setNotYet(true);
    } catch { setNotYet(true); }
    finally { setChecking(false); }
  };

  const resend = async () => {
    if (cooldown > 0) return;
    try {
      await sendEmailVerification(user);
      toast(t.verify.resent, "success");
      setCooldown(45);
    } catch {
      toast(t.verify.resendFailed, "error");
    }
  };

  const useAnother = async () => { await signOut(auth); router.replace("/signin"); };

  return (
    <div style={{ minHeight:"100vh",background:"var(--bg)",display:"flex",flexDirection:"column" }}>
      {/* Top bar */}
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"22px 32px" }}>
        <Link href="/" className="brand-lock">
          <img src="/logo-mark.png" alt="Wearit" className="brand-mark" style={{ height:28 }} />
          <span className="brand-word" style={{ fontSize:19, color:"var(--ink)" }}>Wearit</span>
        </Link>
        <LangSwitch />
      </div>

      <div style={{ flex:1,display:"flex",alignItems:"center",justifyContent:"center",padding:"24px" }}>
        <div className="anim-up" style={{ width:"100%",maxWidth:440,textAlign:"center" }}>
          <div style={{ width:64,height:64,borderRadius:"50%",background:"var(--brand-soft)",border:"1px solid var(--brand-ring)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 22px",color:"var(--brand)" }}>
            <IconCheck size={28} />
          </div>

          <h1 className="serif" style={{ fontSize:"clamp(28px,4vw,38px)",fontWeight:600,letterSpacing:"-0.025em",color:"var(--ink)",marginBottom:12 }}>{t.verify.title}</h1>
          <p style={{ fontSize:15,color:"var(--muted)",lineHeight:1.7,fontWeight:300,marginBottom:6 }}>{t.verify.sentTo(email)}</p>
          <p style={{ fontSize:15,color:"var(--muted)",lineHeight:1.7,fontWeight:300,marginBottom:28 }}>{t.verify.instruction}</p>

          {notYet && (
            <div style={{ marginBottom:18,padding:"11px 14px",borderRadius:8,background:"#fdecea",border:"1px solid #f5c6c2",color:"#b71c1c",fontSize:13,textAlign:"left" }}>
              {t.verify.notYet}
            </div>
          )}

          <button onClick={check} disabled={checking} className="btn-dark"
            style={{ width:"100%",padding:"15px",fontSize:15,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",gap:9,marginBottom:12 }}>
            {checking ? <><div className="spinner" style={{ width:18,height:18 }} /> {t.verify.checking}</> : t.verify.continue}
          </button>

          <button onClick={resend} disabled={cooldown > 0}
            style={{ width:"100%",padding:"13px",fontSize:14,borderRadius:10,border:"1px solid var(--border)",background:"var(--card)",color: cooldown>0?"var(--faint)":"var(--ink)",cursor: cooldown>0?"default":"pointer",fontFamily:"'Hanken Grotesk',sans-serif",marginBottom:18 }}>
            {cooldown > 0 ? t.verify.resendIn(cooldown) : t.verify.resend}
          </button>

          <p style={{ fontSize:12.5,color:"var(--faint)",marginBottom:20 }}>{t.verify.spam}</p>

          <button onClick={useAnother}
            style={{ background:"none",border:"none",color:"var(--muted)",fontSize:13,cursor:"pointer",textDecoration:"underline",textUnderlineOffset:3,fontFamily:"'Hanken Grotesk',sans-serif" }}>
            {t.verify.useAnother}
          </button>
        </div>
      </div>
    </div>
  );
}
