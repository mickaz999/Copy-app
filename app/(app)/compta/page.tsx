"use client";
import { useEffect, useState } from "react";
import { Download, Plus, Settings2 } from "lucide-react";
import { api, eur, isoDay } from "@/lib/api";

type Tx = {
  id: string; date: string; label: string; kind: string; amount: number;
  category: string; client: string; payment: string; reference: string; noCotis?: boolean;
};
type Settings = { rate: number; ceiling: number; activity: string };

const PAYMENTS = ["Virement", "Carte", "Espèces", "Chèque", "PayPal", "Autre"];
const MONTHS = ["Janv", "Févr", "Mars", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"];

export default function Compta() {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [kind, setKind] = useState("");
  const [edit, setEdit] = useState<Partial<Tx> | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [manage, setManage] = useState(false);
  const [allMonths, setAllMonths] = useState(false);

  const load = () => api<Tx[]>("transactions").then(setTxs);
  useEffect(() => { load(); api<Settings>("settings").then(setSettings); }, []);

  const ofYear = txs.filter((t) => t.date.startsWith(String(year)));
  const sum = (list: Tx[], k: string) => list.filter((t) => t.kind === k).reduce((s, t) => s + t.amount, 0);
  const ca = sum(ofYear, "recette");
  const depenses = sum(ofYear, "depense");
  const rate = settings?.rate ?? 0;
  // Base des cotisations : recettes, sauf celles cochées « ne pas compter dans les cotisations »
  const base = (list: Tx[]) => list.filter((t) => t.kind === "recette" && !t.noCotis).reduce((s, t) => s + t.amount, 0);
  const cotis = (base(ofYear) * rate) / 100;
  const ceiling = settings?.ceiling ?? 0;
  const pct = ceiling ? Math.min(100, (ca / ceiling) * 100) : 0;

  const isSub = (t: Tx) => t.kind === "depense" && (t.category ?? "").split(",").some((x) => /abonnement/i.test(x));
  const byMonth = MONTHS.map((m, i) => {
    const key = `${year}-${String(i + 1).padStart(2, "0")}`;
    const list = ofYear.filter((t) => t.date.startsWith(key));
    const r = sum(list, "recette");
    return { key, m, r, d: sum(list, "depense"), c: (base(list) * rate) / 100, a: list.filter(isSub).reduce((s, t) => s + t.amount, 0) };
  });
  const quarters = [0, 1, 2, 3].map((q) => byMonth.slice(q * 3, q * 3 + 3).reduce((s, x) => s + x.r, 0));

  // Tags (créés librement, plusieurs par ligne, séparés par des virgules dans « category »)
  const tagsOf = (t: { category?: string }) => (t.category ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const allTags = Array.from(new Set(txs.flatMap(tagsOf))).sort((a, b) => a.localeCompare(b, "fr"));
  const [tag, setTag] = useState("");
  // Abonnements : dépenses avec un tag « abonnement » (Adobe, Frame.io…), comptées mois par mois
  const thisMonth = year === new Date().getFullYear() ? new Date().getMonth() : 11;
  // Estimation des abonnements par mois : chaque abonnement (même fournisseur ou libellé) vu ces 2 derniers mois,
  // compté une fois à son dernier montant → ce que je vais payer chaque mois
  const recent = txs.filter(isSub).filter((t) => Date.now() - Date.parse(t.date) < 62 * 864e5).sort((a, b) => b.date.localeCompare(a.date));
  const lastBy = new Map<string, Tx>();
  for (const t of recent) { const k = (t.client || t.label).trim().toLowerCase(); if (!lastBy.has(k)) lastBy.set(k, t); }
  const subsEstimate = Array.from(lastBy.values()).reduce((s, t) => s + t.amount, 0);
  const rows = ofYear.filter((t) => (!kind || t.kind === kind) && (!tag || tagsOf(t).includes(tag)));
  const years = Array.from(new Set([new Date().getFullYear(), ...txs.map((t) => Number(t.date.slice(0, 4)))])).sort((a, b) => b - a);

  async function saveEdit() {
    if (!edit?.label?.trim() || !edit.date) return;
    // Nouvelle dépense d'un abonnement déjà connu (même fournisseur ou libellé) : tag « Abonnement » ajouté tout seul
    let row = edit;
    if (!edit.id && edit.kind === "depense" && !tagsOf(edit).some((x) => /abonnement/i.test(x))) {
      const k = (edit.client || edit.label || "").trim().toLowerCase();
      const known = txs.find((t) => isSub(t) && (t.client || t.label).trim().toLowerCase() === k);
      if (known) row = { ...edit, category: [...tagsOf(edit), tagsOf(known).find((x) => /abonnement/i.test(x))!].join(", ") };
    }
    if (row.id) await api(`transactions/${row.id}`, "PATCH", row);
    else await api("transactions", "POST", row);
    setEdit(null);
    load();
  }

  async function remove() {
    if (edit?.id && confirm("Supprimer cette ligne ?")) await api(`transactions/${edit.id}`, "DELETE");
    setEdit(null);
    load();
  }

  async function saveSettings() {
    if (settings) setSettings(await api<Settings>("settings", "POST", settings));
    setShowSettings(false);
  }

  function exportCsv() {
    const head = ["Date", "Type", "Libellé", "Client / Fournisseur", "N° facture", "Catégorie", "Mode de paiement", "Montant"];
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = rows
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((t) => [t.date.slice(0, 10), t.kind, t.label, t.client, t.reference, t.category, t.payment, t.amount.toFixed(2).replace(".", ",")].map(esc).join(";"));
    const blob = new Blob(["﻿" + [head.map(esc).join(";"), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${kind === "recette" ? "livre-recettes" : kind === "depense" ? "registre-achats" : "compta"}-${year}.csv`;
    a.click();
  }

  return (
    <div className="content">
      <div className="eyebrow">compta</div>
      <h1 className="title">ce qu&apos;on <span className="accent">encaisse.</span></h1>
      <div className="row">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {years.map((y) => <option key={y}>{y}</option>)}
        </select>
        <span className="muted">{settings?.activity} · cotisations {rate} %</span>
        <button className="ghost" onClick={() => setShowSettings(true)}><Settings2 size={16} /> Réglages</button>
        <span style={{ flex: 1 }} />
        <button className="primary" onClick={() => setEdit({ date: isoDay(new Date()), kind: "recette", label: "", amount: 0, payment: "Virement", client: "", category: "", reference: "" })}><Plus size={16} /> Nouvelle ligne</button>
      </div>

      <div className="stats">
        <div className="stat"><div className="muted">Chiffre d'affaires encaissé</div><div className="v pos">{eur(ca)}</div></div>
        <div className="stat"><div className="muted">Cotisations URSSAF estimées</div><div className="v">{eur(cotis)}</div></div>
        <div className="stat"><div className="muted">Dépenses</div><div className="v neg">{eur(depenses)}</div></div>
        <div className="stat" title={Array.from(lastBy.values()).map((t) => `${t.client || t.label} : ${eur(t.amount)}`).join("\n")}><div className="muted">Abonnements estimés</div><div className="v neg">{eur(subsEstimate)}<span className="small muted"> /mois</span></div><div className="small muted">{lastBy.size ? `${lastBy.size} abonnement${lastBy.size > 1 ? "s" : ""} en cours` : "Tague tes dépenses « Abonnement »"}</div></div>
        <div className="stat"><div className="muted">Reste estimé</div><div className="v">{eur(ca - cotis - depenses)}</div></div>
        <div className="stat">
          <div className="muted">Plafond micro ({eur(ceiling)})</div>
          <div className="v">{pct.toFixed(0)} %</div>
          <div className="bar"><div style={{ width: `${pct}%`, background: pct > 90 ? "var(--red)" : undefined }} /></div>
        </div>
      </div>

      <div className="row" style={{ margin: "28px 0 8px" }}>
        <h3 style={{ margin: 0 }}>Par mois</h3>
        <span style={{ flex: 1 }} />
        <button className="ghost small" onClick={() => setAllMonths(!allMonths)}>{allMonths ? "Mois avec activité" : "Tous les mois"}</button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="month-table">
          <thead><tr><th>Mois</th><th className="num">Recettes</th><th className="num">Dépenses</th><th className="num">dont abonnements</th><th className="num">URSSAF estimée</th><th className="num">Net</th></tr></thead>
          <tbody>
            {[0, 1, 2, 3].map((q) => {
              const months = byMonth.slice(q * 3, q * 3 + 3).map((x, j) => ({ ...x, i: q * 3 + j }));
              const shown = months.filter((x) => allMonths || x.r || x.d || x.i === thisMonth);
              if (!shown.length) return null;
              const qr = months.reduce((s, x) => s + x.r, 0);
              return [
                ...shown.map((x) => {
                  const net = x.r - x.d - x.c;
                  const v = (n: number, cls = "") => (n ? <span className={cls}>{eur(n)}</span> : <span className="month-empty">·</span>);
                  return (
                    <tr key={x.m} className={x.i === thisMonth ? "month-now" : ""}>
                      <td>{x.m}</td>
                      <td className="num">{v(x.r, "pos")}</td>
                      <td className="num">{v(x.d)}</td>
                      <td className="num muted">{v(x.a)}</td>
                      <td className="num muted">{v(x.c)}</td>
                      <td className="num"><b className={net >= 0 ? "" : "neg"}>{x.r || x.d ? eur(net) : <span className="month-empty">·</span>}</b></td>
                    </tr>
                  );
                }),
                <tr key={`q${q}`} className="month-q"><td colSpan={6}>Trimestre {q + 1} · CA {eur(qr)}</td></tr>,
              ];
            })}
            <tr className="month-total">
              <td>Total {year}</td>
              <td className="num pos">{eur(ca)}</td>
              <td className="num">{eur(depenses)}</td>
              <td className="num muted">{eur(byMonth.reduce((s, x) => s + x.a, 0))}</td>
              <td className="num muted">{eur(cotis)}</td>
              <td className="num"><b>{eur(ca - depenses - cotis)}</b></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="row" style={{ margin: "28px 0 8px" }}>
        <h3 style={{ margin: 0 }}>Journal</h3>
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Tout</option>
          <option value="recette">Livre des recettes</option>
          <option value="depense">Registre des achats</option>
        </select>
        {allTags.length > 0 && <select value={tag} onChange={(e) => setTag(e.target.value)}>
          <option value="">Tous les tags</option>
          {allTags.map((x) => <option key={x}>{x}</option>)}
        </select>}
        <span style={{ flex: 1 }} />
        <button onClick={exportCsv}><Download size={16} /> Export CSV</button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Date</th><th>Libellé</th><th>Client / Fournisseur</th><th>N° facture</th><th>Paiement</th><th className="num">Montant</th></tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} onClick={() => setEdit({ ...t, date: t.date.slice(0, 10) })} style={{ cursor: "pointer" }}>
                <td>{new Date(t.date).toLocaleDateString("fr-FR", { timeZone: "UTC" })}</td>
                <td>{t.label}{tagsOf(t).map((x) => <span key={x} className="tag" style={{ marginLeft: 6 }}>{x}</span>)}{t.noCotis && <span className="tag" style={{ marginLeft: 6 }}>hors cotisations</span>}</td>
                <td>{t.client}</td>
                <td>{t.reference}</td>
                <td>{t.payment}</td>
                <td className={`num ${t.kind === "recette" ? "pos" : "neg"}`}>{t.kind === "recette" ? "+" : "−"}{eur(t.amount)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="muted">Aucune ligne pour {year}.</td></tr>}
          </tbody>
        </table>
      </div>

      {edit && (
        <div className="overlay" onClick={() => setEdit(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="row">
              <button className={edit.kind === "recette" ? "primary" : ""} onClick={() => setEdit({ ...edit, kind: "recette" })}>Recette</button>
              <button className={edit.kind === "depense" ? "primary" : ""} onClick={() => setEdit({ ...edit, kind: "depense" })}>Dépense</button>
            </div>
            <label>Libellé<input autoFocus value={edit.label ?? ""} onChange={(e) => setEdit({ ...edit, label: e.target.value })} /></label>
            <div className="row">
              <label>Date d'encaissement<input type="date" value={edit.date ?? ""} onChange={(e) => setEdit({ ...edit, date: e.target.value })} /></label>
              <label>Montant (€)<input type="number" step="0.01" value={edit.amount ?? 0} onChange={(e) => setEdit({ ...edit, amount: Number(e.target.value) })} /></label>
            </div>
            <div className="row">
              <label>{edit.kind === "recette" ? "Client" : "Fournisseur"}<input value={edit.client ?? ""} onChange={(e) => setEdit({ ...edit, client: e.target.value })} /></label>
              <label>N° facture<input value={edit.reference ?? ""} onChange={(e) => setEdit({ ...edit, reference: e.target.value })} /></label>
            </div>
            <div className="row">

              <label>Paiement
                <select value={edit.payment} onChange={(e) => setEdit({ ...edit, payment: e.target.value })}>
                  {PAYMENTS.map((p) => <option key={p}>{p}</option>)}
                </select>
              </label>
            </div>
            <div className="tag-pick">
              <span className="muted small">Tags <button type="button" className="ghost small" onClick={() => setManage(!manage)}>{manage ? "Terminé" : "Gérer"}</button></span>
              {manage && <div className="tag-manage">
                {allTags.length === 0 && <span className="muted small">Aucun tag.</span>}
                {allTags.map((x) => (
                  <div key={x} className="row">
                    <input defaultValue={x} onBlur={async (e) => { const v = e.target.value.trim(); if (v && v !== x) { await api("tags", "POST", { from: x, to: v }); if (tagsOf(edit).includes(x)) setEdit({ ...edit, category: tagsOf(edit).map((y) => (y === x ? v : y)).join(", ") }); load(); } }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                    <button type="button" className="ghost neg" title="Supprimer ce tag partout" onClick={async () => { if (confirm(`Supprimer le tag « ${x} » de toutes les lignes ?`)) { await api("tags", "POST", { from: x }); setEdit({ ...edit, category: tagsOf(edit).filter((y) => y !== x).join(", ") }); load(); } }}>Supprimer</button>
                  </div>
                ))}
              </div>}
              <div className="tag-list">
                {Array.from(new Set([...allTags, ...tagsOf(edit)])).map((x) => {
                  const on = tagsOf(edit).includes(x);
                  return <button type="button" key={x} className={`tag-chip ${on ? "on" : ""}`} onClick={() => setEdit({ ...edit, category: (on ? tagsOf(edit).filter((y) => y !== x) : [...tagsOf(edit), x]).join(", ") })}>{on ? "✓ " : ""}{x}</button>;
                })}
                <input className="tag-new" placeholder="+ Nouveau tag" value={newTag} onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); const n = newTag.trim().replace(/,/g, ""); if (n) { setEdit({ ...edit, category: Array.from(new Set([...tagsOf(edit), n])).join(", ") }); setNewTag(""); } } }}
                  onBlur={() => { const n = newTag.trim().replace(/,/g, ""); if (n) { setEdit({ ...edit, category: Array.from(new Set([...tagsOf(edit), n])).join(", ") }); setNewTag(""); } }} />
              </div>
            </div>
            {edit.kind === "recette" && <label className="check"><input type="checkbox" checked={!!edit.noCotis} onChange={(e) => setEdit({ ...edit, noCotis: e.target.checked })} /> Ne pas compter dans les cotisations URSSAF</label>}
            <div className="row">
              {edit.id && <button className="neg" onClick={remove}>Supprimer</button>}
              <span style={{ flex: 1 }} />
              <button onClick={() => setEdit(null)}>Annuler</button>
              <button className="primary" onClick={saveEdit}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {showSettings && settings && (
        <div className="overlay" onClick={() => setShowSettings(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0 }}>Réglages micro-entreprise</h3>
            <label>Type d'activité<input value={settings.activity} onChange={(e) => setSettings({ ...settings, activity: e.target.value })} /></label>
            <label>Taux de cotisations URSSAF (%)<input type="number" step="0.1" value={settings.rate} onChange={(e) => setSettings({ ...settings, rate: Number(e.target.value) })} /></label>
            <label>Plafond de CA annuel (€)<input type="number" value={settings.ceiling} onChange={(e) => setSettings({ ...settings, ceiling: Number(e.target.value) })} /></label>
            <span className="muted">Les taux et plafonds changent régulièrement : vérifie les valeurs actuelles sur urssaf.fr / autoentrepreneur.urssaf.fr.</span>
            <div className="row"><span style={{ flex: 1 }} /><button className="primary" onClick={saveSettings}>Enregistrer</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
