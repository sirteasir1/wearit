"use client";

/* PostHog product analytics. Everything here is a safe no-op until
   NEXT_PUBLIC_POSTHOG_KEY is set, so the app runs fine without a key. */

import posthog from "posthog-js";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

const KEY  = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
const on   = () => !!KEY && typeof window !== "undefined";

let started = false;
function start() {
  if (started || !on()) return;
  started = true;
  posthog.init(KEY!, {
    api_host: HOST,
    capture_pageview: false,   // captured manually for the App Router below
    capture_pageleave: true,
    persistence: "localStorage+cookie",
    autocapture: true,
  });
}

// Initialise at module load (client only), BEFORE any React effect runs — child
// effects fire before parent effects, so a useEffect-based init would miss the
// first $pageview. Self-guards on window + key, and is idempotent.
if (typeof window !== "undefined") start();

/* Funnel helpers — call these from anywhere. */
export function track(event: string, props?: Record<string, unknown>) {
  if (!on()) return;
  try { posthog.capture(event, props); } catch { /* ignore */ }
}
export function identifyUser(uid: string, props?: Record<string, unknown>) {
  if (!on()) return;
  try { posthog.identify(uid, props); } catch { /* ignore */ }
}
export function resetAnalytics() {
  if (!on()) return;
  try { posthog.reset(); } catch { /* ignore */ }
}

function Pageviews() {
  const pathname = usePathname();
  const search = useSearchParams();
  useEffect(() => {
    if (!on()) return;
    track("$pageview", { $current_url: window.location.href });
  }, [pathname, search]);
  return null;
}

/* Drop once near the root. Initialises PostHog and tracks SPA pageviews. */
export function PostHogInit() {
  useEffect(() => { start(); }, []);
  if (!KEY) return null;
  return (
    <Suspense fallback={null}>
      <Pageviews />
    </Suspense>
  );
}
