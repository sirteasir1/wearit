"use client";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";

/**
 * Shown on auth screens when the page is opened inside an in-app webview
 * (Instagram, TikTok, etc.), where Google sign-in fails with
 * `403 disallowed_useragent`. Tells the user to open the page in a real
 * browser and offers a copy-link shortcut. Email sign-in still works below.
 */
export function InAppBrowserBanner() {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — user can still use the app's menu */
    }
  };

  return (
    <div style={{ marginBottom:20,padding:"14px 16px",borderRadius:12,background:"rgba(245,158,11,.1)",border:"1px solid rgba(245,158,11,.3)" }}>
      <div style={{ fontSize:13,fontWeight:600,color:"#fcd34d",marginBottom:6 }}>{t.auth.inAppTitle}</div>
      <div style={{ fontSize:12.5,color:"rgba(255,255,255,.55)",lineHeight:1.5,marginBottom:12 }}>{t.auth.inAppBody}</div>
      <button
        onClick={copy}
        style={{ width:"100%",padding:"10px 14px",borderRadius:100,background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.18)",color:"#fff",fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:"'Hanken Grotesk',sans-serif" }}
      >
        {copied ? t.auth.inAppCopied : t.auth.inAppCopy}
      </button>
    </div>
  );
}
