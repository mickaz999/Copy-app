"use client";
import { useEffect, useState } from "react";
import { CalendarCheck, CalendarX, ChevronLeft } from "lucide-react";
import Logo from "@/components/Logo";
import SlotPicker, { dayLabel } from "@/components/SlotPicker";

type Appt = { name: string; mode: string; day: string; time: string; end: string; meet: string; status: string; past: boolean; slots?: Record<string, string[]> };

// Page « gérer mon RDV » de la personne : déplacer ou annuler
export default function Gerer({ params }: { params: { token: string } }) {
  const [a, setA] = useState<Appt | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<"" | "move" | "cancel">("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState("");
  const url = `/api/booking/manage/${params.token}`;

  const load = () => fetch(url).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setA(j); }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function act(body: object, ok: string) {
    setBusy(true); setError("");
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setError(j.error ?? "Erreur, réessaie."); load(); return; }
    setView(""); setA({ ...a!, ...j }); setFlash(ok); load();
  }

  return (
    <div className="rdv">
      <div className="rdv-card">
        <Logo />
        {!a && !error && <p className="muted">Chargement…</p>}
        {error && <p className="neg">{error}</p>}
        {a && (
          <>
            <h1>{a.status === "cancelled" ? "RDV annulé" : "Ton RDV"}</h1>

            <div className={`rdv-summary ${a.status}`}>
              {a.status === "cancelled" ? <CalendarX size={22} /> : <CalendarCheck size={22} />}
              <div>
                <b>{dayLabel(a.day)}</b>
                <span>de {a.time} à {a.end} · {a.mode === "visio" ? "visio" : "appel WhatsApp"}</span>
                {a.status === "confirmed" && a.meet && <a className="link" href={a.meet} target="_blank" rel="noreferrer">{a.meet.replace("https://", "")}</a>}
              </div>
            </div>

            {a.status === "confirmed" && !a.past && view === "" && (
              <div className="rdv-actions">
                <button onClick={() => setView("move")}>Déplacer</button>
                <button className="danger" onClick={() => setView("cancel")}>Annuler</button>
              </div>
            )}

            {view === "move" && a.slots && (
              <>
                <button className="rdv-back" onClick={() => setView("")}><ChevronLeft size={16} /> Retour</button>
                <SlotPicker slots={a.slots} onPick={(day, time) => !busy && confirm(`Déplacer au ${dayLabel(day)} à ${time} ?`) && act({ action: "move", day, time }, "RDV déplacé !")} />
              </>
            )}

            {view === "cancel" && (
              <div className="rdv-form">
                <button className="rdv-back" onClick={() => setView("")}><ChevronLeft size={16} /> Retour</button>
                <textarea rows={3} placeholder="Un mot pour expliquer (facultatif)" value={message} onChange={(e) => setMessage(e.target.value)} />
                <button className="danger" disabled={busy} onClick={() => act({ action: "cancel", message }, "RDV annulé")}>Confirmer l&apos;annulation</button>
              </div>
            )}
          </>
        )}
      </div>
      {flash && a && (
        <div className="overlay" onClick={() => setFlash("")}>
          <div className="modal rdv-pop" onClick={(e) => e.stopPropagation()}>
            {a.status === "cancelled" ? <CalendarX size={36} /> : <CalendarCheck size={36} />}
            <h2>{flash}</h2>
            {a.status === "confirmed" && <p><b>{dayLabel(a.day)}</b><br />de {a.time} à {a.end}</p>}
            <p className="muted small">{a.status === "cancelled" ? "Le créneau a été libéré." : "Une confirmation t'a été envoyée par mail."}</p>
            <button className="primary" onClick={() => setFlash("")}>OK</button>
          </div>
        </div>
      )}
    </div>
  );
}
