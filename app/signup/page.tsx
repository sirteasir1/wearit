"use client";
import { useState } from "react";
import Link from "next/link";
import {
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  updateProfile,
  AuthError,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

function authMessage(err: AuthError): string {
  switch (err.code) {
    case "auth/email-already-in-use":
      return "An account with this email already exists.";
    case "auth/invalid-email":
      return "Invalid email address.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "auth/popup-closed-by-user":
      return "";
    default:
      return "Sign-up failed. Please try again.";
  }
}

export default function SignUp() {
  const [step, setStep]       = useState<"choose" | "email">("choose");
  const [form, setForm]       = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const afterAuth = () => { window.location.href = "/app"; };

  const submitGoogle = async () => {
    setLoading(true);
    setError("");
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      afterAuth();
    } catch (e) {
      const msg = authMessage(e as AuthError);
      if (msg) setError(msg);
      setLoading(false);
    }
  };

  const submitEmail = async () => {
    if (!form.email || !form.password) { setError("Please fill in all fields."); return; }
    if (form.password.length < 6)      { setError("Password must be at least 6 characters."); return; }
    setLoading(true);
    setError("");
    try {
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
      if (form.name.trim()) {
        await updateProfile(cred.user, { displayName: form.name.trim() });
      }
      afterAuth();
    } catch (e) {
      setError(authMessage(e as AuthError));
      setLoading(false);
    }
  };

  const onKey = (e: React.KeyboardEvent) => { if (e.key === "Enter") submitEmail(); };

  return (
    <div className="auth-split">
      {/* LEFT */}
      <div className="auth-left">
        <div style={{ width:"100%",maxWidth:380 }}>
          <Link href="/" className="brand-lock" style={{ marginBottom:56 }}>
            <img src="/logo-mark.png" alt="Wearit" className="brand-mark brand-mark-light" style={{ height:30 }} />
            <span className="brand-word" style={{ fontSize:22, color:"#fff" }}>Wearit</span>
          </Link>

          {step === "choose" ? (
            <>
              <h1 style={{ fontSize:30,fontWeight:600,color:"#fff",marginBottom:8,fontFamily:"'Bricolage Grotesque',sans-serif",letterSpacing:"-0.02em" }}>Get started with Wearit</h1>
              <p style={{ fontSize:14,color:"rgba(255,255,255,.4)",marginBottom:36,fontWeight:300 }}>4 free credits to start. No card needed.</p>

              {error && (
                <div style={{ marginBottom:16,padding:"10px 14px",borderRadius:10,background:"rgba(239,68,68,.12)",border:"1px solid rgba(239,68,68,.25)",color:"#fca5a5",fontSize:13 }}>
                  {error}
                </div>
              )}

              <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
                <button
                  onClick={submitGoogle}
                  disabled={loading}
                  style={{ width:"100%",padding:"13px 20px",borderRadius:100,background:"#fff",border:"none",display:"flex",alignItems:"center",justifyContent:"center",gap:10,fontSize:14,fontWeight:500,cursor:"pointer",color:"#111",fontFamily:"'Hanken Grotesk',sans-serif",opacity:loading?0.6:1 }}
                >
                  <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"/><path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/></svg>
                  Continue with Google
                </button>
                <button
                  onClick={() => { setError(""); setStep("email"); }}
                  disabled={loading}
                  style={{ width:"100%",padding:"13px 20px",borderRadius:100,background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.1)",fontSize:14,fontWeight:400,cursor:"pointer",color:"#fff",fontFamily:"'Hanken Grotesk',sans-serif" }}
                >
                  Continue with email
                </button>
              </div>

              <p style={{ fontSize:12,color:"rgba(255,255,255,.25)",marginTop:28,lineHeight:1.6,textAlign:"center" }}>
                By signing up you agree to the{" "}
                <a href="#" style={{ color:"rgba(255,255,255,.45)",textDecoration:"underline" }}>Privacy Policy</a>
                {" "}and{" "}
                <a href="#" style={{ color:"rgba(255,255,255,.45)",textDecoration:"underline" }}>Terms of Use</a>
              </p>
            </>
          ) : (
            <>
              <button
                onClick={() => { setError(""); setStep("choose"); }}
                style={{ background:"none",border:"none",color:"rgba(255,255,255,.4)",fontSize:13,cursor:"pointer",marginBottom:28,padding:0,display:"flex",alignItems:"center",gap:6,fontFamily:"'Hanken Grotesk',sans-serif" }}
              >
                ← Back
              </button>
              <h1 style={{ fontSize:26,fontWeight:500,color:"#fff",marginBottom:32 }}>Create your account</h1>

              <div style={{ display:"flex",flexDirection:"column",gap:14,marginBottom:24 }}>
                {[
                  { k:"name",     label:"Full name",  type:"text",     ph:"Your name" },
                  { k:"email",    label:"Email",      type:"email",    ph:"you@example.com" },
                  { k:"password", label:"Password",   type:"password", ph:"Min. 6 characters" },
                ].map(f => (
                  <div key={f.k}>
                    <label style={{ fontSize:12,fontWeight:500,color:"rgba(255,255,255,.4)",display:"block",marginBottom:7 }}>{f.label}</label>
                    <input
                      type={f.type} placeholder={f.ph}
                      value={(form as Record<string,string>)[f.k]}
                      onChange={e => set(f.k, e.target.value)}
                      onKeyDown={onKey}
                      disabled={loading}
                      style={{ width:"100%",padding:"12px 16px",borderRadius:12,border:"1px solid rgba(255,255,255,.1)",background:"rgba(255,255,255,.05)",color:"#fff",fontSize:15,fontFamily:"'Hanken Grotesk',sans-serif",outline:"none" }}
                    />
                  </div>
                ))}
              </div>

              {error && (
                <div style={{ marginBottom:16,padding:"10px 14px",borderRadius:10,background:"rgba(239,68,68,.12)",border:"1px solid rgba(239,68,68,.25)",color:"#fca5a5",fontSize:13 }}>
                  {error}
                </div>
              )}

              <button
                onClick={submitEmail}
                disabled={loading}
                style={{ width:"100%",padding:"14px",borderRadius:100,background:"#fff",border:"none",fontSize:15,fontWeight:500,cursor:"pointer",color:"#111",fontFamily:"'Hanken Grotesk',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:10,opacity:loading?0.7:1 }}
              >
                {loading
                  ? <div style={{ width:18,height:18,border:"2px solid rgba(0,0,0,.2)",borderTopColor:"#0f0f0f",borderRadius:"50%",animation:"spin .65s linear infinite" }}/>
                  : "Create account →"}
              </button>
            </>
          )}

          <p style={{ textAlign:"center",marginTop:28,fontSize:14,color:"rgba(255,255,255,.3)" }}>
            Already have an account?{" "}
            <Link href="/signin" style={{ color:"rgba(255,255,255,.7)",fontWeight:500,textDecoration:"none" }}>Sign in</Link>
          </p>
        </div>
      </div>

      {/* RIGHT */}
      <div className="auth-right auth-photo">
        <img src="/images/auth-studio.jpg" alt="" />
        <div className="auth-photo-cap">
          <p className="serif" style={{ fontSize:26,fontWeight:500,color:"#fff",letterSpacing:"-0.02em",lineHeight:1.2 }}>The fitting room,<br/><em style={{ fontStyle:"italic" }}>reimagined.</em></p>
        </div>
      </div>
    </div>
  );
}
