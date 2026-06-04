"use client";

/* Tiny dependency-free toast — call toast("Saved") from any client handler. */
type ToastType = "default" | "success" | "error";

const DOT: Record<ToastType, string> = {
  default: "var(--brand-2)",
  success: "#37b24d",
  error:   "#e03131",
};

export function toast(message: string, type: ToastType = "default", ms = 2600) {
  if (typeof document === "undefined") return;

  let host = document.getElementById("wearit-toasts");
  if (!host) {
    host = document.createElement("div");
    host.id = "wearit-toasts";
    document.body.appendChild(host);
  }

  const el = document.createElement("div");
  el.className = "toast";

  const dot = document.createElement("span");
  dot.className = "toast-dot";
  dot.style.background = DOT[type];
  el.appendChild(dot);

  const text = document.createElement("span");
  text.textContent = message;
  el.appendChild(text);

  host.appendChild(el);

  const remove = () => {
    el.classList.add("out");
    el.addEventListener("animationend", () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400);
  };
  setTimeout(remove, ms);
}
