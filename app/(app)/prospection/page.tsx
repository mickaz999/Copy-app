"use client";
import { useEffect, useMemo, useState } from "react";
import { Clock, Mail, Plus, Send, Settings2, StopCircle, Trash2, Upload, X } from "lucide-react";
import { api } from "@/lib/api";
import { DEFAULT_TEMPLATES, fill, leftovers, needsHook, type Template } from "@/lib/prospects";

type P = { id: string; name: string; email: string; company: string; hook: string; status: string; note: string; lastMail: string | null; mails: number; step: number; nextAt: string | null; subject: string };
type Draft = { to: string; subject: string; body: string };

const STATUS: Record<string, string> = { todo: "À contacter", contacted: "Contacté", replied: "A répondu", won: "Gagné", lost: "Perdu" };
const errText = (e: any) => { let m = String(e?.message ?? e); try { m = JSON.parse(m).error ?? m; } catch {} return m; };
const day = (d: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "");

// Prospect à traiter aujourd'hui : jamais contacté (avec mail) ou relance arrivée à échéance
const isDue = (p: P, n: number) => !!p.email && (p.status === "todo" ? p.step === 0 : p.status === "contacted" && !!p.nextAt && new Date(p.nextAt).getTime() <= Date.now() && p.step < n);

export default function Prospection() {
  const [list, setList] = useState<P[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState("");
  const [showCfg, setShowCfg] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [form, setForm] = useState({ name: "", email: "", company: "", hook: "" });
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [mail, setMail] = useState<{ p: P } & Draft | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  const load = () => api<{ list: P[]; templates: Template[] }>("prospects").then((r) => { setList(r.list); setTemplates(r.templates); }).catch(() => {});
  useEffect(() => { load(); }, []);

  const save = async (p: P, patch: Record<string, any>) => {
    const u = await api<P>("prospects", "POST", { id: p.id, ...patch });
    setList((l) => l.map((x) => (x.id === u.id ? u : x)));
  };
  const saveCfg = (t = templates) => api("prospects", "POST", { config: { templates: t } });
  const setTpl = (i: number, patch: Partial<Template>) => setTemplates(templates.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  // File du jour, avec le brouillon pré-rempli de l'étape en cours
  const due = useMemo(() => list.filter((p) => isDue(p, templates.length)), [list, templates.length]);
  const draftOf = (p: P): Draft => {
    if (drafts[p.id]) return drafts[p.id];
    const t = templates[p.step];
    return { to: p.email, subject: p.step > 0 && p.subject ? `Re: ${p.subject.replace(/^re:\s*/i, "")}` : fill(t?.subject ?? "", p), body: fill(t?.body ?? "", p) };
  };
  const problem = (p: P, d: Draft) => {
    if (p.step === 0 && needsHook(templates[0], p)) return "Ajoute une accroche perso avant d'envoyer";
    const left = leftovers(d.subject + d.body);
    if (left.length) return `Variable non remplacée : ${left.join(", ")}`;
    if (!d.subject.trim() || !d.body.trim()) return "Objet ou message vide";
    return "";
  };

  async function sendDraft(p: P) {
    const d = draftOf(p);
    if (problem(p, d)) return;
    setBusy(p.id); setMsg("");
    try {
      const u = await api<P>("prospects/send", "POST", { id: p.id, ...d, step: p.step });
      setList((l) => l.map((x) => (x.id === u.id ? u : x)));
      setDrafts(({ [p.id]: _, ...rest }) => rest);
      setMsg(`Envoyé à ${u.name}`);
    } catch (e) { setMsg(`Erreur pour ${p.name} : ${errText(e)}`); }
    setBusy("");
  }

  async function sendFree() {
    if (!mail) return;
    setBusy("free"); setMsg("");
    try {
      const u = await api<P>("prospects/send", "POST", { id: mail.p.id, to: mail.to, subject: mail.subject, body: mail.body });
      setList((l) => l.map((x) => (x.id === u.id ? u : x)));
      setMail(null); setMsg(`Envoyé à ${u.name}`);
    } catch (e) { setMsg(`Erreur : ${errText(e)}`); }
    setBusy("");
  }

  // Import : une ligne par prospect « nom ; mail ; marque ; accroche » (séparateur ; , ou tabulation)
  async function runImport() {
    const rows = importText.split("\n").map((l) => l.split(/\t|;/).map((c) => c.trim())).filter((c) => c[0]).map(([name, email = "", company = "", ...hook]) => ({ name, email, company, hook: hook.join("; ") }));
    if (!rows.length) return;
    const r = await api<{ added: number; skipped: number }>("prospects", "POST", { import: rows });
    setMsg(`${r.added} prospect${r.added > 1 ? "s" : ""} ajouté${r.added > 1 ? "s" : ""}${r.skipped ? `, ${r.skipped} ignoré${r.skipped > 1 ? "s" : ""} (déjà là ou sans nom)` : ""}`);
    setImportText(""); setShowImport(false); load();
  }

  const shown = list.filter((p) => filter === "all" || p.status === filter);
  const count = (s: string) => list.filter((p) => p.status === s).length;

  return (
    <div className="content narrow">
      <div className="eyebrow">prospection</div>
      <h1 className="title">trouve tes <span className="accent">prochains clients.</span></h1>
      <p className="muted">Chaque jour, les premiers mails et les relances à faire arrivent ici, déjà écrits. Tu relis, tu ajustes si besoin, tu envoies. Les relances partent dans le même fil Gmail et s'arrêtent dès que tu passes le prospect en « A répondu ».</p>

      <div className="row" style={{ margin: "10px 0", flexWrap: "wrap" }}>
        <button className="ghost" onClick={() => setShowCfg(!showCfg)}><Settings2 size={15} /> Séquence de mails</button>
        <button className="ghost" onClick={() => setShowImport(!showImport)}><Upload size={15} /> Importer une liste</button>
        {msg && <span className="muted" style={msg.startsWith("Erreur") ? { color: "var(--red)" } : undefined}>{msg}</span>}
      </div>

      {showCfg && (
        <section className="settings-card" style={{ display: "grid", gap: 10 }}>
          <p className="muted small">Les mails partent dans cet ordre. Variables : <b>{"{prénom}"}</b>, <b>{"{nom}"}</b>, <b>{"{marque}"}</b>, <b>{"{accroche}"}</b> (ta phrase perso pour ce prospect). Les relances reprennent l'objet du premier mail en « Re: ». Ta signature (Réglages) est ajoutée toute seule.</p>
          {templates.map((t, i) => (
            <div key={i} style={{ display: "grid", gap: 6, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
              <div className="row">
                <b style={{ minWidth: 24 }}>{i + 1}.</b>
                <input placeholder="Nom (ex. Relance 1)" value={t.name} onChange={(e) => setTpl(i, { name: e.target.value })} onBlur={() => saveCfg()} />
                {i > 0 && <label className="row muted small" style={{ whiteSpace: "nowrap" }}><input type="number" min={1} max={90} style={{ width: 60 }} value={t.delay} onChange={(e) => setTpl(i, { delay: Number(e.target.value) })} onBlur={() => saveCfg()} /> j après</label>}
                <button className="ghost" title="Supprimer" onClick={() => { const n = templates.filter((_, j) => j !== i); setTemplates(n); saveCfg(n); }}><Trash2 size={15} /></button>
              </div>
              {i === 0 && <input placeholder="Objet" value={t.subject} onChange={(e) => setTpl(i, { subject: e.target.value })} onBlur={() => saveCfg()} />}
              <textarea rows={7} value={t.body} onChange={(e) => setTpl(i, { body: e.target.value })} onBlur={() => saveCfg()} />
            </div>
          ))}
          <div><button onClick={() => { const n = [...templates, { name: "", subject: "", body: "", delay: 7 }]; setTemplates(n); saveCfg(n); }}><Plus size={15} /> Ajouter une étape</button> <button className="ghost" onClick={() => { if (confirm("Remplacer ta séquence par celle proposée par défaut ?")) { setTemplates(DEFAULT_TEMPLATES); saveCfg(DEFAULT_TEMPLATES); } }}>Séquence par défaut</button></div>
        </section>
      )}

      {showImport && (
        <section className="settings-card" style={{ display: "grid", gap: 8 }}>
          <p className="muted small">Une ligne par prospect : <b>nom ; mail ; marque ; accroche</b>. Tu peux aussi coller directement des colonnes copiées depuis un tableur. Les mails déjà présents sont ignorés.</p>
          <textarea rows={6} placeholder={"Léa Martin; lea@exemple.fr; LéaCuisine; J'ai vu ta vidéo sur les recettes en 5 min, le format marche super bien."} value={importText} onChange={(e) => setImportText(e.target.value)} />
          <div><button className="primary" onClick={runImport}><Upload size={15} /> Importer</button></div>
        </section>
      )}

      <form className="row" style={{ margin: "12px 0 16px", flexWrap: "wrap" }} onSubmit={async (e) => { e.preventDefault(); if (!form.name.trim()) return; await api("prospects", "POST", form); setForm({ name: "", email: "", company: "", hook: "" }); load(); }}>
        <input placeholder="Nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input type="email" placeholder="Mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input placeholder="Marque / chaîne" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
        <input style={{ flexBasis: "100%" }} placeholder="Accroche perso (ex. J'ai vu ton dernier live, le passage sur… m'a fait marrer)" value={form.hook} onChange={(e) => setForm({ ...form, hook: e.target.value })} />
        <button className="primary"><Plus size={16} /> Ajouter</button>
      </form>

      {due.length > 0 && (
        <>
          <h2 style={{ margin: "18px 0 8px" }}>À envoyer aujourd'hui ({due.length})</h2>
          {due.map((p) => {
            const d = draftOf(p);
            const pb = problem(p, d);
            const setD = (patch: Partial<Draft>) => setDrafts({ ...drafts, [p.id]: { ...d, ...patch } });
            return (
              <section key={p.id} className="settings-card" style={{ display: "grid", gap: 6 }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <div><b>{p.name}</b>{p.company && <span className="muted"> · {p.company}</span>}<div className="muted small">{templates[p.step]?.name || `Étape ${p.step + 1}`} · {p.email}</div></div>
                </div>
                {p.step === 0 && needsHook(templates[0], p) && (
                  <input placeholder="Accroche perso pour ce prospect (obligatoire)" defaultValue={p.hook} onBlur={async (e) => { if (e.target.value.trim() !== p.hook) { await save(p, { hook: e.target.value }); setDrafts(({ [p.id]: _, ...r }) => r); } }} />
                )}
                <input placeholder="Objet" value={d.subject} disabled={p.step > 0} onChange={(e) => setD({ subject: e.target.value })} />
                <textarea rows={7} value={d.body} onChange={(e) => setD({ body: e.target.value })} />
                {pb && <div className="small" style={{ color: "var(--red)" }}>{pb}</div>}
                <div className="row" style={{ flexWrap: "wrap" }}>
                  <button className="primary" disabled={!!pb || busy === p.id} onClick={() => sendDraft(p)}><Send size={15} /> {busy === p.id ? "Envoi…" : "Envoyer"}</button>
                  <button className="ghost" onClick={() => save(p, { snooze: 3 })}><Clock size={15} /> Dans 3 jours</button>
                  {p.step > 0 && <button className="ghost" onClick={() => save(p, { stop: true })}><StopCircle size={15} /> Arrêter les relances</button>}
                  {p.step > 0 && <button className="ghost" onClick={() => save(p, { status: "replied" })}>Il a répondu</button>}
                </div>
              </section>
            );
          })}
        </>
      )}

      <h2 style={{ margin: "18px 0 8px" }}>Tous les prospects</h2>
      <div className="row" style={{ marginBottom: 10, flexWrap: "wrap" }}>
        <button className={filter === "all" ? "primary" : ""} onClick={() => setFilter("all")}>Tous ({list.length})</button>
        {Object.entries(STATUS).map(([k, v]) => <button key={k} className={filter === k ? "primary" : ""} onClick={() => setFilter(k)}>{v} ({count(k)})</button>)}
      </div>

      {shown.length === 0 && <p className="muted">Aucun prospect ici.</p>}
      {shown.map((p) => (
        <section key={p.id} className="settings-card">
          <div className="liv-row" onClick={() => setOpen(open === p.id ? "" : p.id)}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>{p.name}</b>{p.company && <span className="muted"> · {p.company}</span>}
              <div className="muted small">
                {p.email || "pas de mail"} · {p.mails ? `${p.mails} mail${p.mails > 1 ? "s" : ""}, dernier le ${day(p.lastMail)}` : "jamais contacté"}
                {p.status === "contacted" && (p.nextAt ? ` · prochaine relance le ${day(p.nextAt)}` : p.step > 0 ? " · séquence terminée" : "")}
              </div>
            </div>
            <select value={p.status} onClick={(e) => e.stopPropagation()} onChange={(e) => save(p, { status: e.target.value })}>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button className="ghost" title="Mail libre" onClick={(e) => { e.stopPropagation(); setMail({ p, to: p.email, subject: p.subject ? `Re: ${p.subject.replace(/^re:\s*/i, "")}` : "", body: "" }); }}><Mail size={15} /></button>
          </div>
          {open === p.id && (
            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              <input type="email" placeholder="Mail" defaultValue={p.email} onBlur={(e) => e.target.value !== p.email && save(p, { email: e.target.value.trim() })} />
              <input placeholder="Marque / chaîne" defaultValue={p.company} onBlur={(e) => e.target.value !== p.company && save(p, { company: e.target.value })} />
              <input placeholder="Accroche perso" defaultValue={p.hook} onBlur={(e) => e.target.value !== p.hook && save(p, { hook: e.target.value })} />
              <textarea placeholder="Note (où tu l'as trouvé, idées, réponse…)" defaultValue={p.note} onBlur={(e) => e.target.value !== p.note && save(p, { note: e.target.value })} />
              <div><button className="ghost" onClick={async () => { if (confirm(`Supprimer « ${p.name} » ?`)) { await api("prospects", "POST", { id: p.id, delete: true }); load(); } }}><Trash2 size={15} /> Supprimer</button></div>
            </div>
          )}
        </section>
      ))}

      {mail && (
        <div onClick={() => setMail(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "grid", placeItems: "center", zIndex: 100, padding: 16 }}>
          <div className="settings-card" onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, display: "grid", gap: 8, background: "var(--card)", maxHeight: "90vh", overflow: "auto" }}>
            <div className="row" style={{ justifyContent: "space-between" }}><b>Mail libre à {mail.p.name}</b><button className="ghost" onClick={() => setMail(null)}><X size={16} /></button></div>
            <div className="muted small">Hors séquence : n'avance pas les relances.</div>
            <input type="email" placeholder="À" value={mail.to} onChange={(e) => setMail({ ...mail, to: e.target.value })} />
            <input placeholder="Objet" value={mail.subject} onChange={(e) => setMail({ ...mail, subject: e.target.value })} />
            <textarea rows={10} placeholder="Message" value={mail.body} onChange={(e) => setMail({ ...mail, body: e.target.value })} />
            <div><button className="primary" disabled={busy === "free"} onClick={sendFree}><Send size={15} /> {busy === "free" ? "Envoi…" : "Envoyer"}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
