import type { Metadata } from "next";
import DeadLink from "@/components/DeadLink";
import { db } from "@/lib/db";
import { tokenOf } from "@/lib/site";
import { euro, getConfig, itemsOf, totalOf } from "@/lib/invoices";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Facture", robots: { index: false } };

const d = (x: Date | null) => (x ? x.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }) : "");
const Lines = ({ t }: { t: string }) => <>{t.split("\n").filter(Boolean).map((l, i) => <div key={i}>{l}</div>)}</>;

// Facture vue par le client (lien envoyé par mail) ; « Télécharger en PDF » = impression du navigateur
export default async function Facture({ params }: { params: { token: string } }) {
  const inv = await db.invoice.findUnique({ where: { token: tokenOf(params.token) } }).catch(() => null);
  if (!inv) return <DeadLink />;
  const cfg = await getConfig();
  const items = itemsOf(inv.items);
  const total = totalOf(items);
  return (
    <div className="inv-wrap">
      <style>{`
        .inv-wrap{background:#f3f1ee;min-height:100vh;padding:24px 16px;color:#1c1814;font-family:Arial,Helvetica,sans-serif}
        .inv{max-width:800px;margin:0 auto;background:#fff;padding:48px;border-radius:10px;box-shadow:0 2px 14px rgba(0,0,0,.06)}
        .inv h1{font-size:28px;margin:0 0 4px}
        .inv-top{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap;margin-bottom:36px}
        .inv-box{font-size:13px;line-height:1.55}
        .inv-label{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#888;margin-bottom:4px}
        .inv table{width:100%;border-collapse:collapse;font-size:13px;margin:20px 0}
        .inv th{text-align:left;border-bottom:2px solid #1c1814;padding:8px 6px}
        .inv td{border-bottom:1px solid #eee;padding:10px 6px;vertical-align:top}
        .inv .r{text-align:right;white-space:nowrap}
        .inv-total{display:flex;justify-content:flex-end;font-size:18px;font-weight:bold;gap:24px;margin-top:8px}
        .inv-foot{margin-top:40px;font-size:11px;color:#666;line-height:1.5}
        .inv-paid{display:inline-block;background:#1f9d55;color:#fff;border-radius:6px;padding:3px 10px;font-size:12px;font-weight:bold}
        .inv-bar{max-width:800px;margin:0 auto 14px;display:flex;justify-content:flex-end}
        @media(max-width:600px){.inv{padding:24px 18px}}
        @media print{.inv-wrap{background:#fff;padding:0}.inv{box-shadow:none;padding:0;max-width:none}.inv-bar{display:none}@page{margin:16mm}}
      `}</style>
      <div className="inv-bar"><PrintButton /></div>
      <div className="inv">
        <div className="inv-top">
          <div className="inv-box">
            <b style={{ fontSize: 15 }}>{cfg.name}</b>
            <Lines t={cfg.address} />
            {cfg.siret && <div>SIRET : {cfg.siret}</div>}
            {cfg.email && <div>{cfg.email}</div>}
            {cfg.phone && <div>{cfg.phone}</div>}
          </div>
          <div className="inv-box" style={{ textAlign: "right" }}>
            <h1>Facture</h1>
            <div><b>N° {inv.number}</b></div>
            <div>Date : {d(inv.date)}</div>
            {inv.dueDate && <div>Échéance : {d(inv.dueDate)}</div>}
            {inv.status === "paid" && <div style={{ marginTop: 6 }}><span className="inv-paid">Payée le {d(inv.paidAt)}</span></div>}
          </div>
        </div>
        <div className="inv-box">
          <div className="inv-label">Facturé à</div>
          <b>{inv.client}</b>
          <Lines t={inv.address} />
          {inv.siret && <div>SIRET / TVA : {inv.siret}</div>}
        </div>
        <table>
          <thead><tr><th>Désignation</th><th className="r">Qté</th><th className="r">Prix unitaire</th><th className="r">Total</th></tr></thead>
          <tbody>
            {items.map((i, k) => (
              <tr key={k}><td style={{ whiteSpace: "pre-wrap" }}>{i.label}</td><td className="r">{i.qty}</td><td className="r">{euro(i.price)}</td><td className="r">{euro(i.qty * i.price)}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="inv-total"><span>Total à payer</span><span>{euro(total)}</span></div>
        {inv.notes && <div className="inv-box" style={{ marginTop: 24, whiteSpace: "pre-wrap" }}>{inv.notes}</div>}
        {(cfg.iban || cfg.bic) && (
          <div className="inv-box" style={{ marginTop: 24 }}>
            <div className="inv-label">Paiement par virement</div>
            {cfg.iban && <div>IBAN : {cfg.iban}</div>}
            {cfg.bic && <div>BIC : {cfg.bic}</div>}
          </div>
        )}
        <div className="inv-foot"><Lines t={cfg.mentions} /></div>
      </div>
    </div>
  );
}
