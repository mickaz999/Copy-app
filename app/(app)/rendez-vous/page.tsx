"use client";
import { useEffect, useState } from "react";
import { CalendarClock, Mail, MessageCircle, Phone, Video, X } from "lucide-react";
import { api } from "@/lib/api";
import SlotPicker, { dayLabel } from "@/components/SlotPicker";

type Appt = { id: string; name: string; email: string; phone: string; mode: string; note: string; day: string; time: string; end: string; start: string; meet: string; status: string };
type Action = { a: Appt; kind: "move" | "cancel" };

const errorText = (e: unknown) => { const raw = (e as Error).message; try { return JSON.parse(raw).error ?? raw; } catch { return raw; } };

export default function RendezVous() {
  const [list, setList] = useState<Appt[] | null>(null);
  const [act, setAct] = useState<Action | null>(null);
  const [slots, setSlots] = useState<Record<string, string[]> | null>(null);
  const [message, setMessage] = useState("");
  const [manual, setManual] = useState({ day: "", time: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () => api<Appt[]>("rdv").then(setList);
  useEffect(() => { load(); }, []);

  function open(a: Appt, kind: Action["kind"]) {
    setAct({ a, kind }); setMessage(""); setSlots(null); setManual({ day: a.day, time: a.time });
    if (kind === "move") api<{ slots: Record<string, string[]> }>(`rdv/${a.id}`).then((r) => setSlots(r.slots));
  }

  async function run(body: object, ok: string) {
    setBusy(true);
    try {
      await api(`rdv/${act!.a.id}`, "POST", { ...body, message });
      setMsg({ ok: true, text: ok }); setAct(null); load();
    } catch (e) { setMsg({ ok: false, text: errorText(e) }); }
    finally { setBusy(false); }
  }

  if (!list) return <div className="content muted">Chargement…</div>;
  const now = Date.now();
  const upcoming = list.filter((a) => a.status === "confirmed" && Date.parse(a.start) >= now - 36e5);
  const past = list.filter((a) => a.status === "confirmed" && Date.parse(a.start) < now - 36e5).reverse();
  const cancelled = list.filter((a) => a.status === "cancelled");
  const warn = (a: Appt) => a.email ? `${a.name} sera prévenu·e par mail (${a.email}).` : `${a.name} n'a pas laissé de mail : préviens-le·la sur WhatsApp.`;

  const card = (a: Appt, actions: boolean) => (
    <div key={a.id} className={`appt ${a.status}`}>
      <div className="appt-when"><b>{dayLabel(a.day)}</b><span>{a.time} – {a.end}</span></div>
      <div className="appt-who">
        <b>{a.name}</b>
        <span className="appt-mode">{a.mode === "visio" ? <><Video size={14} /> Visio</> : <><Phone size={14} /> WhatsApp</>}</span>
        {a.note && <p className="muted small">{a.note}</p>}
        <div className="appt-links">
          {a.email && <a href={`mailto:${a.email}`}><Mail size={14} /> {a.email}</a>}
          {a.phone && <a href={`https://wa.me/${a.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"><MessageCircle size={14} /> {a.phone}</a>}
          {a.meet && a.status === "confirmed" && <a href={a.meet} target="_blank" rel="noreferrer"><Video size={14} /> Rejoindre</a>}
        </div>
      </div>
      {actions && (
        <div className="appt-actions">
          <button onClick={() => open(a, "move")}>Reporter</button>
          <button className="danger" onClick={() => open(a, "cancel")}>Annuler</button>
        </div>
      )}
      {a.status === "cancelled" && <button className="ghost" title="Retirer de la liste" onClick={async () => { await api(`rdv/${a.id}`, "POST", { action: "delete" }); load(); }}><X size={15} /></button>}
    </div>
  );

  return (
    <div className="content narrow">
      <div className="eyebrow">rendez-vous</div>
      <h1 className="title">tes <span className="accent">rdv.</span></h1>
      {msg && <div className={`notice ${msg.ok ? "ok" : "err"}`} onClick={() => setMsg(null)}>{msg.text}</div>}

      <section className="settings-card">
        <div className="sc-head"><CalendarClock size={18} /> <h3>À venir ({upcoming.length})</h3></div>
        {upcoming.length ? upcoming.map((a) => card(a, true)) : <p className="muted">Aucun RDV prévu.</p>}
      </section>
      {cancelled.length > 0 && <section className="settings-card"><h3>Annulés</h3>{cancelled.map((a) => card(a, false))}</section>}
      {past.length > 0 && <section className="settings-card"><h3>Passés (30 derniers jours)</h3>{past.map((a) => card(a, false))}</section>}

      {act && (
        <div className="overlay" onClick={() => !busy && setAct(null)}>
          <div className="modal appt-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{act.kind === "move" ? "Reporter" : "Annuler"} le RDV de {act.a.name}</h3>
            <p className="muted small">{dayLabel(act.a.day)}, {act.a.time} – {act.a.end}. {warn(act.a)}</p>
            <textarea rows={3} placeholder={act.kind === "move" ? "Message joint (ex : désolé, un imprévu…)" : "Raison de l'annulation (jointe au mail)"} value={message} onChange={(e) => setMessage(e.target.value)} />
            {act.kind === "cancel" && (
              <div className="row">
                <button onClick={() => setAct(null)}>Retour</button>
                <button className="danger" disabled={busy} onClick={() => run({ action: "cancel" }, `RDV de ${act.a.name} annulé.`)}>Annuler le RDV</button>
              </div>
            )}
            {act.kind === "move" && (
              <>
                <span className="rdv-group-label">Créneaux libres</span>
                {slots ? <SlotPicker slots={slots} onPick={(day, time) => !busy && run({ action: "move", day, time }, `RDV déplacé au ${dayLabel(day)} à ${time}.`)} /> : <p className="muted">Chargement…</p>}
                <span className="rdv-group-label">Ou un autre horaire</span>
                <div className="row">
                  <input type="date" value={manual.day} onChange={(e) => setManual({ ...manual, day: e.target.value })} />
                  <input type="time" value={manual.time} onChange={(e) => setManual({ ...manual, time: e.target.value })} />
                  <button disabled={busy || !manual.day || !manual.time} onClick={() => run({ action: "move", ...manual, force: true }, `RDV déplacé au ${dayLabel(manual.day)} à ${manual.time}.`)}>Déplacer</button>
                </div>
                <button onClick={() => setAct(null)}>Fermer</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
