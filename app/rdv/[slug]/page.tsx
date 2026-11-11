"use client";
import { useEffect, useState } from "react";
import { CalendarCheck, Clock, MapPin, ChevronLeft, Video, Phone } from "lucide-react";
import Logo from "@/components/Logo";
import SlotPicker, { dayLabel } from "@/components/SlotPicker";
import { MiniLoader } from "@/components/LivLoader";
import ContactBlock from "@/components/ContactBlock";

type Info = { title: string; intro: string; duration: number; location: string; slots: Record<string, string[]> };

export default function Rdv({ params }: { params: { slug: string } }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState("");
  const [day, setDay] = useState("");
  const [time, setTime] = useState("");
  const [form, setForm] = useState({ name: "", email: "", note: "", website: "", mode: "visio", phone: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ day: string; time: string; end: string; mode: string; meet: string; manage: string } | null>(null);

  const load = () => fetch(`/api/booking/public/${params.slug}`).then(async (r) => {
    const j = await r.json();
    if (!r.ok) throw new Error(j.error);
    setInfo(j);
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

  return (
    <div className="rdv">
      <div className="rdv-card">
        <a className="logo-link" href="https://maderinoprod.com" target="_blank" rel="noreferrer" aria-label="maderinoprod.com"><Logo /></a>
        {!info && !error && <MiniLoader label="Recherche des créneaux libres" />}
        {!info && error && <><p className="neg">{error}</p><ContactBlock text="Pour prendre rendez-vous, contacte-moi directement." /></>}
        {info && done && (
          <div className="rdv-done">
            <CalendarCheck size={34} />
            <h1>C&apos;est noté !</h1>
            <p>{dayLabel(done.day)}, de {done.time} à {done.end}.</p>
            <p>{done.mode === "visio" ? "En visio, avec ce lien :" : `Je t'appelle sur WhatsApp au ${form.phone}.`}</p>
            {done.meet && <a className="link" href={done.meet} target="_blank" rel="noreferrer">{done.meet.replace("https://", "")}</a>}
            {form.email && <p className="muted">Une confirmation a été envoyée à {form.email}.</p>}
            {done.manage && <a className="link small" href={done.manage}>Déplacer ou annuler ce RDV</a>}
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

            {!time && <SlotPicker slots={info.slots} onPick={(d, t) => { setDay(d); setTime(t); }} />}

            {time && (
              <form className="rdv-form" onSubmit={book}>
                <button type="button" className="rdv-back" onClick={() => setTime("")}><ChevronLeft size={16} /> {dayLabel(day)} · {time}</button>
                <div className="rdv-modes">
                  <button type="button" className={form.mode === "visio" ? "on" : ""} onClick={() => setForm({ ...form, mode: "visio" })}><Video size={18} /> Visio</button>
                  <button type="button" className={form.mode === "whatsapp" ? "on" : ""} onClick={() => setForm({ ...form, mode: "whatsapp" })}><Phone size={18} /> Appel WhatsApp</button>
                </div>
                <input required placeholder="Ton nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                {form.mode === "visio"
                  ? <input required type="email" placeholder="Ton mail (pour recevoir le lien)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  : <>
                      <input required type="tel" inputMode="tel" placeholder="Ton numéro WhatsApp (ex : +33 6 12 34 56 78)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                      <input type="email" placeholder="Ton mail (facultatif, pour la confirmation)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                    </>}
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
