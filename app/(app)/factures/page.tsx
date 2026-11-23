"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Plus, Send, Settings2, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";

type Item = { label: string; qty: number; price: number };
type Inv = { id: string; number: string; client: string; email: string; address: string; siret: string; date: string; dueDate: string | null; items: string; notes: string; status: string; sentAt: string | null; paidAt: string | null; url: string; total: number };
type Cfg = { name: string; address: string; siret: string; email: string; phone: string; iban: string; bic: string; dueDays: number; mentions: string };
type Draft = { id?: string; client: string; email: string; address: string; siret: string; date: string; dueDate: string; notes: string; items: Item[] };
type C = { name: string; emails: string[] };

const STATUS: Record<string, string> = { draft: "Brouillon", sent: "Envoyée", paid: "Payée" };
const euro = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const day = (s: string | null) => (s ? s.slice(0, 10) : "");
const errOf = (e: any) => { let m = String(e?.message ?? e); try { m = JSON.parse(m).error ?? m; } catch {} return m; };
const empty = (): Draft => ({ client: "", email: "", address: "", siret: "", date: new Date().toISOString().slice(0, 10), dueDate: "", notes: "", items: [{ label: "", qty: 1, price: 0 }] });

export default function Factures() {
  const [list, setList] = useState<Inv[]>([]);
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [clients, setClients] = useState<C[]>([]);
  const [showCfg, setShowCfg] = useState(false);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [mail, setMail] = useState<{ inv: Inv; to: string; subject: string; body: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = () => api<{ list: Inv[]; config: Cfg }>("invoices").then((r) => { setList(r.list); setCfg(r.config); }).catch(() => {});
  useEffect(() => { load(); api<C[]>("clients").then(setClients).catch(() => {}); }, []);

  const saveCfg = (c = cfg) => c && api("invoices", "POST", { config: c });
  const total = (items: Item[]) => items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.price) || 0), 0);

  async function saveDraft(thenSend: boolean) {
    if (!edit) return;
    if (!edit.client.trim()) { setMsg("Erreur : nom du client requis"); return; }
    setBusy(true); setMsg("");
    try {
      const body = { ...edit, items: edit.items.filter((i) => i.label.trim() || i.price), dueDate: edit.dueDate || null };
      const inv = await api<Inv>("invoices", "POST", body);
      await load();
      setEdit(null);
      if (thenSend) openMail({ ...inv, total: total(body.items) } as Inv);
      else setMsg(`Facture ${inv.number} enregistrée ✓`);
    } catch (e) { setMsg(`Erreur : ${errOf(e)}`); }
    setBusy(false);
  }

  function openMail(inv: Inv) {
    const first = inv.client.split(" ")[0];
    setMail({ inv, to: inv.email, subject: `Facture ${inv.number}${cfg?.name ? ` · ${cfg.name}` : ""}`, body: `Bonjour ${first},\n\nVoici la facture ${inv.number} d'un montant de ${euro(inv.total)}. Merci pour ta confiance !\n\nBonne journée,` });
  }

  async function send() {
    if (!mail) return;
    setBusy(true); setMsg("");
    try {
      await api("invoices/send", "POST", { id: mail.inv.id, to: mail.to, subject: mail.subject, body: mail.body });
      setMail(null); setMsg(`Facture envoyée à ${mail.to} ✓`); load();
    } catch (e) { setMsg(`Erreur : ${errOf(e)}`); }
    setBusy(false);
  }

  const act = async (b: object) => { try { await api("invoices", "POST", b); load(); } catch (e) { setMsg(`Erreur : ${errOf(e)}`); } };
  const pickClient = (name: string) => {
    if (!edit) return;
    const c = clients.find((x) => x.name === name);
    setEdit({ ...edit, client: name, email: edit.email || c?.emails?.[0] || "" });
  };
  const missingCfg = cfg && (!cfg.name.trim() || !cfg.siret.trim() || !cfg.address.trim());
  const due = list.filter((i) => i.status === "sent").reduce((s, i) => s + i.total, 0);

  return (
    <div className="content narrow">
      <div className="eyebrow">factures</div>
      <h1 className="title">facture tes clients <span className="accent">en deux minutes.</span></h1>
      <p className="muted">Entre les infos du client et les prestations, puis envoie : le client reçoit un mail (depuis ton Gmail) avec un lien vers sa facture, qu'il peut télécharger en PDF. Une fois payée, coche-la : la recette s'ajoute toute seule dans Compta.</p>

      <div className="row" style={{ margin: "10px 0" }}>
        <button className="primary" onClick={() => { setEdit(empty()); setMsg(""); }}><Plus size={15} /> Nouvelle facture</button>
        <button className="ghost" onClick={() => setShowCfg(!showCfg)}><Settings2 size={15} /> Mes infos</button>
        {due > 0 && <span className="muted">En attente de paiement : <b>{euro(due)}</b></span>}
        {msg && <span className="muted" style={msg.startsWith("Erreur") ? { color: "var(--red)" } : {}}>{msg}</span>}
      </div>

      {missingCfg && !showCfg && <p className="muted small">⚠️ Remplis d'abord <a className="link" onClick={() => setShowCfg(true)} style={{ cursor: "pointer" }}>tes infos</a> (nom, adresse, SIRET) : elles sont obligatoires sur une facture.</p>}

      {showCfg && cfg && (
        <section className="settings-card" style={{ display: "grid", gap: 8 }}>
          <b>Mes infos (émetteur)</b>
          {([["name", "Nom / nom commercial"], ["siret", "SIRET"], ["email", "Mail"], ["phone", "Téléphone"], ["iban", "IBAN"], ["bic", "BIC"]] as const).map(([k, p]) => (
            <input key={k} placeholder={p} value={cfg[k]} onChange={(e) => setCfg({ ...cfg, [k]: e.target.value })} onBlur={() => saveCfg()} />
          ))}
          <textarea rows={3} placeholder="Adresse" value={cfg.address} onChange={(e) => setCfg({ ...cfg, address: e.target.value })} onBlur={() => saveCfg()} />
          <label className="field-line">Échéance par défaut (jours)
            <input type="number" min={0} value={cfg.dueDays} onChange={(e) => setCfg({ ...cfg, dueDays: Number(e.target.value) })} onBlur={() => saveCfg()} style={{ width: 90 }} />
          </label>
          <span className="muted small">Mentions en bas de facture</span>
          <textarea rows={4} value={cfg.mentions} onChange={(e) => setCfg({ ...cfg, mentions: e.target.value })} onBlur={() => saveCfg()} />
        </section>
      )}

      {list.length === 0 && <p className="muted">Aucune facture pour l'instant.</p>}
      {list.map((i) => (
        <section key={i.id} className="settings-card">
          <div className="liv-row">
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>{i.number}</b> <span className="muted">· {i.client}</span> · <b>{euro(i.total)}</b>
              <div className="muted small">{STATUS[i.status]} · {new Date(i.date).toLocaleDateString("fr-FR")}{i.sentAt && ` · envoyée le ${new Date(i.sentAt).toLocaleDateString("fr-FR")}`}{i.paidAt && ` · payée le ${new Date(i.paidAt).toLocaleDateString("fr-FR")}`}</div>
            </div>
            <a className="ghost" href={i.url} target="_blank" rel="noreferrer" title="Voir / PDF"><ExternalLink size={15} /></a>
            {i.status === "draft" && <button className="ghost" onClick={() => setEdit({ id: i.id, client: i.client, email: i.email, address: i.address, siret: i.siret, date: day(i.date), dueDate: day(i.dueDate), notes: i.notes, items: JSON.parse(i.items || "[]") })}>Modifier</button>}
            <button className="ghost" onClick={() => openMail(i)}><Send size={15} /> {i.sentAt ? "Renvoyer" : "Envoyer"}</button>
            <button className={i.status === "paid" ? "primary" : ""} title={i.status === "paid" ? "Annuler le paiement" : "Marquer payée (ajoute la recette dans Compta)"} onClick={() => act({ id: i.id, paid: i.status !== "paid" })}><CheckCircle2 size={15} /> {i.status === "paid" ? "Payée" : "Payée ?"}</button>
            {i.status === "draft" && <button className="ghost" title="Supprimer" onClick={() => confirm(`Supprimer le brouillon ${i.number} ?`) && act({ id: i.id, delete: true })}><Trash2 size={15} /></button>}
          </div>
        </section>
      ))}

      {edit && (
        <div onClick={() => setEdit(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "grid", placeItems: "center", zIndex: 100, padding: 16 }}>
          <div className="settings-card" onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 640, display: "grid", gap: 8, background: "var(--card)", maxHeight: "90vh", overflow: "auto" }}>
            <div className="row" style={{ justifyContent: "space-between" }}><b>{edit.id ? "Modifier la facture" : "Nouvelle facture"}</b><button className="ghost" onClick={() => setEdit(null)}><X size={16} /></button></div>
            <input list="inv-clients" placeholder="Client (nom ou entreprise)" value={edit.client} onChange={(e) => pickClient(e.target.value)} />
            <datalist id="inv-clients">{clients.map((c) => <option key={c.name} value={c.name} />)}</datalist>
            <input type="email" placeholder="Mail du client" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
            <textarea rows={2} placeholder="Adresse du client" value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} />
            <input placeholder="SIRET / n° TVA du client (si pro, facultatif)" value={edit.siret} onChange={(e) => setEdit({ ...edit, siret: e.target.value })} />
            <div className="row">
              <label className="field-line">Date <input type="date" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} /></label>
              <label className="field-line">Échéance <input type="date" value={edit.dueDate} placeholder="auto" onChange={(e) => setEdit({ ...edit, dueDate: e.target.value })} /></label>
            </div>
            <b>Prestations</b>
            {edit.items.map((it, k) => {
              const up = (p: Partial<Item>) => setEdit({ ...edit, items: edit.items.map((x, j) => (j === k ? { ...x, ...p } : x)) });
              return (
                <div key={k} className="row">
                  <input style={{ flex: 1 }} placeholder="Désignation (ex. Montage vidéo YouTube)" value={it.label} onChange={(e) => up({ label: e.target.value })} />
                  <input type="number" min={0} step="any" style={{ width: 70 }} title="Quantité" value={it.qty} onChange={(e) => up({ qty: Number(e.target.value) })} />
                  <input type="number" min={0} step="any" style={{ width: 100 }} title="Prix unitaire (€)" value={it.price} onChange={(e) => up({ price: Number(e.target.value) })} />
                  <button className="ghost" onClick={() => setEdit({ ...edit, items: edit.items.filter((_, j) => j !== k) })}><Trash2 size={14} /></button>
                </div>
              );
            })}
            <div className="row" style={{ justifyContent: "space-between" }}>
              <button className="ghost" onClick={() => setEdit({ ...edit, items: [...edit.items, { label: "", qty: 1, price: 0 }] })}><Plus size={14} /> Ligne</button>
              <b>Total : {euro(total(edit.items))}</b>
            </div>
            <textarea rows={2} placeholder="Note sur la facture (facultatif)" value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
            {msg.startsWith("Erreur") && <div className="muted" style={{ color: "var(--red)" }}>{msg}</div>}
            <div className="row">
              <button disabled={busy} onClick={() => saveDraft(false)}>Enregistrer</button>
              <button className="primary" disabled={busy} onClick={() => saveDraft(true)}><Send size={15} /> Enregistrer et envoyer</button>
            </div>
          </div>
        </div>
      )}

      {mail && (
        <div onClick={() => setMail(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "grid", placeItems: "center", zIndex: 100, padding: 16 }}>
          <div className="settings-card" onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, display: "grid", gap: 8, background: "var(--card)", maxHeight: "90vh", overflow: "auto" }}>
            <div className="row" style={{ justifyContent: "space-between" }}><b>Envoyer {mail.inv.number}</b><button className="ghost" onClick={() => setMail(null)}><X size={16} /></button></div>
            <input type="email" placeholder="À" value={mail.to} onChange={(e) => setMail({ ...mail, to: e.target.value })} />
            <input placeholder="Objet" value={mail.subject} onChange={(e) => setMail({ ...mail, subject: e.target.value })} />
            <textarea rows={7} value={mail.body} onChange={(e) => setMail({ ...mail, body: e.target.value })} />
            <div className="muted small">Un bouton « Voir la facture » est ajouté sous ton message.</div>
            {msg.startsWith("Erreur") && <div className="muted" style={{ color: "var(--red)" }}>{msg}</div>}
            <div><button className="primary" disabled={busy} onClick={send}><Send size={15} /> {busy ? "Envoi…" : "Envoyer"}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
