"use client";
import { useEffect, useState } from "react";
import { IconSpark, IconArrowRight } from "@/lib/icons";
import { toast } from "@/lib/toast";
import { useI18n } from "@/lib/i18n";

type Cat = "tops" | "bottoms" | "one-pieces";
export interface ShopItem { id: string; name: string; image: string; tryOn: string; price: string; link: string; cat: Cat }

/* Offline / no-key fallback — bundled garments, try-on only (no buy link). */
const fb = (id: string, name: string, file: string, cat: Cat): ShopItem =>
  ({ id, name, image: file, tryOn: file, price: "", link: "", cat });
const FALLBACK: ShopItem[] = [
  fb("s-tee",      "White tee",    "/images/samples/sample-tee.jpg",      "tops"),
  fb("s-shirt",    "Blue shirt",   "/images/samples/sample-shirt.jpg",    "tops"),
  fb("s-jacket",   "Denim jacket", "/images/samples/sample-jacket.jpg",   "tops"),
  fb("s-trousers", "Trousers",     "/images/samples/sample-trousers.jpg", "bottoms"),
  fb("s-dress",    "Floral dress", "/images/samples/sample-dress.jpg",     "one-pieces"),
];

export default function ShopStrip({ onTryOn, busy }: {
  onTryOn: (src: string, cat: Cat) => Promise<boolean> | boolean;
  busy: boolean;
}) {
  const { t } = useI18n();
  const [items, setItems]   = useState<ShopItem[] | null>(null); // null = loading
  const [adding, setAdding] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/catalog");
        const d = await r.json();
        if (!alive) return;
        setItems(Array.isArray(d.items) && d.items.length ? d.items : FALLBACK);
      } catch {
        if (alive) setItems(FALLBACK);
      }
    })();
    return () => { alive = false; };
  }, []);

  const tryOn = async (it: ShopItem) => {
    if (busy || adding) return;
    setAdding(it.id);
    const ok = await onTryOn(it.tryOn || it.image, it.cat);
    if (ok) toast(t.app.garmentAdded, "success");
    setAdding(null);
  };

  if (items === null) {
    return (
      <div style={{ marginBottom: 26 }}>
        <p className="shop-eyebrow">{t.app.shopEyebrow}</p>
        <div className="shop-row-wrap">
          <div className="shop-track" style={{ animation: "none" }}>
            {Array.from({ length: 7 }).map((_, i) => (
              <div className="shop-card" key={i}><div className="sk" style={{ aspectRatio: "3/4", borderRadius: 12 }} /></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Duplicate the list so the marquee loops seamlessly (0 → -50%).
  const loop = [...items, ...items];
  const duration = Math.max(26, items.length * 3.2);

  return (
    <div style={{ marginBottom: 26 }}>
      <p className="shop-eyebrow">{t.app.shopEyebrow}</p>
      <div
        className="shop-row-wrap"
        onPointerEnter={() => setPaused(true)}
        onPointerLeave={() => setPaused(false)}
      >
        <div className="shop-track" style={{ animationDuration: `${duration}s`, animationPlayState: paused ? "paused" : "running" }}>
          {loop.map((it, i) => (
            <div className="shop-card" key={`${it.id}-${i}`}>
              <button
                type="button"
                className="shop-thumb"
                onClick={() => tryOn(it)}
                disabled={busy || !!adding}
                aria-label={`${t.app.shopTryOn}: ${it.name}`}
              >
                <img src={it.image} alt={it.name} loading="lazy" draggable={false} />
                <span className="shop-try">
                  {adding === it.id ? <span className="spinner" style={{ width: 13, height: 13 }} /> : <IconSpark size={13} />}
                  {t.app.shopTryOn}
                </span>
              </button>
              <div className="shop-meta">
                <span className="shop-name">{it.name}</span>
                <div className="shop-line">
                  {it.price && <span className="shop-price">{it.price}</span>}
                  {it.link && (
                    <a className="shop-buy" href={it.link} target="_blank" rel="noopener noreferrer">
                      {t.app.shopBuy} <IconArrowRight size={11} />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
