"use client";
import { useEffect, useState } from "react";
import { CircleCheck, ExternalLink, FilePlus2, Undo2, FileCode, FileDown, Package, Plus, Send, Settings2, Trash2 } from "lucide-react";
import { api, eur, isoDay } from "@/lib/api";
import { totals, type Discount, type InvoiceKind, type Prepaid } from "@/lib/cii";
import { einvoiceMandatory } from "@/lib/einvoice";

type Buyer = { name: string; siren: string; address: string; zip: string; city: string; email: string; vat: string; phone: string };
type Line = { label: string; qty: number; unitPrice: number };
type Inv = {
  id: string; number: string; date: string; dueDate: string; client: string; buyer: string; lines: string;
  note: string; discount: string; kind: InvoiceKind; deposits: string; refId: string; einvoice: boolean; status: "draft" | "sent" | "paid"; deposited: boolean; error: string; sentAt: string | null;
};
type Product = { id: string; name: string; unitPrice: number };
type Seller = { name: string; siren: string; address: string; zip: string; city: string; email: string; vat: string; iban: string; vatRate: number; vatNote: string; dueDays: number; logo: string };
type Edit = { id?: string; number?: string; date: string; dueDate: string; buyer: Buyer; lines: Line[]; note: string; discount: Discount; kind: InvoiceKind; deposits: string[]; refId?: string; einvoice: boolean; status?: Inv["status"]; error?: string };

const EMPTY_BUYER: Buyer = { name: "", siren: "", address: "", zip: "", city: "", email: "", vat: "", phone: "" };
const STATUS = { draft: "Brouillon", sent: "Émise", paid: "Payée" } as const;
const parse = <T,>(s: string, d: T): T => { try { return JSON.parse(s) as T; } catch { return d; } };
const NO_DISCOUNT: Discount = { type: "eur", value: 0, label: "Remise" };
const totalOf = (lines: Line[], rate: number, discount?: Discount, prepaid?: Prepaid[]) => totals({ lines, vatRate: rate, discount, prepaid });
const KIND = { standard: "Facture", deposit: "Acompte", final: "Solde", credit: "Avoir" } as const;

export default function Factures() {
  const [list, setList] = useState<Inv[]>([]);
  const [seller, setSeller] = useState<Seller | null>(null);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [showProducts, setShowProducts] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: "", unitPrice: 0 });
  const [depCalc, setDepCalc] = useState({ label: "", total: 0, pct: 30 });

  const load = () => api<{ invoices: Inv[]; settings: Seller }>("invoices").then((r) => {
    setList(r.invoices); setSeller(r.settings);
    // Arrivée depuis un devis : on ouvre directement la facture créée
    const id = new URLSearchParams(window.location.search).get("open");
    const i = id ? r.invoices.find((x) => x.id === id) : undefined;
    if (i) { open(i); window.history.replaceState(null, "", "/factures"); }
  });
  const loadProducts = () => api<Product[]>("products").then(setProducts);
  const [saved, setSaved] = useState<Buyer[]>([]);
  useEffect(() => { load(); loadProducts(); api<Buyer[]>("clients/billing").then(setSaved).catch(() => {}); }, []);

  const rate = seller?.vatRate ?? 0;
  const discountOf = (i: Inv): Discount | undefined => (i.discount ? parse<Discount>(i.discount, NO_DISCOUNT) : undefined);
  const open = (i: Inv) => setEdit({ id: i.id, number: i.number, date: i.date.slice(0, 10), dueDate: i.dueDate.slice(0, 10), buyer: { ...EMPTY_BUYER, ...parse(i.buyer, {}) }, lines: parse(i.lines, []), note: i.note, discount: discountOf(i) ?? { ...NO_DISCOUNT }, kind: i.kind || "standard", deposits: parse<string[]>(i.deposits, []), refId: i.refId, einvoice: i.einvoice, status: i.status, error: i.error });
  const fresh = () => {
    const d = new Date();
    setEdit({ date: isoDay(d), dueDate: isoDay(new Date(d.getTime() + (seller?.dueDays ?? 30) * 864e5)), buyer: { ...EMPTY_BUYER }, lines: [{ label: "", qty: 1, unitPrice: 0 }], note: "", discount: { ...NO_DISCOUNT }, kind: "standard", deposits: [], einvoice: false });
  };
  // Acomptes : montant TTC de chaque facture d'acompte, et ceux déjà déduits dans une facture de solde
  const ttcOf = (i: Inv) => totalOf(parse(i.lines, []), rate, discountOf(i)).ttc;
  const prepaidOf = (ids: string[]): Prepaid[] => list.filter((x) => ids.includes(x.id) && x.kind === "deposit").map((x) => ({ number: x.number, date: x.date.slice(0, 10), amount: ttcOf(x) }));
  const usedDeposits = (exceptId?: string) => new Set(list.filter((x) => x.kind === "final" && x.id !== exceptId).flatMap((x) => parse<string[]>(x.deposits, [])));
  const depositsFor = (e: Edit) => {
    const used = usedDeposits(e.id);
    const name = e.buyer.name.trim().toLowerCase();
    return list.filter((x) => x.kind === "deposit" && x.status !== "draft" && !used.has(x.id) && (!name || x.client.trim().toLowerCase() === name));
  };
  // Liens acompte ↔ solde : la facture de solde qui a déduit cet acompte, et les acomptes d'une facture de solde
  const finalOf = (dep: Inv) => list.find((x) => x.kind === "final" && parse<string[]>(x.deposits, []).includes(dep.id));
  const depositsOf = (fin: Inv) => list.filter((x) => parse<string[]>(fin.deposits, []).includes(x.id)).sort((a, b) => a.number.localeCompare(b.number));
  const linkTo = (x: Inv) => <a key={x.id} href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); open(x); }}>{x.number}</a>;
  const creditsOf = (orig: Inv) => list.filter((x) => x.kind === "credit" && x.refId === orig.id);
  const links = (i: Inv) => {
    if (i.kind === "credit") {
      const o = list.find((x) => x.id === i.refId);
      return o ? <span className="muted small">Avoir sur {linkTo(o)}</span> : null;
    }
    const cr = creditsOf(i);
    if (cr.length) return <span className="neg small">Avoir : {cr.map((x, j) => <span key={x.id}>{j ? ", " : ""}{linkTo(x)}</span>)}</span>;
    if (i.kind === "deposit") {
      const f = finalOf(i);
      return f ? <span className="muted small">Soldé par {linkTo(f)}</span> : i.status !== "draft" ? <span className="neg small">Solde à faire</span> : null;
    }
    if (i.kind === "final") {
      const d = depositsOf(i);
      return d.length ? <span className="muted small">Acompte{d.length > 1 ? "s" : ""} : {d.map((x, j) => <span key={x.id}>{j ? ", " : ""}{linkTo(x)}</span>)}</span> : null;
    }
    return null;
  };
  // « Faire le solde » depuis un acompte : nouvelle facture de solde, même client, tous ses acomptes non soldés cochés
  async function resend(i: Inv) {
    const to = parse<Buyer>(i.buyer, EMPTY_BUYER).email;
    if (!confirm(`Renvoyer ${KIND[i.kind || "standard"].toLowerCase()} ${i.number} à ${to} ?`)) return;
    const res = await fetch(`/api/invoices/${i.id}/resend`, { method: "POST" });
    const b = await res.json().catch(() => ({}));
    alert(res.ok ? `Mail renvoyé à ${b.to}.` : b.error || "Envoi impossible.");
    load();
  }
  function makeCredit(orig: Inv) {
    if (!confirm(`Créer un avoir pour annuler la facture ${orig.number} ? Tu pourras ajuster le montant avant de le générer (avoir partiel).`)) return;
    const d = isoDay(new Date());
    const o = totalOf(parse(orig.lines, []), rate, discountOf(orig), orig.kind === "final" ? prepaidOf(parse<string[]>(orig.deposits, [])) : undefined);
    // Montant de l'avoir = ce qui a été facturé (reste à payer pour un solde)
    const lines: Line[] = o.prepaid > 0 ? [{ label: `Annulation de la facture ${orig.number}`, qty: 1, unitPrice: o.due }] : parse<Line[]>(orig.lines, []);
    setEdit({ date: d, dueDate: d, buyer: { ...EMPTY_BUYER, ...parse<Buyer>(orig.buyer, EMPTY_BUYER) }, lines, note: `Avoir sur la facture ${orig.number}`, discount: o.prepaid > 0 ? { ...NO_DISCOUNT } : discountOf(orig) ?? { ...NO_DISCOUNT }, kind: "credit", deposits: [], refId: orig.id, einvoice: orig.einvoice });
  }
  function makeFinal(dep: Inv) {
    const d = new Date();
    const buyer = { ...EMPTY_BUYER, ...parse<Buyer>(dep.buyer, EMPTY_BUYER) };
    const e: Edit = { date: isoDay(d), dueDate: isoDay(new Date(d.getTime() + (seller?.dueDays ?? 30) * 864e5)), buyer, lines: [{ label: "", qty: 1, unitPrice: 0 }], note: "", discount: { ...NO_DISCOUNT }, kind: "final", deposits: [], einvoice: false };
    e.deposits = depositsFor(e).map((x) => x.id);
    // Total du projet repris du libellé « … (total 1 500,00 € HT) » si présent
    const m = parse<Line[]>(dep.lines, [])[0]?.label.match(/^Acompte [\d,]+ %(?: - (.*?))? \(total ([\d\s  ,]+) €/);
    if (m) e.lines = [{ label: m[1] || "Prestation", qty: 1, unitPrice: Number(m[2].replace(/[\s  ]/g, "").replace(",", ".")) || 0 }];
    setEdit(e);
  }
  function applyDeposit() {
    if (!edit || !(depCalc.total > 0) || !(depCalc.pct > 0)) return;
    const amount = Math.round(depCalc.total * depCalc.pct) / 100;
    const label = `Acompte ${String(depCalc.pct).replace(".", ",")} %${depCalc.label.trim() ? ` - ${depCalc.label.trim()}` : ""} (total ${eur(depCalc.total)} HT)`;
    setEdit({ ...edit, lines: [{ label, qty: 1, unitPrice: amount }] });
  }
  // Produit du catalogue choisi dans une ligne : le prix se remplit tout seul
  const pickLabel = (i: number, label: string) => {
    const p = products.find((x) => x.name.toLowerCase() === label.trim().toLowerCase());
    setLine(i, p ? { label: p.name, unitPrice: p.unitPrice } : { label });
  };
  async function addProduct() {
    if (!newProduct.name.trim()) return;
    await api("products", "POST", newProduct);
    setNewProduct({ name: "", unitPrice: 0 });
    loadProducts();
  }
  // Client déjà facturé : on reprend ses infos (adresse, SIREN, mail)
  const known = Array.from(new Map([...list.map((i) => parse<Buyer>(i.buyer, EMPTY_BUYER)).reverse(), ...saved].filter((b) => b.name).map((b) => [b.name.toLowerCase(), { ...EMPTY_BUYER, ...b }])).values());
  const setBuyer = (b: Partial<Buyer>) => edit && setEdit({ ...edit, buyer: { ...edit.buyer, ...b } });
  const setLine = (i: number, l: Partial<Line>) => edit && setEdit({ ...edit, lines: edit.lines.map((x, j) => (j === i ? { ...x, ...l } : x)) });

  async function save(): Promise<string | undefined> {
    if (!edit) return;
    const body = { date: edit.date, dueDate: edit.dueDate, buyer: edit.buyer, client: edit.buyer.name, lines: edit.lines.filter((l) => l.label.trim()), note: edit.note, discount: edit.discount, kind: edit.kind, einvoice: edit.einvoice, deposits: edit.kind === "final" ? edit.deposits : [], ...(edit.kind === "credit" ? { refId: edit.refId ?? "" } : {}) };
    const r = edit.id ? await api<Inv>(`invoices/${edit.id}`, "PATCH", body) : await api<Inv>("invoices", "POST", body);
    await load();
    return r.id;
  }

  async function emit() {
    if (!edit || !confirm(edit.kind === "credit" ? "Générer l'avoir ? Le PDF part au client et l'avoir ne pourra plus être modifié." : "Générer la facture ? Le PDF part au client et la facture ne pourra plus être modifiée.")) return;
    setBusy(true); setMsg("");
    // Pas de mail client : on ouvre le PDF pour l'envoyer soi-même (onglet ouvert tout de suite, sinon le navigateur le bloque)
    const tab = !edit.buyer.email.trim() ? window.open("", "_blank") : null;
    try {
      const id = await save();
      const res = await fetch(`/api/invoices/${id}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: true }) });
      const b = await res.json();
      if (!res.ok) { tab?.close(); setMsg(b.error); if (id && !edit.id) setEdit({ ...edit, id }); }
      else {
        if (tab) tab.location.href = `/api/invoices/${id}/pdf`;
        else if (!b.mailed) window.open(`/api/invoices/${id}/pdf`, "_blank");
        const mail = b.mailed ? "PDF envoyé au client ✓" : "Facture générée ✓ Le PDF s'est ouvert : tu peux l'enregistrer ou l'envoyer toi-même.";
        setMsg(b.pro ? `${mail} Dernière étape : télécharge le fichier officiel (bouton « Fichier ») et dépose-le sur ton espace Super PDP.` : mail);
        setEdit(null);
      }
      await load();
    } catch (e) { tab?.close(); setMsg((e as Error).message); }
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

  const t = totalOf(edit?.lines ?? [], rate, edit?.discount, edit?.kind === "final" ? prepaidOf(edit.deposits) : undefined);
  const ro = !!edit && !!edit.status && edit.status !== "draft";
  const sellerOk = seller && seller.name && /^\d{9}$/.test(seller.siren);

  return (
    <div className="content">
      <div className="eyebrow">factures</div>
      <h1 className="title">ce qu&apos;on <span className="accent">facture.</span></h1>
      <div className="row">
        {list.some((x) => x.einvoice) && <a className="ghost" href="https://www.superpdp.tech" target="_blank" rel="noreferrer"><ExternalLink size={16} /> Mon espace Super PDP</a>}
        <button className="ghost" onClick={() => setShowSettings(true)}><Settings2 size={16} /> Mes infos</button>
        <button className="ghost" onClick={() => setShowProducts(true)}><Package size={16} /> Produits</button>
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
                <td>{i.client}{links(i) && <div>{links(i)}</div>}</td>
                <td>{i.kind && i.kind !== "standard" && <span className="tag" style={{ marginRight: 6 }}>{KIND[i.kind]}</span>}<span className="tag">{STATUS[i.status]}</span>{i.einvoice && i.status !== "draft" && parse<Buyer>(i.buyer, EMPTY_BUYER).siren && <span className={`tag ${i.deposited ? "" : "neg"}`} style={{ marginLeft: 6 }}>{i.deposited ? "déposée" : "à déposer"}</span>}{i.error && <span className="tag neg" style={{ marginLeft: 6 }} title={i.error}>erreur</span>}</td>
                <td className="num">{eur((i.kind === "credit" ? -1 : 1) * totalOf(parse(i.lines, []), rate, discountOf(i), i.kind === "final" ? prepaidOf(parse<string[]>(i.deposits, [])) : undefined).due)}</td>
                <td onClick={(e) => e.stopPropagation()}><div className="inv-actions">
                  <a className="ghost small" href={`/api/invoices/${i.id}/pdf`} target="_blank" rel="noreferrer"><FileDown size={14} /> PDF</a>
                  {i.einvoice && i.status !== "draft" && parse<Buyer>(i.buyer, EMPTY_BUYER).siren && <a className="ghost small" href={`/api/invoices/${i.id}/xml`} title="Fichier officiel à déposer sur Super PDP"><FileCode size={14} /> Fichier</a>}
                  {i.einvoice && i.status !== "draft" && parse<Buyer>(i.buyer, EMPTY_BUYER).siren && <label className="check small" title="Déposée sur Super PDP"><input type="checkbox" checked={i.deposited} onChange={async (e) => { await api(`invoices/${i.id}`, "PATCH", { deposited: e.target.checked }); load(); }} /> Déposée</label>}
                  {i.status !== "draft" && parse<Buyer>(i.buyer, EMPTY_BUYER).email && <button className="ghost small" title="Renvoyer le mail au client" onClick={() => resend(i)}><Send size={14} /> Renvoyer</button>}
                  {i.status === "sent" && <button className="ghost small" onClick={() => markPaid(i)}><CircleCheck size={14} /> {i.kind === "credit" ? "Remboursé" : "Payée"}</button>}
                  {i.status !== "draft" && i.kind !== "credit" && <button className="ghost small" onClick={() => makeCredit(i)}><Undo2 size={14} /> Faire un avoir</button>}
                  {i.kind === "deposit" && i.status !== "draft" && !finalOf(i) && <button className="ghost small" onClick={() => makeFinal(i)}><FilePlus2 size={14} /> Faire le solde</button>}
                </div></td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={6} className="muted">Aucune facture pour l&apos;instant.</td></tr>}
          </tbody>
        </table>
      </div>

      {edit && (
        <div className="overlay" onClick={() => setEdit(null)}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0 }}>{edit.number ? `${KIND[edit.kind]} ${edit.number}` : edit.kind === "credit" ? "Nouvel avoir" : "Nouvelle facture"}{edit.status && <span className="tag" style={{ marginLeft: 8 }}>{STATUS[edit.status]}</span>}</h3>
            {edit.error && <p className="neg small">{edit.error}</p>}
            {edit.id && (() => { const cur = list.find((x) => x.id === edit.id); const l = cur && links(cur); return l ? <div>{l}</div> : null; })()}
            {ro && <p className="small" style={{ margin: 0, padding: "8px 12px", borderRadius: 10, background: "var(--tag)" }}>🔒 Facture émise : elle ne peut plus être modifiée (obligation légale). Pour corriger une erreur, il faut faire un avoir.</p>}
            <fieldset disabled={ro} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: "grid", gap: 12, opacity: ro ? 0.75 : 1, pointerEvents: ro ? "none" : undefined }}>
              {edit.kind !== "credit" && <div className="row">
                {(["standard", "deposit", "final"] as const).map((k) => (
                  <button key={k} type="button" className={edit.kind === k ? "primary" : ""} onClick={() => setEdit({ ...edit, kind: k })}>{{ standard: "Facture", deposit: "Facture d'acompte", final: "Facture de solde" }[k]}</button>
                ))}
              </div>}
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
                <label>Téléphone<input type="tel" value={edit.buyer.phone ?? ""} onChange={(e) => setBuyer({ phone: e.target.value })} /></label>
              </div>
              {edit.kind === "deposit" && !ro && (
                <div className="row" style={{ alignItems: "flex-end" }}>
                  <label style={{ flex: 2 }}>Projet<input placeholder="ex. Clip de Marie" value={depCalc.label} onChange={(e) => setDepCalc({ ...depCalc, label: e.target.value })} /></label>
                  <label>Total du projet HT<input type="number" step="0.01" value={depCalc.total} onChange={(e) => setDepCalc({ ...depCalc, total: Number(e.target.value) })} /></label>
                  <label style={{ width: 80 }}>%<input type="number" step="1" value={depCalc.pct} onChange={(e) => setDepCalc({ ...depCalc, pct: Number(e.target.value) })} /></label>
                  <button type="button" onClick={applyDeposit}>Calculer l&apos;acompte</button>
                </div>
              )}
              <h4 style={{ margin: "8px 0 0" }}>Lignes{edit.kind === "final" && <span className="muted small"> (le total du projet, les acomptes sont déduits en dessous)</span>}</h4>
              {edit.lines.map((l, i) => (
                <div className="row" key={i}>
                  <input style={{ flex: 3 }} list="products-list" placeholder="Produit ou désignation (ex. Montage vidéo)" value={l.label} onChange={(e) => pickLabel(i, e.target.value)} />
                  <input style={{ width: 70 }} type="number" step="0.5" title="Quantité" value={l.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} />
                  <input style={{ width: 110 }} type="number" step="0.01" title="Prix unitaire HT" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: Number(e.target.value) })} />
                  {!ro && <button className="ghost" title="Retirer" onClick={() => setEdit({ ...edit, lines: edit.lines.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>}
                </div>
              ))}
              <datalist id="products-list">{products.map((p) => <option key={p.id} value={p.name}>{eur(p.unitPrice)}</option>)}</datalist>
              {!ro && <button className="ghost small" onClick={() => setEdit({ ...edit, lines: [...edit.lines, { label: "", qty: 1, unitPrice: 0 }] })}><Plus size={14} /> Ligne</button>}
              {edit.kind === "final" && (<>
                <h4 style={{ margin: "8px 0 0" }}>Acomptes à déduire</h4>
                {(() => {
                  const avail = depositsFor(edit);
                  const shown = [...list.filter((x) => edit.deposits.includes(x.id) && !avail.includes(x)), ...avail];
                  if (!shown.length) return <span className="muted small">Aucune facture d&apos;acompte émise pour {edit.buyer.name.trim() || "ce client"}.</span>;
                  return shown.map((x) => (
                    <label key={x.id} className="check"><input type="checkbox" checked={edit.deposits.includes(x.id)} onChange={(e) => setEdit({ ...edit, deposits: e.target.checked ? [...edit.deposits, x.id] : edit.deposits.filter((y) => y !== x.id) })} /> {x.number} du {new Date(x.date).toLocaleDateString("fr-FR", { timeZone: "UTC" })} · {eur(ttcOf(x))}</label>
                  ));
                })()}
              </>)}
              <h4 style={{ margin: "8px 0 0" }}>Remise / promo</h4>
              <div className="row">
                <input style={{ flex: 2 }} placeholder="Libellé (ex. Promo de lancement)" value={edit.discount.label} onChange={(e) => setEdit({ ...edit, discount: { ...edit.discount, label: e.target.value } })} />
                <input style={{ width: 110 }} type="number" step="0.01" min="0" title="Montant de la remise" value={edit.discount.value} onChange={(e) => setEdit({ ...edit, discount: { ...edit.discount, value: Number(e.target.value) } })} />
                <select value={edit.discount.type} onChange={(e) => setEdit({ ...edit, discount: { ...edit.discount, type: e.target.value as Discount["type"] } })}>
                  <option value="eur">€</option>
                  <option value="pct">%</option>
                </select>
              </div>
              {edit.buyer.siren.trim() && (einvoiceMandatory(edit.date)
                ? <span className="muted small">Facture électronique : obligatoire pour cette date, le fichier officiel sera à déposer sur Super PDP.</span>
                : <label className="check"><input type="checkbox" checked={edit.einvoice} onChange={(e) => setEdit({ ...edit, einvoice: e.target.checked })} /> Facture électronique (dépôt Super PDP) · facultatif jusqu&apos;au 01/09/2027</label>)}
              <label>Note (facultatif)<input value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></label>
            </fieldset>
            <div className="muted">{t.remise > 0 && <>Sous-total {eur(t.gross)} · Remise −{eur(t.remise)} · </>}Total HT {eur(t.ht)} · TVA {rate} % · {t.prepaid > 0 ? <>Total TTC {eur(t.ttc)} · Acomptes −{eur(t.prepaid)} · <b>Reste à payer {eur(t.due)}</b></> : <b>{edit.kind === "deposit" ? "Acompte" : edit.kind === "credit" ? "Total de l'avoir" : "Total TTC"} {eur(t.ttc)}</b>}{rate === 0 && ` · ${seller?.vatNote}`}</div>
            <div className="row modal-actions">
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

      {showProducts && (
        <div className="overlay" onClick={() => setShowProducts(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0 }}>Mes produits et prestations</h3>
            <span className="muted small">Tape leur nom dans une ligne de facture : le prix se remplit tout seul.</span>
            {products.map((p) => (
              <div className="row" key={p.id}>
                <input style={{ flex: 3 }} defaultValue={p.name} onBlur={async (e) => { if (e.target.value.trim() && e.target.value !== p.name) { await api(`products/${p.id}`, "PATCH", { name: e.target.value }); loadProducts(); } }} />
                <input style={{ width: 110 }} type="number" step="0.01" title="Prix unitaire HT" defaultValue={p.unitPrice} onBlur={async (e) => { if (Number(e.target.value) !== p.unitPrice) { await api(`products/${p.id}`, "PATCH", { unitPrice: Number(e.target.value) }); loadProducts(); } }} />
                <button className="ghost" title="Supprimer" onClick={async () => { if (confirm(`Supprimer « ${p.name} » ?`)) { await api(`products/${p.id}`, "DELETE"); loadProducts(); } }}><Trash2 size={14} /></button>
              </div>
            ))}
            {!products.length && <span className="muted">Aucun produit pour l&apos;instant.</span>}
            <div className="row">
              <input style={{ flex: 3 }} placeholder="Nouveau produit (ex. Montage court)" value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") addProduct(); }} />
              <input style={{ width: 110 }} type="number" step="0.01" title="Prix unitaire HT" value={newProduct.unitPrice} onChange={(e) => setNewProduct({ ...newProduct, unitPrice: Number(e.target.value) })} />
              <button className="primary" onClick={addProduct}><Plus size={14} /> Ajouter</button>
            </div>
            <div className="row"><span style={{ flex: 1 }} /><button onClick={() => setShowProducts(false)}>Fermer</button></div>
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
