"use client";
import { useEffect, useState } from "react";
import { ExternalLink, FileCode, FileDown, Plus, Send, Settings2, Trash2 } from "lucide-react";
import { api, eur, isoDay } from "@/lib/api";

type Buyer = { name: string; siren: string; address: string; zip: string; city: string; email: string; vat: string };
type Line = { label: string; qty: number; unitPrice: number };
type Inv = {
  id: string; number: string; date: string; dueDate: string; client: string; buyer: string; lines: string;
  note: string; status: "draft" | "sent" | "paid"; deposited: boolean; error: string; sentAt: string | null;
};
type Seller = { name: string; siren: string; address: string; zip: string; city: string; email: string; vat: string; iban: string; vatRate: number; vatNote: string; dueDays: number; logo: string };
type Edit = { id?: string; number?: string; date: string; dueDate: string; buyer: Buyer; lines: Line[]; note: string; status?: Inv["status"]; error?: string };

const EMPTY_BUYER: Buyer = { name: "", siren: "", address: "", zip: "", city: "", email: "", vat: "" };
const STATUS = { draft: "Brouillon", sent: "Émise", paid: "Payée" } as const;
const parse = <T,>(s: string, d: T): T => { try { return JSON.parse(s) as T; } catch { return d; } };
const totalOf = (lines: Line[], rate: number) => { const ht = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0); return { ht, ttc: ht * (1 + rate / 100) }; };

export default function Factures() {
  const [list, setList] = useState<Inv[]>([]);
  const [seller, setSeller] = useState<Seller | null>(null);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = () => api<{ invoices: Inv[]; settings: Seller }>("invoices").then((r) => { setList(r.invoices); setSeller(r.settings); });
  useEffect(() => { load(); }, []);

  const rate = seller?.vatRate ?? 0;
  const open = (i: Inv) => setEdit({ id: i.id, number: i.number, date: i.date.slice(0, 10), dueDate: i.dueDate.slice(0, 10), buyer: { ...EMPTY_BUYER, ...parse(i.buyer, {}) }, lines: parse(i.lines, []), note: i.note, status: i.status, error: i.error });
  const fresh = () => {
    const d = new Date();
    setEdit({ date: isoDay(d), dueDate: isoDay(new Date(d.getTime() + (seller?.dueDays ?? 30) * 864e5)), buyer: { ...EMPTY_BUYER }, lines: [{ label: "", qty: 1, unitPrice: 0 }], note: "" });
  };
  // Client déjà facturé : on reprend ses infos (adresse, SIREN, mail)
  const known = Array.from(new Map(list.map((i) => parse<Buyer>(i.buyer, EMPTY_BUYER)).filter((b) => b.name).map((b) => [b.name.toLowerCase(), b])).values());
  const setBuyer = (b: Partial<Buyer>) => edit && setEdit({ ...edit, buyer: { ...edit.buyer, ...b } });
  const setLine = (i: number, l: Partial<Line>) => edit && setEdit({ ...edit, lines: edit.lines.map((x, j) => (j === i ? { ...x, ...l } : x)) });

  async function save(): Promise<string | undefined> {
    if (!edit) return;
    const body = { date: edit.date, dueDate: edit.dueDate, buyer: edit.buyer, client: edit.buyer.name, lines: edit.lines.filter((l) => l.label.trim()), note: edit.note };
    const r = edit.id ? await api<Inv>(`invoices/${edit.id}`, "PATCH", body) : await api<Inv>("invoices", "POST", body);
    await load();
    return r.id;
  }

  async function emit() {
    if (!edit || !confirm("Générer la facture ? Le PDF part au client et la facture ne pourra plus être modifiée.")) return;
    setBusy(true); setMsg("");
    try {
      const id = await save();
      const res = await fetch(`/api/invoices/${id}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: true }) });
      const b = await res.json();
      if (!res.ok) { setMsg(b.error); if (id && !edit.id) setEdit({ ...edit, id }); }
      else {
        const mail = b.mailed ? "PDF envoyé au client ✓" : "Facture générée ✓ (pas de mail : adresse du client ou compte Gmail manquant)";
        setMsg(b.pro ? `${mail} Dernière étape : télécharge le fichier officiel (bouton « Fichier ») et dépose-le sur ton espace Super PDP.` : mail);
        setEdit(null);
      }
      await load();
    } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  }

  async function markPaid(i: Inv) {
    const d = prompt("Date d'encaissement (AAAA-MM-JJ)", isoDay(new Date()));
    if (!d) return;
    await api(`invoices/${i.id}`, "PATCH", { status: "paid", paidAt: d });
    setMsg(`Facture ${i.number} payée, ajoutée au livre des recettes ✓`);
    load();
  }

  async function remove() {
    if (!edit?.id || !confirm("Supprimer ce brouillon ?")) return;
    try { await api(`invoices/${edit.id}`, "DELETE"); setEdit(null); load(); } catch (e) { alert(String((e as Error).message)); }
  }

  async function saveSettings() {
    if (seller) setSeller(await api<Seller>("invoices/settings", "POST", seller));
    setShowSettings(false);
  }

  const t = edit ? totalOf(edit.lines, rate) : { ht: 0, ttc: 0 };
  const ro = !!edit && !!edit.status && edit.status !== "draft";
  const sellerOk = seller && seller.name && /^\d{9}$/.test(seller.siren);

  return (
    <div className="content">
      <div className="eyebrow">factures</div>
      <h1 className="title">ce qu&apos;on <span className="accent">facture.</span></h1>
      <div className="row">
        <a className="ghost" href="https://www.superpdp.tech" target="_blank" rel="noreferrer"><ExternalLink size={16} /> Mon espace Super PDP</a>
        <button className="ghost" onClick={() => setShowSettings(true)}><Settings2 size={16} /> Mes infos</button>
        <span style={{ flex: 1 }} />
        <button className="primary" onClick={fresh}><Plus size={16} /> Nouvelle facture</button>
      </div>
      {!sellerOk && <p className="muted">Commence par renseigner tes infos d&apos;émetteur (nom, SIREN, adresse) dans « Mes infos ».</p>}
      {msg && <p>{msg}</p>}

      <div style={{ overflowX: "auto", marginTop: 16 }}>
        <table>
          <thead><tr><th>N°</th><th>Date</th><th>Client</th><th>Statut</th><th className="num">Total TTC</th><th /></tr></thead>
          <tbody>
            {list.map((i) => (
              <tr key={i.id} onClick={() => open(i)} style={{ cursor: "pointer" }}>
                <td>{i.number}</td>
                <td>{new Date(i.date).toLocaleDateString("fr-FR", { timeZone: "UTC" })}</td>
                <td>{i.client}</td>
                <td><span className="tag">{STATUS[i.status]}</span>{i.status !== "draft" && parse<Buyer>(i.buyer, EMPTY_BUYER).siren && <span className={`tag ${i.deposited ? "" : "neg"}`} style={{ marginLeft: 6 }}>{i.deposited ? "déposée" : "à déposer"}</span>}{i.error && <span className="tag neg" style={{ marginLeft: 6 }} title={i.error}>erreur</span>}</td>
                <td className="num">{eur(totalOf(parse(i.lines, []), rate).ttc)}</td>
                <td onClick={(e) => e.stopPropagation()} style={{ whiteSpace: "nowrap" }}>
                  <a className="ghost small" href={`/api/invoices/${i.id}/pdf`} target="_blank" rel="noreferrer"><FileDown size={14} /> PDF</a>
                  {i.status !== "draft" && parse<Buyer>(i.buyer, EMPTY_BUYER).siren && <a className="ghost small" href={`/api/invoices/${i.id}/xml`} title="Fichier officiel à déposer sur Super PDP"><FileCode size={14} /> Fichier</a>}
                  {i.status !== "draft" && parse<Buyer>(i.buyer, EMPTY_BUYER).siren && <label className="check small" title="Déposée sur Super PDP"><input type="checkbox" checked={i.deposited} onChange={async (e) => { await api(`invoices/${i.id}`, "PATCH", { deposited: e.target.checked }); load(); }} /> Déposée</label>}
                  {i.status === "sent" && <button className="ghost small" onClick={() => markPaid(i)}>Payée</button>}
                </td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={6} className="muted">Aucune facture pour l&apos;instant.</td></tr>}
          </tbody>
        </table>
      </div>

      {edit && (
        <div className="overlay" onClick={() => setEdit(null)}>
          <div className="modal" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0 }}>{edit.number ? `Facture ${edit.number}` : "Nouvelle facture"}{edit.status && <span className="tag" style={{ marginLeft: 8 }}>{STATUS[edit.status]}</span>}</h3>
            {edit.error && <p className="neg small">{edit.error}</p>}
            <fieldset disabled={ro} style={{ border: 0, padding: 0, margin: 0, display: "contents" }}>
              <div className="row">
                <label>Date<input type="date" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} /></label>
                <label>Échéance<input type="date" value={edit.dueDate} onChange={(e) => setEdit({ ...edit, dueDate: e.target.value })} /></label>
              </div>
              <h4 style={{ margin: "8px 0 0" }}>Client</h4>
              <div className="row">
                <label>Nom / raison sociale<input list="known-buyers" value={edit.buyer.name} onChange={(e) => { const k = known.find((b) => b.name.toLowerCase() === e.target.value.toLowerCase()); setBuyer(k ?? { name: e.target.value }); }} /></label>
                <label>SIREN (vide si particulier)<input value={edit.buyer.siren} placeholder="9 chiffres" onChange={(e) => setBuyer({ siren: e.target.value })} /></label>
              </div>
              <datalist id="known-buyers">{known.map((b) => <option key={b.name} value={b.name} />)}</datalist>
              <label>Adresse<input value={edit.buyer.address} onChange={(e) => setBuyer({ address: e.target.value })} /></label>
              <div className="row">
                <label>Code postal<input value={edit.buyer.zip} onChange={(e) => setBuyer({ zip: e.target.value })} /></label>
                <label>Ville<input value={edit.buyer.city} onChange={(e) => setBuyer({ city: e.target.value })} /></label>
              </div>
              <div className="row">
                <label>Mail (envoi du PDF)<input type="email" value={edit.buyer.email} onChange={(e) => setBuyer({ email: e.target.value })} /></label>
                <label>N° TVA (facultatif)<input value={edit.buyer.vat} onChange={(e) => setBuyer({ vat: e.target.value })} /></label>
              </div>
              <h4 style={{ margin: "8px 0 0" }}>Lignes</h4>
              {edit.lines.map((l, i) => (
                <div className="row" key={i}>
                  <input style={{ flex: 3 }} placeholder="Désignation (ex. Montage vidéo)" value={l.label} onChange={(e) => setLine(i, { label: e.target.value })} />
                  <input style={{ width: 70 }} type="number" step="0.5" title="Quantité" value={l.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} />
                  <input style={{ width: 110 }} type="number" step="0.01" title="Prix unitaire HT" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: Number(e.target.value) })} />
                  {!ro && <button className="ghost" title="Retirer" onClick={() => setEdit({ ...edit, lines: edit.lines.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>}
                </div>
              ))}
              {!ro && <button className="ghost small" onClick={() => setEdit({ ...edit, lines: [...edit.lines, { label: "", qty: 1, unitPrice: 0 }] })}><Plus size={14} /> Ligne</button>}
              <label>Note (facultatif)<input value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></label>
            </fieldset>
            <div className="muted">Total HT {eur(t.ht)} · TVA {rate} % · <b>Total TTC {eur(t.ttc)}</b>{rate === 0 && ` · ${seller?.vatNote}`}</div>
            <div className="row">
              {edit.id && !ro && <button className="neg" onClick={remove}>Supprimer</button>}
              {edit.id && <a className="ghost" href={`/api/invoices/${edit.id}/pdf`} target="_blank" rel="noreferrer"><FileDown size={16} /> Aperçu PDF</a>}
              <span style={{ flex: 1 }} />
              <button onClick={() => setEdit(null)}>Fermer</button>
              {!ro && <button onClick={async () => { const id = await save(); if (id && !edit.id) setEdit({ ...edit, id }); setMsg("Brouillon enregistré"); }}>Enregistrer le brouillon</button>}
              {!ro && <button className="primary" disabled={busy} onClick={emit}><Send size={16} /> {busy ? "Génération…" : "Générer et envoyer"}</button>}
            </div>
          </div>
        </div>
      )}

      {showSettings && seller && (
        <div className="overlay" onClick={() => setShowSettings(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0 }}>Mes infos d&apos;émetteur</h3>
            {(["name", "siren", "address", "zip", "city", "email", "vat", "iban"] as const).map((k) => (
              <label key={k}>{{ name: "Nom / raison sociale", siren: "SIREN", address: "Adresse", zip: "Code postal", city: "Ville", email: "Mail", vat: "N° TVA intracom (si assujetti)", iban: "IBAN" }[k]}
                <input value={seller[k]} onChange={(e) => setSeller({ ...seller, [k]: e.target.value })} /></label>
            ))}
            <div className="row">
              <label>TVA (%)<input type="number" step="0.1" value={seller.vatRate} onChange={(e) => setSeller({ ...seller, vatRate: Number(e.target.value) })} /></label>
              <label>Délai de paiement (jours)<input type="number" value={seller.dueDays} onChange={(e) => setSeller({ ...seller, dueDays: Number(e.target.value) })} /></label>
            </div>
            <label>Logo (lien d&apos;une image PNG ou JPG, vide = pas de logo)<input value={seller.logo} onChange={(e) => setSeller({ ...seller, logo: e.target.value })} /></label>
            {seller.logo && <img src={seller.logo} alt="" style={{ maxHeight: 40, maxWidth: 200, alignSelf: "flex-start" }} />}
            {seller.vatRate === 0 && <label>Mention TVA<input value={seller.vatNote} onChange={(e) => setSeller({ ...seller, vatNote: e.target.value })} /></label>}
            <div className="row"><span style={{ flex: 1 }} /><button className="primary" onClick={saveSettings}>Enregistrer</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
