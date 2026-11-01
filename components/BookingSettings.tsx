"use client";
import { useEffect, useState } from "react";
import { CalendarClock, Copy, ExternalLink, Plus, RefreshCw, X } from "lucide-react";
import { api } from "@/lib/api";

type Booking = { enabled: boolean; slug: string; title: string; intro: string; duration: number; step: number; buffer: number; minNotice: number; maxDays: number; hours: string; calendar: string; location: string };
type Hours = Record<string, [string, string][]>;

const DAYS = [["1", "Lundi"], ["2", "Mardi"], ["3", "Mercredi"], ["4", "Jeudi"], ["5", "Vendredi"], ["6", "Samedi"], ["0", "Dimanche"]];

// Réglages du lien public de prise de RDV
export default function BookingSettings({ calendars }: { calendars: { id: string; name: string }[] }) {
  const [b, setB] = useState<Booking | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { api<Booking>("booking").then(setB); }, []);
  if (!b) return null;

  const hours: Hours = JSON.parse(b.hours || "{}");
  const link = `${window.location.origin}/rdv/${b.slug}`;
  const save = async (next: Booking) => { setB(next); setB(await api<Booking>("booking", "POST", { ...next, hours: JSON.parse(next.hours) })); };
  const setHours = (h: Hours) => save({ ...b, hours: JSON.stringify(h) });
  const num = (k: keyof Booking, opts: number[], label: (n: number) => string) => (
    <select value={b[k] as number} onChange={(e) => save({ ...b, [k]: Number(e.target.value) })}>
      {opts.map((n) => <option key={n} value={n}>{label(n)}</option>)}
    </select>
  );

  return (
    <section className="settings-card">
      <div className="sc-head"><CalendarClock size={18} /> <h3>Lien de prise de RDV</h3></div>
      <p className="muted">Les gens choisissent un créneau libre sur ce lien. Tout ce qui a un horaire dans tes agendas visibles et tes tâches compte comme occupé. Le RDV est ajouté à l&apos;agenda choisi et la personne reçoit une invitation.</p>
      <label className="check-line"><input type="checkbox" checked={b.enabled} onChange={(e) => save({ ...b, enabled: e.target.checked })} /> Activer le lien</label>

      {b.enabled && (
        <div className="row">
          <button className="primary" onClick={() => { navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}><Copy size={16} /> {copied ? "Copié !" : "Copier le lien"}</button>
          <button onClick={() => window.open(link, "_blank")}><ExternalLink size={16} /> Voir</button>
          <button onClick={async () => confirm("L'ancien lien ne marchera plus. Continuer ?") && setB(await api<Booking>("booking", "POST", { regenerate: true }))}><RefreshCw size={16} /> Nouveau lien</button>
        </div>
      )}

      <label className="field-line">Agenda où ajouter les RDV
        <select value={b.calendar} onChange={(e) => save({ ...b, calendar: e.target.value })}>
          <option value="">Choisir…</option>
          {calendars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      {b.enabled && !b.calendar && <p className="neg small">Choisis un agenda, sinon personne ne pourra réserver.</p>}

      <label className="field-line">Titre de la page
        <input defaultValue={b.title} onBlur={(e) => e.target.value !== b.title && save({ ...b, title: e.target.value })} />
      </label>
      <label className="field-line">Message (facultatif)
        <textarea rows={2} defaultValue={b.intro} onBlur={(e) => e.target.value !== b.intro && save({ ...b, intro: e.target.value })} />
      </label>
      <label className="field-line">Lieu ou lien visio (facultatif)
        <input defaultValue={b.location} onBlur={(e) => e.target.value !== b.location && save({ ...b, location: e.target.value })} />
      </label>

      <label className="field-line">Durée d&apos;un RDV {num("duration", [15, 20, 30, 45, 60, 90, 120], (n) => n < 60 ? `${n} min` : `${n / 60} h`)}</label>
      <label className="field-line">Un créneau toutes les {num("step", [15, 30, 60], (n) => n < 60 ? `${n} min` : "1 h")}</label>
      <label className="field-line">Marge autour de tes événements {num("buffer", [0, 5, 10, 15, 30, 60], (n) => n ? `${n} min` : "Aucune")}</label>
      <label className="field-line">Délai minimum avant un RDV {num("minNotice", [0, 1, 2, 4, 12, 24, 48, 72], (n) => n ? `${n} h` : "Aucun")}</label>
      <label className="field-line">Réservable jusqu&apos;à {num("maxDays", [7, 14, 30, 60, 90], (n) => `${n} jours à l'avance`)}</label>

      <div className="field-line">Horaires proposés (heure de Paris)</div>
      {DAYS.map(([d, name]) => {
        const ranges = hours[d] ?? [];
        const setRanges = (r: [string, string][]) => setHours({ ...hours, [d]: r });
        return (
          <div key={d} className="hours-row">
            <b>{name}</b>
            {ranges.length === 0 && <span className="muted">Indisponible</span>}
            {ranges.map(([a, z], i) => (
              <span key={i} className="hours-row">
                <input type="time" value={a} onChange={(e) => setRanges(ranges.map((r, j) => j === i ? [e.target.value, r[1]] : r))} />
                –
                <input type="time" value={z} onChange={(e) => setRanges(ranges.map((r, j) => j === i ? [r[0], e.target.value] : r))} />
                <button className="ghost" aria-label="Retirer" onClick={() => setRanges(ranges.filter((_, j) => j !== i))}><X size={14} /></button>
              </span>
            ))}
            <button className="ghost" aria-label="Ajouter une plage" onClick={() => setRanges([...ranges, ranges.length ? ["14:00", "18:00"] : ["09:00", "12:00"]])}><Plus size={14} /></button>
          </div>
        );
      })}
    </section>
  );
}
