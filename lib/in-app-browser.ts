/**
 * Detects embedded "in-app" browsers (the webviews inside Instagram, TikTok,
 * Facebook, etc.). Google blocks OAuth in these webviews with
 * `403 disallowed_useragent` ("Use secure browsers" policy) — no Firebase /
 * Google Cloud setting can re-enable it, so we steer those users to a real
 * browser instead of letting them hit a dead end.
 *
 * SSR-safe: returns false when there is no window/navigator.
 */

const IN_APP_UA = [
  // Meta family
  "FBAN", "FBAV", "FB_IAB", "FBIOS", "Messenger", "Instagram",
  // ByteDance
  "BytedanceWebview", "musical_ly", "TikTok", "Bytedance",
  // Other social apps
  "Twitter", "LinkedInApp", "Snapchat", "Pinterest", "WhatsApp",
  "Line/", "KAKAOTALK", "DaumApps", "VKClient", "OKApp",
  // Generic Android WebView marker
  "; wv",
];

function ua(): string {
  if (typeof navigator === "undefined") return "";
  return navigator.userAgent || "";
}

/** True when the page is running inside a known in-app webview. */
export function isInAppBrowser(): boolean {
  const s = ua();
  if (!s) return false;
  if (IN_APP_UA.some((token) => s.includes(token))) return true;
  // iOS WebViews driven by WKWebView lack the "Safari" token while still
  // reporting Mobile/… — a strong signal of an embedded browser.
  const isIOS = /iPhone|iPod|iPad/.test(s);
  if (isIOS && /AppleWebKit/.test(s) && !/Safari/.test(s) && /Mobile\//.test(s)) {
    return true;
  }
  return false;
}

/** Coarse mobile check — used to prefer redirect over popup. */
export function isMobile(): boolean {
  const s = ua();
  return /Android|iPhone|iPad|iPod|Mobile/i.test(s);
}
