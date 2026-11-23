"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Receipt } from "lucide-react";
import { api, eur } from "@/lib/api";
import { CATALOGUE } from "@/lib/pricing";

// Devis : on compose avec la grille tarifaire, puis le devis devient une facture brouillon dans Factures
export default function Devis() {
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [client, setClient] = useState({ name: "", email: "" });
  const [busy, setBusy] = useState(false);

  const items = CATALOGUE.flatMap((s) => s.items);
  const chosen = items.filter((i) => (qty[i.id] ?? 0) > 0);
  const total = chosen.reduce((s, i) => s + i.prix * qty[i.id], 0);
  const set = (id: string, n: number) => setQty((q) => ({ ...q, [id]: Math.max(0, n) }));

  async function toInvoice() {
    if (!chosen.length) return;
    setBusy(true);
    try {
      const inv = await api<{ id: string }>("invoices", "POST", {
        client: client.name,
        buyer: { name: client.name, siren: "", address: "", zip: "", city: "", email: client.email, vat: "" },
        lines: chosen.map((i) => ({ label: i.name, qty: qty[i.id], unitPrice: i.prix })),
      });
      router.push(`/factures?open=${inv.id}`);
    } catch (e) {
      alert(String((e as Error).message));
      setBusy(false);
    }
  }

  return (
    <div className="content wide">
      <div className="eyebrow">devis</div>
      <h1 className="title">on chiffre <span className="accent">le projet.</span></h1>
      <p className="muted">Coche les prestations. Tarifs HT, TVA non applicable (art. 293 B du CGI). « Passer en facture » crée une facture brouillon dans Factures, que tu peux encore modifier avant de l&apos;envoyer.</p>

      <div className="row" style={{ margin: "12px 0" }}>
        <input placeholder="Client" value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} />
        <input placeholder="Mail du client (facultatif)" type="email" value={client.email} onChange={(e) => setClient({ ...client, email: e.target.value })} />
      </div>

      {CATALOGUE.map((s) => (
        <div key={s.section} style={{ marginTop: 18 }}>
          <div className="eyebrow">{s.section}</div>
          <div className="card" style={{ cursor: "default", padding: 0 }}>
            {s.items.map((i) => {
              const n = qty[i.id] ?? 0;
              return (
                <div key={i.id} className="row" style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", cursor: "pointer", flexWrap: "nowrap" }} onClick={() => set(i.id, n ? 0 : 1)}>
                  <input type="checkbox" checked={n > 0} readOnly style={{ accentColor: "var(--accent)", flexShrink: 0 }} />
                  <span style={{ flex: 1, fontWeight: n ? 600 : 400 }}>{i.name}</span>
                  {n > 0 && (
                    <span className="row" onClick={(e) => e.stopPropagation()} style={{ flexWrap: "nowrap" }}>
                      <button className="ghost small" onClick={() => set(i.id, Math.max(1, n - 1))}><Minus size={12} /></button>
                      <b>{n}</b>
                      <button className="ghost small" onClick={() => set(i.id, n + 1)}><Plus size={12} /></button>
                    </span>
                  )}
                  <span className="muted small" style={{ minWidth: 80, textAlign: "right" }}>{i.duree}</span>
                  <b style={{ minWidth: 70, textAlign: "right", color: "var(--accent)" }}>{eur(i.prix * (n || 1))}</b>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="card" style={{ position: "sticky", bottom: 12, cursor: "default", marginTop: 20 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="muted small" style={{ flex: 1 }}>{chosen.length ? chosen.map((i) => `${i.name}${qty[i.id] > 1 ? ` ×${qty[i.id]}` : ""}`).join(" · ") : "Sélectionne des prestations"}</div>
          <div className="row">
            <b style={{ fontSize: 22 }}>{eur(total)}</b>
            <button className="ghost" onClick={() => setQty({})}>Effacer</button>
            <button className="primary" disabled={!chosen.length || busy} onClick={toInvoice}><Receipt size={16} /> Passer en facture</button>
          </div>
        </div>
      </div>
    </div>
  );
}
