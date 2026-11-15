"use client";
import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

const BARS = 36;
const tc = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const cache = new Map<string, number[]>();

// Message vocal façon WhatsApp : bouton lecture, ondes (calculées depuis le son), durée ; touche les ondes pour avancer
export default function VoicePlayer({ src }: { src: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [peaks, setPeaks] = useState<number[]>(() => cache.get(src) ?? []);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);

  useEffect(() => {
    if (cache.has(src)) return;
    let off = false;
    (async () => {
      try {
        const buf = await (await fetch(src)).arrayBuffer();
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        const data = await ctx.decodeAudioData(buf);
        ctx.close().catch(() => {});
        const ch = data.getChannelData(0);
        const step = Math.floor(ch.length / BARS) || 1;
        const raw = Array.from({ length: BARS }, (_, i) => {
          let max = 0;
          for (let j = i * step; j < Math.min(ch.length, (i + 1) * step); j += 16) max = Math.max(max, Math.abs(ch[j]));
          return max;
        });
        const top = Math.max(...raw, 0.01);
        const p = raw.map((x) => Math.max(0.12, x / top));
        cache.set(src, p);
        if (!off) { setPeaks(p); if (!dur) setDur(data.duration); }
      } catch {
        // Ondes génériques si le son ne peut pas être analysé
        const p = Array.from({ length: BARS }, (_, i) => 0.3 + 0.5 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6)));
        if (!off) setPeaks(p);
      }
    })();
    return () => { off = true; };
  }, [src]);

  const toggle = () => { const a = audio.current; if (!a) return; a.paused ? a.play().catch(() => {}) : a.pause(); };
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audio.current; if (!a || !dur) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = Math.min(dur, Math.max(0, ((e.clientX - r.left) / r.width) * dur));
    if (a.paused) a.play().catch(() => {});
  };
  const progress = dur ? t / dur : 0;

  return (
    <div className="vp">
      <audio ref={audio} src={src} preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setT(0); }}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)} onLoadedMetadata={(e) => { if (Number.isFinite(e.currentTarget.duration)) setDur(e.currentTarget.duration); }} />
      <button type="button" className="vp-btn" onClick={toggle} aria-label={playing ? "Pause" : "Lecture"}>{playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}</button>
      <div className="vp-wave" onClick={seek}>
        {(peaks.length ? peaks : Array(BARS).fill(0.25)).map((h, i) => (
          <span key={i} className={i / BARS < progress ? "on" : ""} style={{ height: `${Math.round(h * 100)}%` }} />
        ))}
      </div>
      <span className="vp-time">{tc(playing || t ? t : dur)}</span>
    </div>
  );
}
