"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getProfile, pullRemote } from "@/lib/store";
import { IconSpark, IconHanger, IconUser, IconSignOut, IconPanel } from "@/lib/icons";

const NAV = [
  { href: "/app",      Icon: IconSpark,  label: "Try on"   },
  { href: "/wardrobe", Icon: IconHanger, label: "Wardrobe" },
  { href: "/profile",  Icon: IconUser,   label: "Profile"  },
];

const SIDEBAR_KEY = "wearit:sidebar-collapsed";

export default function AppShell({ children }: { children: ReactNode }) {
  const path   = usePathname();
  const router = useRouter();
  const [user, setUser]             = useState<User | null | "loading">("loading");
  const [signingOut, setSigningOut] = useState(false);
  const [collapsed, setCollapsed]   = useState(false);
  const [photo, setPhoto]           = useState<string | null>(null);
  const [ready, setReady]           = useState(false);

  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u)), []);

  /* restore sidebar preference */
  useEffect(() => {
    setCollapsed(localStorage.getItem(SIDEBAR_KEY) === "1");
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      return next;
    });
  };

  /* auth + onboarding gating (waits for the Firestore sync first) */
  useEffect(() => {
    if (user === null) { router.replace("/signin"); return; }
    if (user && user !== "loading") {
      let cancelled = false;
      (async () => {
        // sync from Firestore (never hang the gate more than ~4s)
        await Promise.race([pullRemote(user.uid), new Promise((r) => setTimeout(r, 4000))]);
        if (cancelled) return;
        const p = getProfile(user.uid);
        setPhoto(p.photo);
        if (!p.onboarded) { router.replace("/onboarding"); return; }
        setReady(true);
      })();
      return () => { cancelled = true; };
    }
  }, [user, router]);

  if (user === "loading" || user === null || !ready) {
    return (
      <div style={{ display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"var(--bg)" }}>
        <div className="spinner-dark" style={{ width:24,height:24 }} />
      </div>
    );
  }

  const displayName = user.displayName || user.email?.split("@")[0] || "User";
  const initials    = displayName.slice(0, 1).toUpperCase();

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut(auth);
    window.location.href = "/";
  };

  return (
    <div style={{ display:"flex",minHeight:"100vh",background:"var(--bg)" }}>

      {/* Floating opener — only when collapsed */}
      {collapsed && (
        <button
          onClick={toggle}
          aria-label="Open sidebar"
          style={{
            position:"fixed",top:18,left:18,zIndex:60,width:38,height:38,borderRadius:8,
            background:"var(--card)",border:"1px solid var(--border)",display:"flex",alignItems:"center",
            justifyContent:"center",cursor:"pointer",color:"var(--ink)",
            boxShadow:"0 4px 16px rgba(0,0,0,0.06)",transition:"box-shadow .2s",
          }}
          onMouseEnter={e=>(e.currentTarget.style.boxShadow="0 6px 22px rgba(0,0,0,0.1)")}
          onMouseLeave={e=>(e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,0.06)")}
        >
          <IconPanel size={18} />
        </button>
      )}

      {/* Sidebar */}
      <aside
        style={{
          width: collapsed ? 0 : 248,
          flexShrink: 0,
          overflow: "hidden",
          transition: "width .34s cubic-bezier(.22,1,.36,1)",
          position: "sticky",
          top: 0,
          height: "100vh",
          borderRight: collapsed ? "none" : "1px solid var(--border)",
          background: "var(--card)",
        }}
      >
        <div style={{ width:248,height:"100vh",display:"flex",flexDirection:"column",padding:"20px 14px",
          opacity: collapsed ? 0 : 1, transition:"opacity .2s" }}>

          {/* Header: logo + collapse */}
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"4px 8px 0 12px",marginBottom:30 }}>
            <Link href="/" className="brand-lock">
              <img src="/logo-mark.png" alt="Wearit" className="brand-mark" style={{ height:28 }} />
              <span className="brand-word" style={{ fontSize:19, color:"var(--ink)" }}>Wearit</span>
            </Link>
            <button
              onClick={toggle}
              aria-label="Collapse sidebar"
              style={{ background:"none",border:"none",cursor:"pointer",color:"var(--faint)",padding:6,borderRadius:6,display:"flex",transition:"color .15s,background .15s" }}
              onMouseEnter={e=>{e.currentTarget.style.color="var(--ink)";e.currentTarget.style.background="var(--sand)";}}
              onMouseLeave={e=>{e.currentTarget.style.color="var(--faint)";e.currentTarget.style.background="none";}}
            >
              <IconPanel size={17} />
            </button>
          </div>

          {/* Nav */}
          <nav style={{ flex:1,display:"flex",flexDirection:"column",gap:2 }}>
            {NAV.map(({ href, Icon, label }) => (
              <Link key={href} href={href} className={`sidebar-link${path === href ? " active" : ""}`}>
                <Icon size={18} />
                {label}
              </Link>
            ))}
          </nav>

          {/* User row */}
          <div style={{ borderTop:"1px solid var(--border)",paddingTop:12 }}>
            <Link href="/profile" style={{ display:"flex",alignItems:"center",gap:10,padding:"8px 12px",marginBottom:4,textDecoration:"none",borderRadius:8 }}>
              <div className="avatar" style={{ width:32,height:32,fontSize:13,flexShrink:0,overflow:"hidden" }}>
                {photo
                  ? <img src={photo} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }}/>
                  : user.photoURL
                    ? <img src={user.photoURL} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }}/>
                    : initials}
              </div>
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:13,fontWeight:500,color:"var(--ink)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{displayName}</div>
                <div style={{ fontSize:11,color:"var(--muted)" }}>Free plan</div>
              </div>
            </Link>
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="sidebar-link"
              style={{ color:"var(--muted)" }}
            >
              <IconSignOut size={18} />
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex:1,overflow:"auto",minWidth:0 }}>{children}</main>
    </div>
  );
}
