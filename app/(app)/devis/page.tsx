"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Car, Check, FileDown, Minus, Paperclip, Plus, Save, Send, Trash2, Upload, X } from "lucide-react";
import { api, eur, isoDay } from "@/lib/api";
import { CATALOGUE } from "@/lib/pricing";

type Buyer = { name: string; siren: string; address: string; zip: string; city: string; email: string; vat: string; phone: string };
type Line = { label: string; qty: number; unitPrice: number };
type Quote = {
  id: string; number: string; date: string; validUntil: string; buyer: string; lines: string; note: string; discount: string;
  status: "draft" | "sent" | "accepted" | "refused"; signedName: string; invoiceId: string; error: string; sentAt: string | null;
};
type Edit = { id?: string; number?: string; validUntil: string; buyer: Buyer; qty: Record<string, number>; price: Record<string, number>; extra: Line[]; note: string };

const EMPTY_BUYER: Buyer = { name: "", siren: "", address: "", zip: "", city: "", email: "", vat: "", phone: "" };
const STATUS = { draft: "Brouillon", sent: "Envoyé", accepted: "Validé", refused: "Refusé" } as const;
const parse = <T,>(s: string, d: T): T => { try { return JSON.parse(s) as T; } catch { return d; } };
const ITEMS = CATALOGUE.flatMap((s) => s.items);
const in30 = () => isoDay(new Date(Date.now() + 30 * 864e5));
const blank = (): Edit => ({ validUntil: in30(), buyer: { ...EMPTY_BUYER }, qty: {}, price: {}, extra: [], note: "" });
const linesOf = (e: Edit): Line[] => [
  ...ITEMS.filter((i) => (e.qty[i.id] ?? 0) > 0).map((i) => ({ label: i.name, qty: e.qty[i.id], unitPrice: e.price[i.id] ?? i.prix })),
  ...e.extra.filter((l) => l.label.trim()),
];
const sum = (lines: Line[]) => lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);

// Devis : composé avec la grille tarifaire, envoyé au client, puis validé (devis signé glissé dans l'app) → facture brouillon
export default function Devis() {
  const router = useRouter();
  const [list, setList] = useState<Quote[]>([]);
  const [edit, setEdit] = useState<Edit>(blank);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [drag, setDrag] = useState<string | null>(null);

  const load = () => api<Quote[]>("quotes").then(setList);
  const [saved, setSaved] = useState<Buyer[]>([]);
  // Déplacement : km aller (calculés ou saisis), aller-retour, tarif au km
  const [trip, setTrip] = useState({ to: "", km: 0, round: true, rate: 0.6, from: "", defaultFrom: "", busy: false, info: "" });
  useEffect(() => { api<{ kmRate: number; kmFrom: string; defaultFrom: string }>("quotes/travel").then((r) => setTrip((t) => ({ ...t, rate: r.kmRate, from: r.kmFrom, defaultFrom: r.defaultFrom }))).catch(() => {}); }, []);
  useEffect(() => { load(); api<Buyer[]>("clients/billing").then(setSaved).catch(() => {}); }, []);

  const lines = linesOf(edit);
  const total = sum(lines);
  const setQty = (id: string, n: number) => setEdit((e) => ({ ...e, qty: { ...e.qty, [id]: Math.max(0, n) } }));
  const setBuyer = (b: Partial<Buyer>) => setEdit((e) => ({ ...e, buyer: { ...e.buyer, ...b } }));
  const setExtra = (i: number, l: Partial<Line>) => setEdit((e) => ({ ...e, extra: e.extra.map((x, j) => (j === i ? { ...x, ...l } : x)) }));

  const TRIP = "Frais de déplacement";
  const tripKm = trip.km * (trip.round ? 2 : 1);
  async function calcTrip() {
    const to = trip.to.trim() || [edit.buyer.address, edit.buyer.zip, edit.buyer.city].filter(Boolean).join(" ");
    if (!to) { setTrip({ ...trip, info: "Indique le lieu du tournage (ou l'adresse du client)." }); return; }
    setTrip({ ...trip, to, busy: true, info: "" });
    try {
      const res = await fetch(`/api/quotes/travel?to=${encodeURIComponent(to)}`);
      const b = await res.json();
      if (!res.ok) throw new Error(b.error);
      setTrip((t) => ({ ...t, km: b.km, busy: false, info: `${b.km} km en voiture jusqu'à ${String(b.to).split(",").slice(0, 2).join(",")}` }));
    } catch (e) { setTrip((t) => ({ ...t, busy: false, info: String((e as Error).message) })); }
  }
  function addTrip() {
    if (!(tripKm > 0)) return;
    api("quotes/travel", "POST", { kmRate: trip.rate, kmFrom: trip.from });
    const where = trip.to.trim() || edit.buyer.city;
    const label = `${TRIP}${where ? ` - ${where}` : ""} (${trip.round ? "aller-retour" : "aller"}, ${String(trip.rate).replace(".", ",")} €/km)`;
    const line = { label, qty: tripKm, unitPrice: trip.rate };
    setEdit((e) => ({ ...e, extra: [...e.extra.filter((l) => !l.label.startsWith(TRIP)), line] }));
  }

  // Reprend un devis existant dans le formulaire (prestations de la grille reconnues par leur nom)
  function open(q: Quote) {
    const qty: Record<string, number> = {};
    const price: Record<string, number> = {};
    const extra: Line[] = [];
    for (const l of parse<Line[]>(q.lines, [])) {
      const it = ITEMS.find((i) => i.name === l.label && !qty[i.id]);
      if (it) { qty[it.id] = l.qty; if (l.unitPrice !== it.prix) price[it.id] = l.unitPrice; } else extra.push(l);
    }
    setEdit({ id: q.id, number: q.number, validUntil: q.validUntil.slice(0, 10), buyer: { ...EMPTY_BUYER, ...parse(q.buyer, {}) }, qty, price, extra, note: q.note });
    setMsg("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(): Promise<string | null> {
    if (!lines.length) { setMsg("Ajoute au moins une prestation."); return null; }
    if (!edit.buyer.name.trim()) { setMsg("Indique le nom du client."); return null; }
    const body = { validUntil: edit.validUntil, buyer: edit.buyer, lines, note: edit.note };
    if (edit.id) { await api(`quotes/${edit.id}`, "PATCH", body); return edit.id; }
    const q = await api<Quote>("quotes", "POST", body);
    setEdit((e) => ({ ...e, id: q.id, number: q.number }));
    return q.id;
  }

  async function saveOnly() {
    setBusy(true); setMsg("");
    try { if (await save()) { setMsg("Devis enregistré."); load(); } } catch (e) { setMsg(String((e as Error).message)); }
    setBusy(false);
  }

  async function send() {
    const noMail = !edit.buyer.email.trim();
    if (!confirm(noMail ? "Pas de mail client : le devis passe en « envoyé » et le PDF s'ouvre pour que tu l'envoies toi-même. Continuer ?" : `Envoyer le devis à ${edit.buyer.email} ?`)) return;
    const tab = noMail ? window.open("", "_blank") : null;
    setBusy(true); setMsg("");
    try {
      const id = await save();
      if (!id) { tab?.close(); setBusy(false); return; }
      const res = await fetch(`/api/quotes/${id}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error);
      if (tab) tab.location.href = `/api/quotes/${id}/pdf`;
      setMsg(b.mailed ? `Devis envoyé à ${edit.buyer.email}.` : "Devis marqué envoyé. Le PDF est ouvert dans un nouvel onglet.");
      setEdit(blank());
      load();
    } catch (e) { tab?.close(); setMsg(String((e as Error).message)); }
    setBusy(false);
  }

  // Devis validé : avec le fichier signé glissé (ou sans fichier) → facture brouillon ouverte dans Factures
  async function accept(q: Quote, file?: File) {
    if (!file && !confirm(`Valider le devis ${q.number} sans devis signé ? Une facture brouillon sera créée.`)) return;
    if (file && file.size > 4 * 1024 * 1024) { alert("Fichier trop lourd (4 Mo maximum)."); return; }
    setBusy(true);
    try {
      let res: Response;
      if (file) { const fd = new FormData(); fd.append("file", file); res = await fetch(`/api/quotes/${q.id}/accept`, { method: "POST", body: fd }); }
      else res = await fetch(`/api/quotes/${q.id}/accept`, { method: "POST" });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error);
      router.push(`/factures?open=${b.invoiceId}`);
    } catch (e) { alert(String((e as Error).message)); setBusy(false); }
  }

  // Fichier glissé dans l'espace retour : on retrouve le devis par son numéro dans le nom du fichier
  function dropAnywhere(file: File) {
    const pending = list.filter((q) => q.status === "sent");
    const num = file.name.match(/D-\d{4}-\d{3}/i)?.[0]?.toUpperCase();
    const q = (num && pending.find((x) => x.number === num)) || (pending.length === 1 ? pending[0] : undefined);
    if (!q) { alert(pending.length ? "Je ne retrouve pas le numéro du devis dans le nom du fichier : glisse-le directement sur la bonne ligne." : "Aucun devis en attente de retour."); return; }
    if (confirm(`Valider le devis ${q.number} (${parse<Buyer>(q.buyer, EMPTY_BUYER).name}) avec ce fichier ?`)) accept(q, file);
  }

  async function refuse(q: Quote) {
    if (!confirm(`Marquer le devis ${q.number} comme refusé ?`)) return;
    await api(`quotes/${q.id}`, "PATCH", { status: "refused" }); load();
  }
  async function remove(q: Quote) {
    if (!confirm(`Supprimer le devis ${q.number} ?`)) return;
    await api(`quotes/${q.id}`, "DELETE");
    if (edit.id === q.id) setEdit(blank());
    load();
  }

  const dropProps = (key: string, onFile: (f: File) => void) => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDrag(key); },
    onDragLeave: () => setDrag(null),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setDrag(null); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); },
  });
  const pending = list.filter((q) => q.status === "sent");
  const locked = edit.id ? list.find((q) => q.id === edit.id)?.status === "accepted" : false;

  return (
    <div className="content wide">
      <div className="eyebrow">devis</div>
      <h1 className="title">on chiffre <span className="accent">le projet.</span></h1>

      {/* ── Retours de devis ── */}
      <div className="eyebrow" style={{ marginTop: 10 }}>retours de devis</div>
      <div
        className="card"
        {...dropProps("all", dropAnywhere)}
        style={{ cursor: "default", border: `2px dashed ${drag === "all" ? "var(--accent)" : "var(--border)"}`, background: drag === "all" ? "var(--accent-soft, rgba(255,107,43,.08))" : undefined }}
      >
        <div className="row muted" style={{ justifyContent: "center", padding: "6px 0" }}><Upload size={16} /> Glisse ici le devis signé renvoyé par le client : il est validé et passe en facture brouillon.</div>
        {pending.length > 0 && pending.map((q) => {
          const b = parse<Buyer>(q.buyer, EMPTY_BUYER);
          return (
            <div key={q.id} className="row" {...dropProps(q.id, (f) => accept(q, f))} style={{ padding: "8px 10px", borderTop: "1px solid var(--border)", borderRadius: 8, background: drag === q.id ? "rgba(255,107,43,.12)" : undefined }}>
              <b>{q.number}</b><span style={{ flex: 1 }}>{b.name}</span><span>{eur(sum(parse(q.lines, [])))}</span>
              <label className="ghost small gbutton" style={{ cursor: "pointer" }}><Paperclip size={14} /> Fichier signé<input type="file" hidden accept=".pdf,image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) accept(q, f); }} /></label>
              <button className="ghost small" disabled={busy} onClick={() => accept(q)}><Check size={14} /> Validé sans fichier</button>
              <button className="ghost small" onClick={() => refuse(q)}><X size={14} /> Refusé</button>
            </div>
          );
        })}
        {!pending.length && <div className="muted small" style={{ textAlign: "center" }}>Aucun devis en attente de retour.</div>}
      </div>

      {/* ── Formulaire du devis ── */}
      <div className="row" style={{ marginTop: 24, justifyContent: "space-between" }}>
        <div className="eyebrow">{edit.number ? `devis ${edit.number}` : "nouveau devis"}</div>
        {edit.id && <button className="ghost small" onClick={() => { setEdit(blank()); setMsg(""); }}><Plus size={14} /> Nouveau devis</button>}
      </div>
      <fieldset disabled={locked || busy} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="card" style={{ cursor: "default" }}>
          <div className="row">
            <input style={{ flex: 2 }} list="saved-clients" placeholder="Client (nom ou société)" value={edit.buyer.name} onChange={(e) => { const k = saved.find((b) => b.name.toLowerCase() === e.target.value.toLowerCase()); setBuyer(k ? { ...EMPTY_BUYER, ...k } : { name: e.target.value }); }} />
            <datalist id="saved-clients">{saved.map((b) => <option key={b.name} value={b.name} />)}</datalist>
            <input style={{ flex: 2 }} placeholder="Mail du client" type="email" value={edit.buyer.email} onChange={(e) => setBuyer({ email: e.target.value })} />
            <input style={{ flex: 1 }} type="tel" placeholder="Téléphone" value={edit.buyer.phone ?? ""} onChange={(e) => setBuyer({ phone: e.target.value })} />
            <input style={{ flex: 1 }} placeholder="SIREN (entreprise)" value={edit.buyer.siren} onChange={(e) => setBuyer({ siren: e.target.value })} />
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <input style={{ flex: 3 }} placeholder="Adresse" value={edit.buyer.address} onChange={(e) => setBuyer({ address: e.target.value })} />
            <input style={{ flex: 1 }} placeholder="Code postal" value={edit.buyer.zip} onChange={(e) => setBuyer({ zip: e.target.value })} />
            <input style={{ flex: 2 }} placeholder="Ville" value={edit.buyer.city} onChange={(e) => setBuyer({ city: e.target.value })} />
            <label className="muted small row">Valable jusqu&apos;au <input type="date" value={edit.validUntil} onChange={(e) => setEdit({ ...edit, validUntil: e.target.value })} /></label>
          </div>
        </div>

        {CATALOGUE.map((s) => (
          <div key={s.section} style={{ marginTop: 14 }}>
            <div className="eyebrow">{s.section}</div>
            {s.note && <div className="muted small" style={{ marginBottom: 4 }}>{s.note}</div>}
            <div className="card" style={{ cursor: "default", padding: 0 }}>
              {s.items.map((i) => {
                const n = edit.qty[i.id] ?? 0;
                return (
                  <div key={i.id} className="row" style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", cursor: "pointer", flexWrap: "nowrap" }} onClick={() => setQty(i.id, n ? 0 : 1)}>
                    <input type="checkbox" checked={n > 0} readOnly style={{ accentColor: "var(--accent)", flexShrink: 0 }} />
                    <span style={{ flex: 1, fontWeight: n ? 600 : 400 }}>{i.name}</span>
                    {n > 0 && (
                      <span className="row" onClick={(e) => e.stopPropagation()} style={{ flexWrap: "nowrap" }}>
                        <button type="button" className="ghost small" onClick={() => setQty(i.id, Math.max(1, n - 1))}><Minus size={12} /></button>
                        <b>{n}</b>
                        <button type="button" className="ghost small" onClick={() => setQty(i.id, n + 1)}><Plus size={12} /></button>
                      </span>
                    )}
                    <span className="muted small" style={{ minWidth: 60, textAlign: "right" }}>{i.duree}</span>
                    {n > 0
                      ? <input type="number" min={0} step="any" title="Prix unitaire HT" style={{ width: 90 }} onClick={(e) => e.stopPropagation()} value={edit.price[i.id] ?? i.prix} onChange={(e) => setEdit({ ...edit, price: { ...edit.price, [i.id]: Number(e.target.value) } })} />
                      : <b style={{ minWidth: 70, textAlign: "right", color: "var(--accent)" }}>{i.prix ? `${i.from ? "dès " : ""}${eur(i.prix)}` : "sur devis"}</b>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <div style={{ marginTop: 14 }}>
          <div className="eyebrow">déplacement</div>
          <div className="card" style={{ cursor: "default" }}>
            <div className="row">
              <input style={{ flex: 3 }} placeholder="Lieu du tournage (vide = adresse du client)" value={trip.to} onChange={(e) => setTrip({ ...trip, to: e.target.value })} />
              <button type="button" className="ghost" disabled={trip.busy} onClick={calcTrip}><Car size={15} /> {trip.busy ? "Calcul…" : "Calculer les km"}</button>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <label className="muted small row">Km aller <input style={{ width: 80 }} type="number" min={0} value={trip.km} onChange={(e) => setTrip({ ...trip, km: Number(e.target.value) })} /></label>
              <label className="check small"><input type="checkbox" checked={trip.round} onChange={(e) => setTrip({ ...trip, round: e.target.checked })} /> Aller-retour</label>
              <label className="muted small row">€ / km <input style={{ width: 80 }} type="number" min={0} step="0.01" value={trip.rate} onChange={(e) => setTrip({ ...trip, rate: Number(e.target.value) })} /></label>
              <b>{tripKm} km · {eur(tripKm * trip.rate)}</b>
              <button type="button" className="primary small" disabled={!(tripKm > 0)} onClick={addTrip}><Plus size={14} /> Ajouter au devis</button>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <label className="muted small row" style={{ flex: 1 }}>Départ <input style={{ flex: 1 }} placeholder={trip.defaultFrom || "Ton adresse"} value={trip.from} onChange={(e) => setTrip({ ...trip, from: e.target.value })} onBlur={() => api("quotes/travel", "POST", { kmFrom: trip.from })} /></label>
            </div>
            {trip.info && <div className="muted small" style={{ marginTop: 6 }}>{trip.info}</div>}
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <div className="eyebrow">autre prestation</div>
          {edit.extra.map((l, i) => (
            <div key={i} className="row" style={{ marginBottom: 6 }}>
              <input style={{ flex: 4 }} placeholder="Libellé" value={l.label} onChange={(e) => setExtra(i, { label: e.target.value })} />
              <input style={{ width: 70 }} type="number" min={0} step="any" value={l.qty} onChange={(e) => setExtra(i, { qty: Number(e.target.value) })} />
              <input style={{ width: 100 }} type="number" min={0} step="any" value={l.unitPrice} onChange={(e) => setExtra(i, { unitPrice: Number(e.target.value) })} />
              <button type="button" className="ghost" onClick={() => setEdit({ ...edit, extra: edit.extra.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>
            </div>
          ))}
          <button type="button" className="ghost small" onClick={() => setEdit({ ...edit, extra: [...edit.extra, { label: "", qty: 1, unitPrice: 0 }] })}><Plus size={14} /> Ligne libre</button>
          <textarea style={{ width: "100%", marginTop: 8 }} rows={2} placeholder="Note sur le devis (facultatif)" value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} />
        </div>
      </fieldset>

      <div className="card" style={{ position: "sticky", bottom: 12, cursor: "default", marginTop: 16, zIndex: 2 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="muted small" style={{ flex: 1 }}>{msg || (lines.length ? `${lines.length} prestation${lines.length > 1 ? "s" : ""} · HT, TVA non applicable` : "Sélectionne des prestations")}</div>
          <div className="row">
            <b style={{ fontSize: 22 }}>{eur(total)}</b>
            {!locked && <button className="ghost" disabled={busy} onClick={saveOnly}><Save size={16} /> Enregistrer</button>}
            {!locked && <button className="primary" disabled={busy || !lines.length} onClick={send}><Send size={16} /> Envoyer au client</button>}
          </div>
        </div>
      </div>

      {/* ── Mes devis ── */}
      <div className="eyebrow" style={{ marginTop: 28 }}>mes devis</div>
      {!list.length && <p className="muted">Aucun devis pour l&apos;instant.</p>}
      {list.map((q) => {
        const b = parse<Buyer>(q.buyer, EMPTY_BUYER);
        return (
          <div key={q.id} className="card row" style={{ cursor: "default" }}>
            <b>{q.number}</b>
            <span style={{ flex: 1 }}>{b.name || "Sans client"} <span className="muted small">· {new Date(q.date).toLocaleDateString("fr-FR", { timeZone: "UTC" })}</span></span>
            <span>{eur(sum(parse(q.lines, [])))}</span>
            <span className={`tag ${q.status === "accepted" ? "ok" : q.status === "refused" ? "neg" : ""}`}>{STATUS[q.status]}</span>
            <a className="ghost small gbutton" href={`/api/quotes/${q.id}/pdf`} target="_blank" rel="noreferrer"><FileDown size={14} /> PDF</a>
            {q.signedName && <a className="ghost small gbutton" href={`/api/quotes/${q.id}/signed`} target="_blank" rel="noreferrer"><Paperclip size={14} /> Signé</a>}
            {q.status === "accepted" && q.invoiceId && <button className="ghost small" onClick={() => router.push(`/factures?open=${q.invoiceId}`)}>Voir la facture</button>}
            {q.status !== "accepted" && <button className="ghost small" onClick={() => open(q)}>Modifier</button>}
            {q.status !== "accepted" && <button className="ghost small" title="Supprimer" onClick={() => remove(q)}><Trash2 size={14} /></button>}
          </div>
        );
      })}
    </div>
  );
}
