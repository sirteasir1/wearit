"use client";
import { useEffect, useRef, useState, ReactNode } from "react";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import AppShell from "@/lib/app-shell";
import { getWardrobe, saveWardrobe, removeWardrobeItem, WardrobeItem } from "@/lib/store";
import { IconHanger, IconHeart, IconHeartFilled, IconShare, IconSpark, IconArrowRight, IconSearch, IconTrash } from "@/lib/icons";
import { toast } from "@/lib/toast";

const VERDICTS: Record<string,string> = { buy:"tag-green", skip:"tag-red", maybe:"tag-amber" };
const LABELS:   Record<string,string> = { buy:"Buy it",    skip:"Skip it", maybe:"Maybe" };

/* Card that gently tilts in 3D toward the cursor */
function TiltCard({ children, className, style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: React.MouseEvent) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transition = "transform 0.08s linear";
    el.style.transform = `perspective(820px) rotateY(${px * 9}deg) rotateX(${-py * 9}deg) translateY(-5px)`;
  };
  const onLeave = () => {
    const el = ref.current; if (!el) return;
    el.style.transition = "transform 0.5s cubic-bezier(0.22,1,0.36,1), box-shadow 0.3s";
    el.style.transform = "";
  };
  return (
    <div ref={ref} className={className} style={style} onMouseMove={onMove} onMouseLeave={onLeave}>
      {children}
    </div>
  );
}

type Sort = "newest" | "top" | "favorites";

export default function Wardrobe() {
  const [uid, setUid]       = useState<string | null>(null);
  const [items, setItems]   = useState<WardrobeItem[]>([]);
  const [filter, setFilter] = useState("All");
  const [query, setQuery]   = useState("");
  const [sort, setSort]     = useState<Sort>("newest");

  useEffect(() => onAuthStateChanged(auth, (u) => {
    if (!u) return;
    setUid(u.uid);
    setItems(getWardrobe(u.uid));
  }), []);

  const toggleFav = (id: string) => {
    const next = items.map(i => i.id === id ? { ...i, fav: !i.fav } : i);
    setItems(next);
    if (uid) saveWardrobe(uid, next);
  };
  const remove = (id: string) => {
    const next = items.filter(i => i.id !== id);
    setItems(next);
    if (uid) removeWardrobeItem(uid, id);
    toast("Removed from wardrobe");
  };
  const share = async (img: string) => { await navigator.clipboard.writeText(img); toast("Link copied"); };

  const cats = ["All","Tops","Bottoms","One-pieces","Favorites"];
  const q = query.trim().toLowerCase();
  const shown = items
    .filter(i => filter === "All" || (filter === "Favorites" ? i.fav : i.category === filter))
    .filter(i => !q || i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q))
    .sort((a, b) =>
      sort === "top"       ? b.score - a.score :
      sort === "favorites" ? Number(b.fav) - Number(a.fav) || b.createdAt - a.createdAt :
                             b.createdAt - a.createdAt
    );

  return (
    <AppShell>
      <div className="page-in" style={{ padding:"48px 44px",maxWidth:1040 }}>
        <div style={{ display:"flex",alignItems:"flex-end",justifyContent:"space-between",marginBottom:32,flexWrap:"wrap",gap:16 }}>
          <div>
            <p style={{ fontSize:11,letterSpacing:"0.15em",textTransform:"uppercase",color:"var(--muted)",marginBottom:14,fontWeight:500 }}>Collection</p>
            <h1 className="serif" style={{ fontSize:46,fontWeight:600,letterSpacing:"-0.035em",color:"var(--ink)",marginBottom:6 }}>My wardrobe</h1>
            <p style={{ fontSize:15,color:"var(--muted)",fontWeight:300 }}>{items.length} {items.length===1?"look":"looks"} saved</p>
          </div>
          <Link href="/app" className="btn-dark" style={{ padding:"11px 22px",fontSize:14,gap:8 }}>
            <IconSpark size={16}/> New try-on
          </Link>
        </div>

        {/* Controls — only when there are items */}
        {items.length > 0 && (
          <>
            {/* Search + sort */}
            <div style={{ display:"flex",gap:10,marginBottom:14,flexWrap:"wrap",alignItems:"center" }}>
              <div style={{ position:"relative",flex:"1 1 240px",maxWidth:360 }}>
                <span style={{ position:"absolute",left:13,top:"50%",transform:"translateY(-50%)",color:"var(--faint)",display:"flex" }}><IconSearch size={16}/></span>
                <input
                  value={query} onChange={e=>setQuery(e.target.value)}
                  placeholder="Search your looks…"
                  style={{ width:"100%",padding:"10px 14px 10px 38px",borderRadius:100,border:"1px solid var(--border)",background:"var(--card)",fontSize:14,fontFamily:"'Hanken Grotesk',sans-serif",outline:"none",color:"var(--ink)" }}
                  onFocus={e=>{ e.currentTarget.style.borderColor="var(--brand)"; e.currentTarget.style.boxShadow="0 0 0 3px var(--brand-ring)"; }}
                  onBlur={e=>{ e.currentTarget.style.borderColor="var(--border)"; e.currentTarget.style.boxShadow="none"; }}
                />
              </div>
              <div style={{ display:"flex",gap:6 }}>
                {([["newest","Newest"],["top","Top rated"],["favorites","Favorites"]] as [Sort,string][]).map(([v,label]) => (
                  <button key={v} className="chip" onClick={()=>setSort(v)} style={{
                    padding:"8px 14px",borderRadius:100,fontSize:12.5,cursor:"pointer",fontFamily:"'Hanken Grotesk',sans-serif",
                    background: sort===v ? "var(--brand)" : "var(--card)",
                    color:      sort===v ? "#fff" : "var(--muted)",
                    border:     sort===v ? "1px solid var(--brand)" : "1px solid var(--border)",
                    fontWeight: sort===v ? 500 : 400,
                  }}>{label}</button>
                ))}
              </div>
            </div>

            {/* Category filters */}
            <div style={{ display:"flex",gap:8,marginBottom:30,flexWrap:"wrap" }}>
              {cats.map(c => (
                <button key={c} className="chip" onClick={()=>setFilter(c)} style={{
                  padding:"8px 18px",borderRadius:100,fontSize:13,cursor:"pointer",fontFamily:"'Hanken Grotesk',sans-serif",
                  background: filter===c ? "var(--brand)" : "var(--card)",
                  color:      filter===c ? "#fff" : "var(--muted)",
                  border:     filter===c ? "1px solid var(--brand)" : "1px solid var(--border)",
                  fontWeight: filter===c ? 500 : 400,
                  boxShadow:  filter===c ? "0 6px 16px rgba(47,76,110,0.22)" : "none",
                }}>{c}</button>
              ))}
            </div>
          </>
        )}

        {/* Grid — keyed on controls so cards re-flow with a fresh pop */}
        {shown.length > 0 ? (
          <div key={`${filter}-${sort}-${q}`} style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:16 }}>
            {shown.map((item, i) => (
              <TiltCard key={item.id} className="garment-card card-pop tilt-card" style={{ animationDelay:`${Math.min(i,12)*0.05}s` }}>
                <div style={{ position:"relative",aspectRatio:"3/4",overflow:"hidden" }}>
                  <img src={item.img} alt={item.name} style={{ width:"100%",height:"100%",objectFit:"cover" }}/>
                  <div style={{ position:"absolute",top:10,right:10,display:"flex",gap:6,zIndex:3 }}>
                    <button onClick={()=>toggleFav(item.id)} aria-label="Favorite" style={{ background:"rgba(255,255,255,0.92)",border:"none",borderRadius:100,width:32,height:32,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(8px)",color:item.fav?"#b71c1c":"var(--ink)" }}>
                      {item.fav ? <IconHeartFilled size={15}/> : <IconHeart size={15}/>}
                    </button>
                    <button onClick={()=>share(item.img)} aria-label="Share" style={{ background:"rgba(255,255,255,0.92)",border:"none",borderRadius:100,width:32,height:32,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(8px)",color:"var(--ink)" }}>
                      <IconShare size={14}/>
                    </button>
                    <button onClick={()=>remove(item.id)} aria-label="Delete" style={{ background:"rgba(255,255,255,0.92)",border:"none",borderRadius:100,width:32,height:32,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(8px)",color:"var(--ink)",transition:"color .15s" }}
                      onMouseEnter={e=>(e.currentTarget.style.color="#b71c1c")} onMouseLeave={e=>(e.currentTarget.style.color="var(--ink)")}>
                      <IconTrash size={15}/>
                    </button>
                  </div>
                  <div style={{ position:"absolute",bottom:10,left:10 }}>
                    <span className={`tag ${VERDICTS[item.verdict]}`} style={{ fontSize:11 }}>{LABELS[item.verdict]}</span>
                  </div>
                </div>
                <div style={{ padding:"14px 16px" }}>
                  <p style={{ fontSize:14,fontWeight:500,color:"var(--ink)",marginBottom:4 }}>{item.name}</p>
                  <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between" }}>
                    <span style={{ fontSize:12,color:"var(--muted)" }}>{item.category}</span>
                    <span style={{ fontSize:12,color:"var(--muted)" }}>{item.score}/10</span>
                  </div>
                </div>
              </TiltCard>
            ))}
          </div>
        ) : (
          /* Empty state */
          <div style={{ border:"1px dashed var(--border)",borderRadius:16,padding:"80px 32px",textAlign:"center",background:"var(--card)" }}>
            <div style={{ display:"inline-flex",color:"var(--faint)",marginBottom:18 }}><IconHanger size={42}/></div>
            <h3 className="serif" style={{ fontSize:26,fontWeight:600,color:"var(--ink)",marginBottom:10,letterSpacing:"-0.025em" }}>
              {items.length === 0 ? "Your wardrobe is empty" : "Nothing in this filter"}
            </h3>
            <p style={{ fontSize:14,color:"var(--muted)",fontWeight:300,marginBottom:28,maxWidth:340,marginInline:"auto",lineHeight:1.7 }}>
              Try a garment on and save the looks you love — they’ll live here, scored and organized.
            </p>
            <Link href="/app" className="btn-dark" style={{ padding:"12px 26px",fontSize:14,gap:8 }}>
              Try your first look <IconArrowRight size={15}/>
            </Link>
          </div>
        )}
      </div>
    </AppShell>
  );
}
