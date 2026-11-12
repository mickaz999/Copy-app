"use client";
import { useState } from "react";
import { Mic, Square } from "lucide-react";

const tc = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// Enregistrement d'un message vocal (3 min max), renvoyé en data URL
export default function VoiceButton({ onDone }: { onDone: (dataUrl: string) => void }) {
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [secs, setSecs] = useState(0);
  const [err, setErr] = useState("");
  async function start() {
    setErr("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const r = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 48000 } : undefined);
      const parts: Blob[] = [];
      r.ondataavailable = (e) => parts.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const fr = new FileReader();
        fr.onload = () => onDone(String(fr.result));
        fr.readAsDataURL(new Blob(parts, { type: r.mimeType || "audio/webm" }));
        setRec(null);
      };
      r.start();
      setRec(r); setSecs(0);
      const started = Date.now();
      const t = setInterval(() => {
        const sec = Math.floor((Date.now() - started) / 1000);
        setSecs(sec);
        if (sec >= 180 || r.state !== "recording") { clearInterval(t); if (r.state === "recording") r.stop(); }
      }, 250);
    } catch { setErr("Micro non autorisé"); }
  }
  return rec
    ? <button type="button" className="liv-rec on" onClick={() => rec.stop()}><Square size={12} fill="currentColor" /> {tc(secs)} · Arrêter</button>
    : <button type="button" className="liv-rec" onClick={start} title={err || "Laisser un message vocal"}><Mic size={15} /> {err || "Vocal"}</button>;
}
