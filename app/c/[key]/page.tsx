"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, CloudUpload, FileText, Film, ChevronRight } from "lucide-react";
import Logo from "@/components/Logo";
import { fetchJson } from "@/lib/fetchJson";
import { deliveryUrl, dropUrl } from "@/lib/site";
import LivLoader from "@/components/LivLoader";
import ContactBlock from "@/components/ContactBlock";

type Del = { token: string; title: string; thumb: string; kind: string; count: number; approved: boolean; validation: boolean; expiresAt: string; createdAt: string };
type Drop = { token: string; title: string; expiresAt: string };
type Doc = { id: string; number: string; date: string; status: string; kind?: string };
type Data = { name: string; deliveries: Del[]; drops: Drop[]; quotes: Doc[]; invoices: Doc[] };
const QS: Record<string, string> = { sent: "en attente", accepted: "validé", refused: "refusé" };
const IS: Record<string, string> = { sent: "à payer", paid: "payée" };
const IK: Record<string, string> = { standard: "Facture", deposit: "Acompte", final: "Solde", credit: "Avoir" };

const left = (iso: string) => {
  const n = Math.ceil((Date.parse(iso) - Date.now()) / 864e5);
  return n <= 1 ? "expire demain" : `encore ${n} jours`;
};

export default function Espace({ params }: { params: { key: string } }) {
  const url = `/api/espace/${params.key}`;
  const [d, setD] = useState<Data | null>(null);
  const [gate, setGate] = useState("");
  const [mail, setMail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const viewer = () => { try { return localStorage.getItem("liv-viewer") ?? ""; } catch { return ""; } };

  const load = (who = viewer()) => fetchJson(url, { headers: { "x-viewer": who } }).then(async ({ ok, status, j }) => {
    if (status === 401 && j.needEmail) { setGate(j.name); return; }
    if (!ok) throw new Error(j.error);
    setGate(""); setD(j);
  }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function enter(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: mail }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setBusy(false); setError(j.error ?? "Erreur"); return; }
    try { localStorage.setItem("liv-viewer", j.email); } catch {}
    await load(j.email);
    setBusy(false);
  }

  const logo = <a className="logo-link" href="https://maderinoprod.com" target="_blank" rel="noreferrer" aria-label="maderinoprod.com"><Logo /></a>;
  if (gate && !d) return (
    <div className="rdv liv-dark-solo"><form className="rdv-card" onSubmit={enter}>
      {logo}
      <h1>{gate}</h1>
      <p className="muted">Entre ton adresse mail pour accéder à ton espace. On ne te la redemandera plus, et tu recevras un rappel avant que tes liens expirent.</p>
      <input type="email" required autoFocus autoComplete="email" placeholder="ton@mail.com" value={mail} onChange={(e) => setMail(e.target.value)} />
      {error && <p className="neg small">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? "…" : "Accéder à mon espace"}</button>
    </form></div>
  );
  if (error && !d) return <div className="rdv liv-dark-solo"><div className="rdv-card">{logo}<p className="neg">{error}</p><ContactBlock /></div></div>;
  if (!d) return <LivLoader />;

  const quotes = d.quotes ?? [], invoices = d.invoices ?? [];
  const empty = !d.deliveries.length && !d.drops.length && !quotes.length && !invoices.length;
  return (
    <div className="rdv liv-dark-solo"><div className="rdv-card esp">
      {logo}
      <div><div className="muted small">Espace client</div><h1>{d.name}</h1></div>
      {empty && <p className="muted">Rien en cours pour l&apos;instant. Tes prochaines livraisons apparaîtront ici.</p>}
      {d.deliveries.length > 0 && <div className="esp-sec"><h3>Tes livraisons</h3>
        {d.deliveries.map((x) => (
          <a key={x.token} className="esp-item" href={deliveryUrl({ token: x.token, client: d.name }).replace(/^https?:\/\/[^/]+/, "")}>
            <span className="esp-thumb">{x.thumb ? <img src={x.thumb} alt="" /> : <Film size={20} />}</span>
            <span className="esp-txt">
              <b>{x.title}</b>
              <span className="muted small">{x.approved ? <span className="esp-ok"><CheckCircle2 size={13} /> validée</span> : x.validation ? "à regarder et valider" : "prête"} · {left(x.expiresAt)}</span>
            </span>
            <ChevronRight size={18} className="muted" />
          </a>
        ))}
      </div>}
      {d.drops.length > 0 && <div className="esp-sec"><h3>Envoie-moi tes fichiers</h3>
        {d.drops.map((x) => (
          <a key={x.token} className="esp-item" href={dropUrl({ token: x.token, client: d.name }).replace(/^https?:\/\/[^/]+/, "")}>
            <span className="esp-thumb"><CloudUpload size={20} /></span>
            <span className="esp-txt"><b>{x.title}</b><span className="muted small">dépôt ouvert · {left(x.expiresAt)}</span></span>
            <ChevronRight size={18} className="muted" />
          </a>
        ))}
      </div>}
      {(quotes.length > 0 || invoices.length > 0) && <div className="esp-sec"><h3>Tes devis et factures</h3>
        {[...quotes.map((x) => ({ ...x, t: "quote", label: `Devis ${x.number}`, st: QS[x.status] ?? x.status })), ...invoices.map((x) => ({ ...x, t: "invoice", label: `${IK[x.kind ?? ""] ?? "Facture"} ${x.number}`, st: IS[x.status] ?? x.status }))].map((x) => (
          <a key={x.t + x.id} className="esp-item" href={`/api/espace/${params.key}/doc?t=${x.t}&id=${x.id}`} target="_blank" rel="noreferrer">
            <span className="esp-thumb"><FileText size={20} /></span>
            <span className="esp-txt"><b>{x.label}</b><span className="muted small">{new Date(x.date).toLocaleDateString("fr-FR", { timeZone: "UTC" })} · {x.st}</span></span>
            <ChevronRight size={18} className="muted" />
          </a>
        ))}
      </div>}
      <ContactBlock />
    </div></div>
  );
}
