"use client";
import { useEffect, useState } from "react";
import { Copy, ExternalLink, Plus, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";

type D = { id: string; title: string; createdAt: string; approvedV: number; approvedAt: string | null };
type Billing = { siren: string; address: string; zip: string; city: string; vat: string; email: string; phone: string };
type Q = { id: string; number: string; date: string; status: string; total: number; invoiceId: string; signed: boolean };
type I = { id: string; number: string; date: string; status: string; kind: string; total: number; credited?: number; linked?: boolean; cancelled?: boolean; refOf?: string };
const eur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const fr = (d: string) => new Date(d).toLocaleDateString("fr-FR", { timeZone: "UTC" });
const QS: Record<string, string> = { draft: "brouillon", sent: "en attente", accepted: "validé", refused: "refusé" };
const IS: Record<string, string> = { draft: "brouillon", sent: "à payer", paid: "payée" };
const IK: Record<string, string> = { standard: "Facture", deposit: "Acompte", final: "Solde", credit: "Avoir" };
type C = { quotes: Q[]; invoices: I[]; space: string; id: string; name: string; emails: string[]; note: string; billing: Billing; deliveries: D[]; drops: { id: string; title: string; active: boolean; createdAt: string; files: number }[] };

export default function Clients() {
  const [list, setList] = useState<C[]>([]);
  const [open, setOpen] = useState("");
  const [name, setName] = useState("");
  const [mail, setMail] = useState("");
  const load = () => api<C[]>("clients").then(setList).catch(() => {});
  useEffect(() => { load(); }, []);

  const save = async (c: C, patch: Partial<C>) => { const n = { ...c, ...patch }; setList((l) => l.map((x) => (x.id === c.id ? n : x))); await api("clients", "POST", { id: c.id, emails: n.emails, note: n.note, billing: n.billing }); };

  return (
    <div className="content narrow">
      <div className="eyebrow">clients</div>
      <h1 className="title">tes <span className="accent">clients.</span></h1>
      <p className="muted">Chaque client a son espace (lien fixe) : ses livraisons et dépôts de rushs en cours s'y ajoutent tout seuls, et disparaissent une fois expirés. Les mails enregistrés ici reçoivent les mails « nouvelle livraison » et les rappels avant expiration, et ne sont plus demandés au client. Les mails donnés sur un lien s'ajoutent tout seuls.</p>
      <form className="row" style={{ margin: "12px 0 16px" }} onSubmit={async (e) => { e.preventDefault(); if (!name.trim()) return; await api("clients", "POST", { name }); setName(""); load(); }}>
        <input placeholder="Nouveau client" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="primary"><Plus size={16} /> Ajouter</button>
      </form>
      {list.length === 0 && <p className="muted">Aucun client pour l'instant.</p>}
      {list.map((c) => (
        <section key={c.id} className="settings-card">
          <div className="liv-row" onClick={() => { setOpen(open === c.id ? "" : c.id); setMail(""); }}>
            <div>
              <b>{c.name}</b>
              {(() => {
                const em = c.invoices.filter((i) => i.status !== "draft");
                // Un avoir rattaché à une facture se déduit de celle-ci (et ne compte pas à part)
                const net = (i: I) => i.total - (i.credited ?? 0);
                const paid = em.filter((i) => i.status === "paid" && !i.linked).reduce((n, i) => n + (i.kind === "credit" ? i.total : net(i)), 0);
                const unpaid = em.filter((i) => i.status === "sent" && !i.linked).reduce((n, i) => n + Math.max(0, net(i)), 0);
                const pending = c.quotes.filter((q) => q.status === "sent").reduce((n, q) => n + q.total, 0);
                return (em.length > 0 || pending > 0) && (
                  <div className="client-money">
                    {paid !== 0 && <span className="ok">{eur(paid)} encaissé</span>}
                    {unpaid !== 0 && <span className="warn">{eur(unpaid)} à encaisser</span>}
                    {pending > 0 && <span>{eur(pending)} en devis</span>}
                  </div>
                );
              })()}
              <div className="muted small">{c.quotes.length} devis · {c.invoices.length} facture{c.invoices.length > 1 ? "s" : ""} · {c.deliveries.length} livraison{c.deliveries.length > 1 ? "s" : ""} · {c.drops.length} dépôt{c.drops.length > 1 ? "s" : ""} de rushs · {c.emails.length ? c.emails.join(", ") : "aucun mail"}</div>
            </div>
          </div>
          {open === c.id && (
            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
                <button className="primary" onClick={() => navigator.clipboard?.writeText(c.space)}><Copy size={15} /> Copier son espace client</button>
                <button onClick={() => window.open(c.space, "_blank")}><ExternalLink size={15} /> Voir</button>
              </div>
              <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
                {c.emails.map((e) => <span key={e} className="ok-pill">{e} <X size={13} style={{ cursor: "pointer" }} onClick={() => save(c, { emails: c.emails.filter((x) => x !== e) })} /></span>)}
              </div>
              <form className="row" onSubmit={(e) => { e.preventDefault(); const m = mail.trim().toLowerCase(); if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m)) { save(c, { emails: Array.from(new Set([...c.emails, m])) }); setMail(""); } }}>
                <input type="email" placeholder="ajouter un mail" value={mail} onChange={(e) => setMail(e.target.value)} />
                <button className="ghost"><Plus size={15} /></button>
              </form>
              <div className="muted small"><b>Coordonnées de facturation</b> (reprises dans les devis et factures)</div>
              <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
                {([["address", "Adresse", 3], ["zip", "Code postal", 1], ["city", "Ville", 2], ["siren", "SIREN (vide si particulier)", 2], ["vat", "N° TVA", 2], ["email", "Mail de facturation", 2], ["phone", "Téléphone", 2]] as const).map(([k, label, flex]) => (
                  <input key={k} style={{ flex }} placeholder={label} defaultValue={c.billing?.[k] ?? ""} onBlur={(e) => e.target.value !== (c.billing?.[k] ?? "") && save(c, { billing: { ...c.billing, [k]: e.target.value } })} />
                ))}
              </div>
              <textarea placeholder="Note (contact, habitudes, tarifs…)" defaultValue={c.note} onBlur={(e) => e.target.value !== c.note && save(c, { note: e.target.value })} />
              {(c.quotes.length > 0 || c.invoices.length > 0) && (
                <div className="client-docs">
                  {c.quotes.length > 0 && <div><b className="small">Devis</b>{c.quotes.map((q) => (
                    <a key={q.id} className="client-doc" href={`/api/quotes/${q.id}/pdf`} target="_blank" rel="noreferrer"><span>{q.number}{q.signed ? " · signé" : ""}</span><span className="muted">{fr(q.date)}</span><span className={`tag ${q.status}`}>{QS[q.status] ?? q.status}</span><b>{eur(q.total)}</b>{q.status !== "accepted" && <span className="row" style={{ gap: 4 }} onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                      {q.status === "sent" && <button className="ghost small" title="Annuler (refusé)" onClick={async () => { await api(`quotes/${q.id}`, "PATCH", { status: "refused" }); load(); }}><X size={14} /></button>}
                      <button className="ghost small" title="Supprimer le devis" onClick={async () => { if (confirm(`Supprimer le devis ${q.number} ?`)) { await api(`quotes/${q.id}`, "DELETE"); load(); } }}><Trash2 size={14} /></button>
                    </span>}</a>
                  ))}</div>}
                  {c.invoices.length > 0 && <div><b className="small">Factures</b>{[...c.invoices.filter((i) => !i.linked).flatMap((i) => (i.cancelled ? [i] : [i, ...c.invoices.filter((x) => x.linked && x.refOf === i.id)])), ...c.invoices.filter((x) => x.linked && !c.invoices.some((o) => o.id === x.refOf))].map((i) => (
                    <a key={i.id} className={`client-doc${i.cancelled ? " inv-cancelled" : ""}${i.linked ? " inv-credit" : ""}`} href={`/factures?open=${i.id}`}><span>{IK[i.kind] ?? "Facture"} {i.number}</span><span className="muted">{fr(i.date)}</span>{i.cancelled ? <span className="tag neg">annulée</span> : i.kind === "credit" ? <span className="tag">{i.status === "draft" ? "brouillon" : "émis"}</span> : <span className={`tag ${i.status}`}>{IS[i.status] ?? i.status}</span>}<b>{eur(i.cancelled ? 0 : i.total - (i.linked ? 0 : i.credited ?? 0))}</b></a>
                  ))}</div>}
                </div>
              )}
              <div className="row" style={{ gap: 6 }}>
                <a className="gbutton" href="/devis"><Plus size={14} /> Nouveau devis</a>
              </div>
              {c.drops.length > 0 && <div className="muted small"><b>Dépôts de rushs</b>{c.drops.map((d) => <div key={d.id}>· {d.title} — {d.files} fichier{d.files > 1 ? "s" : ""} reçu{d.files > 1 ? "s" : ""}{d.active ? "" : " (fermé)"}</div>)}</div>}
              {c.deliveries.length > 0 && <div className="muted small"><b>Livraisons</b>{c.deliveries.map((d) => <div key={d.id}>· {d.title} — {new Date(d.createdAt).toLocaleDateString("fr-FR")}{d.approvedAt ? " ✓ validée" : ""}</div>)}</div>}
              <div><button className="ghost" onClick={async () => { if (confirm(`Supprimer la fiche « ${c.name} » ? (les livraisons restent)`)) { await api("clients", "POST", { id: c.id, delete: true }); load(); } }}><Trash2 size={15} /> Supprimer la fiche</button></div>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
