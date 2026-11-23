"use client";
import { useEffect, useRef } from "react";

// Sélecteur en roulette (façon iPhone) : on fait défiler, la valeur au centre est choisie
const ITEM = 34;

export default function Wheel({ label, values, value, format, onChange }: {
  label: string; values: number[]; value: number; format: (v: number) => string; onChange: (v: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const idx = Math.max(0, values.findIndex((v) => v >= value));

  // Place la roulette sur la valeur actuelle (au montage et quand elle change ailleurs)
  useEffect(() => {
    const el = ref.current;
    if (el && Math.abs(el.scrollTop - idx * ITEM) > ITEM / 2) el.scrollTop = idx * ITEM;
  }, [idx]);

  const onScroll = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const i = Math.min(values.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM)));
      if (values[i] !== value) onChange(values[i]);
    }, 90);
  };

  return (
    <div className="wheel-box">
      <div className="wheel-label">{label}</div>
      <div className="wheel">
        <div className="wheel-band" />
        <div ref={ref} className="wheel-scroll" onScroll={onScroll}>
          <div style={{ height: ITEM }} />
          {values.map((v, i) => (
            <div key={v} className={`wheel-item ${i === idx ? "on" : ""}`} onClick={() => { ref.current?.scrollTo({ top: i * ITEM, behavior: "smooth" }); onChange(v); }}>
              {format(v)}
            </div>
          ))}
          <div style={{ height: ITEM }} />
        </div>
      </div>
    </div>
  );
}

export const range = (min: number, max: number, step: number) => {
  const out: number[] = [];
  for (let v = min; v <= max + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
};
