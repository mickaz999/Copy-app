"use client";
import { useEffect, useState } from "react";
import { CalendarCheck, Clock, MapPin, ChevronLeft } from "lucide-react";
import Logo from "@/components/Logo";

type Info = { title: string; intro: string; duration: number; location: string; slots: Record<string, string[]> };

const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

export default function Rdv({ params }: { params: { slug: string } }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState("");
  const [day, setDay] = useState("");
  const [time, setTime] = useState("");
  const [form, setForm] = useState({ name: "", email: "", note: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ day: string; time: string; end: string } | null>(null);

  const load = () => fetch(`/api/booking/public/${params.slug}`).then(async (r) => {
    const j = await r.json();
    if (!r.ok) throw new Error(j.error);
    setInfo(j);
    setDay((d) => (j.slots[d] ? d : Object.keys(j.slots)[0] ?? ""));
  }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function book(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const r = await fetch(`/api/booking/public/${params.slug}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, day, time }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) setDone(j);
    else { setError(j.error ?? "Erreur, réessaie."); setTime(""); load(); }
  }

  const days = info ? Object.keys(info.slots) : [];

  return (
    <div className="rdv">
      <div className="rdv-card">
        <Logo />
        {!info && !error && <p className="muted">Chargement…</p>}
        {!info && error && <p className="neg">{error}</p>}
        {info && done && (
          <div className="rdv-done">
            <CalendarCheck size={34} />
            <h1>C&apos;est noté !</h1>
            <p>{dayLabel(done.day)}, de {done.time} à {done.end}.</p>
            <p className="muted">Une invitation a été envoyée à {form.email}.</p>
          </div>
        )}
        {info && !done && (
          <>
            <h1>{info.title}</h1>
            {info.intro && <p className="muted rdv-intro">{info.intro}</p>}
            <div className="rdv-meta">
              <span><Clock size={15} /> {info.duration} min</span>
              {info.location && <span><MapPin size={15} /> {info.location}</span>}
            </div>
            {error && <p className="neg">{error}</p>}

            {!time && (days.length === 0
              ? <p className="muted">Aucun créneau disponible pour le moment.</p>
              : <>
                  <div className="rdv-days">
                    {days.map((d) => (
                      <button key={d} className={d === day ? "primary" : ""} onClick={() => setDay(d)}>
                        <small>{dayLabel(d).split(" ")[0]}</small>
                        <b>{dayLabel(d).split(" ").slice(1).join(" ")}</b>
                      </button>
                    ))}
                  </div>
                  <div className="rdv-slots">
                    {(info.slots[day] ?? []).map((t) => <button key={t} onClick={() => setTime(t)}>{t}</button>)}
                  </div>
                </>)}

            {time && (
              <form className="rdv-form" onSubmit={book}>
                <button type="button" className="rdv-back" onClick={() => setTime("")}><ChevronLeft size={16} /> {dayLabel(day)} · {time}</button>
                <input required placeholder="Ton nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <input required type="email" placeholder="Ton mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                <textarea placeholder="Un mot sur le sujet du RDV (facultatif)" rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
                <input className="rdv-hp" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
                <button className="primary" disabled={busy}>{busy ? "Réservation…" : "Confirmer le RDV"}</button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
