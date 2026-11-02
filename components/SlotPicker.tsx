"use client";
import { useState } from "react";

const part = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { ...o, timeZone: "UTC" }).replace(".", "");
export const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

const GROUPS: [string, (t: string) => boolean][] = [["Matin", (t) => t < "12:00"], ["Après-midi", (t) => t >= "12:00" && t < "18:00"], ["Soir", (t) => t >= "18:00"]];

// Choix d'un jour puis d'un créneau libre ({ "YYYY-MM-DD": ["HH:MM", …] })
export default function SlotPicker({ slots, onPick }: { slots: Record<string, string[]>; onPick: (day: string, time: string) => void }) {
  const days = Object.keys(slots);
  const [day, setDay] = useState(days[0] ?? "");
  const current = slots[day] ? day : days[0] ?? "";
  if (!days.length) return <p className="muted">Aucun créneau disponible pour le moment.</p>;
  return (
    <>
      <div className="rdv-days">
        {days.map((d) => (
          <button key={d} type="button" className={d === current ? "on" : ""} onClick={() => setDay(d)}>
            <small>{part(d, { weekday: "short" })}</small>
            <b>{part(d, { day: "numeric" })}</b>
            <small>{part(d, { month: "short" })}</small>
          </button>
        ))}
      </div>
      <p className="rdv-day">{dayLabel(current)}</p>
      {GROUPS.map(([label, keep]) => {
        const list = (slots[current] ?? []).filter(keep);
        return list.length > 0 && (
          <div key={label} className="rdv-group">
            <span className="rdv-group-label">{label}</span>
            <div className="rdv-slots">{list.map((t) => <button key={t} type="button" onClick={() => onPick(current, t)}>{t}</button>)}</div>
          </div>
        );
      })}
    </>
  );
}
