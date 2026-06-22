"use client";

/* ──────────────────────────────────────────────────────────
   In-browser camera capture that works the same on a laptop
   webcam and a phone (front/back). Live preview via
   getUserMedia, snaps a frame to a downsized JPEG dataURL.
   Falls back to a file picker if the camera is blocked or
   missing. Used by onboarding and the main app.
   ────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { IconCamera, IconX, IconCheck } from "@/lib/icons";

const MAX_W = 880; // captured width — matches the onboarding upload path

export default function CameraCapture({
  onCapture,
  onClose,
  onPickFile,
}: {
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
  onPickFile?: () => void; // optional: open the native file picker as a fallback
}) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<"denied" | "missing" | null>(null);
  const [multiCam, setMultiCam] = useState(false);
  const [shot, setShot] = useState<string | null>(null);
  const [timerOn, setTimerOn] = useState(false);
  const [count, setCount] = useState(0);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async (mode: "user" | "environment") => {
    setReady(false);
    setError(null);
    stop();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 1707 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setReady(true);
      // Only show the flip control when there's more than one camera (phones).
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setMultiCam(devices.filter((d) => d.kind === "videoinput").length > 1);
      } catch { /* ignore */ }
    } catch (e) {
      const name = (e as DOMException)?.name;
      setError(name === "NotFoundError" || name === "OverconstrainedError" ? "missing" : "denied");
    }
  }, [stop]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("missing");
      return;
    }
    start("user");
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flip = () => {
    const next = facing === "user" ? "environment" : "user";
    setFacing(next);
    start(next);
  };

  const grab = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const scale = Math.min(1, MAX_W / video.videoWidth);
    const w = Math.round(video.videoWidth * scale);
    const h = Math.round(video.videoHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h); // capture un-mirrored (natural orientation)
    setShot(canvas.toDataURL("image/jpeg", 0.82));
  };

  const capture = () => {
    if (!timerOn) { grab(); return; }
    let n = 3;
    setCount(n);
    const tick = setInterval(() => {
      n -= 1;
      setCount(n);
      if (n <= 0) { clearInterval(tick); setCount(0); grab(); }
    }, 1000);
  };

  const confirm = () => {
    if (!shot) return;
    stop();
    onCapture(shot);
  };

  const close = () => { stop(); onClose(); };

  const mirror = facing === "user"; // selfie preview reads naturally when mirrored

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(10,10,12,0.92)", backdropFilter: "blur(6px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16 }}>
      {/* Close */}
      <button onClick={close} aria-label={t.camera.cancel}
        style={{ position: "absolute", top: 18, right: 18, width: 40, height: 40, borderRadius: 100, border: "none", background: "rgba(255,255,255,0.12)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
        <IconX size={20} />
      </button>

      <p style={{ color: "#fff", fontSize: 16, fontWeight: 500, marginBottom: 4 }}>{t.camera.title}</p>
      <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginBottom: 16, textAlign: "center", maxWidth: 360 }}>{t.camera.hint}</p>

      {/* Stage */}
      <div style={{ position: "relative", width: "min(92vw, 420px)", aspectRatio: "3/4", borderRadius: 16, overflow: "hidden", background: "#000", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
        {error ? (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24, gap: 16 }}>
            <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 14, lineHeight: 1.6 }}>
              {error === "missing" ? t.camera.noCamera : t.camera.denied}
            </p>
            {onPickFile && (
              <button onClick={() => { close(); onPickFile(); }}
                style={{ padding: "11px 18px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: 14, cursor: "pointer" }}>
                {t.camera.uploadInstead}
              </button>
            )}
          </div>
        ) : shot ? (
          <img src={shot} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <>
            <video ref={videoRef} playsInline muted autoPlay
              style={{ width: "100%", height: "100%", objectFit: "cover", transform: mirror ? "scaleX(-1)" : "none" }} />
            {/* Full-body framing guide */}
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: "44%", height: "86%", border: "2px dashed rgba(255,255,255,0.35)", borderRadius: "44% 44% 40% 40%" }} />
            </div>
            {!ready && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.7)", fontSize: 13 }}>
                {t.camera.starting}
              </div>
            )}
            {count > 0 && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 96, fontWeight: 200 }}>{count}</div>
            )}
          </>
        )}
      </div>

      {/* Controls */}
      {!error && (
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 22 }}>
          {shot ? (
            <>
              <button onClick={() => setShot(null)}
                style={{ padding: "12px 20px", borderRadius: 100, border: "1px solid rgba(255,255,255,0.25)", background: "transparent", color: "#fff", fontSize: 14, cursor: "pointer" }}>
                {t.camera.retake}
              </button>
              <button onClick={confirm}
                style={{ padding: "12px 22px", borderRadius: 100, border: "none", background: "#fff", color: "#111", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                <IconCheck size={16} /> {t.camera.usePhoto}
              </button>
            </>
          ) : (
            <>
              {multiCam && (
                <button onClick={flip} aria-label={t.camera.flip}
                  style={{ width: 48, height: 48, borderRadius: 100, border: "1px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.1)", color: "#fff", cursor: "pointer", fontSize: 18 }}>⟲</button>
              )}
              <button onClick={capture} disabled={!ready} aria-label={t.camera.capture}
                style={{ width: 72, height: 72, borderRadius: 100, border: "4px solid rgba(255,255,255,0.5)", background: "#fff", cursor: ready ? "pointer" : "default", opacity: ready ? 1 : 0.5, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <IconCamera size={26} />
              </button>
              <button onClick={() => setTimerOn((v) => !v)} aria-pressed={timerOn}
                style={{ width: 48, height: 48, borderRadius: 100, border: timerOn ? "1px solid #fff" : "1px solid rgba(255,255,255,0.25)", background: timerOn ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.1)", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>3s</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
