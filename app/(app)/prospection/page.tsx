"use client";
import { useEffect, useState } from "react";
import { Mail, Plus, Send, Settings2, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";

type P = { id: string; name: string; email: string; company: string; status: string; note: string; lastMail: string | null; mails: number };
type T = { name: string; subject: string; body: string };

const STATUS: Record<string, string> = { todo: "À contacter", contacted: "Contacté", replied: "A répondu", won: "Gagné", lost: "Perdu" };
const fill = (t: string, p: P) => t.replace(/\{pr[ée]nom\}|\{nom\}/gi, p.name.split(" ")[0]).replace(/\{marque\}|\{entreprise\}/gi, p.company || p.name);

export default function Prospection() {
  const [list, setList] = useState<P[]>([]);
  const [from, setFrom] = useState("");
  const [templates, setTemplates] = useState<T[]>([]);
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState("");
  const [showCfg, setShowCfg] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", company: "" });
  const [mail, setMail] = useState<{ p: P; to: string; subject: string; body: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");

  const load = () => api<{ list: P[]; from: string; templates: T[] }>("prospects").then((r) => { setList(r.list); setFrom(r.from); setTemplates(r.templates); }).catch(() => {});
  useEffect(() => { load(); }, []);

  const save = async (p: P, patch: Partial<P>) => { setList((l) => l.map((x) => (x.id === p.id ? { ...x, ...patch } : x))); await api("prospects", "POST", { id: p.id, ...patch }); };
  const saveCfg = (f = from, t = templates) => api("prospects", "POST", { config: { from: f, templates: t } });

  async function send() {
    if (!mail) return;
    setSending(true); setMsg("");
    try {
      const u = await api<P>("prospects/send", "POST", { id: mail.p.id, to: mail.to, subject: mail.subject, body: mail.body });
      setList((l) => l.map((x) => (x.id === u.id ? u : x)));
      setMail(null); setMsg(`Mail envoyé à ${u.name} ✓`);
    } catch (e: any) {
      let err = String(e?.message ?? e); try { err = JSON.parse(err).error ?? err; } catch {}
      setMsg(`Erreur : ${err}`);
    }
    setSending(false);
  }

  const shown = list.filter((p) => filter === "all" || p.status === filter);
  const count = (s: string) => list.filter((p) => p.status === s).length;

  return (
    <div className="content narrow">
      <div className="eyebrow">prospection</div>
      <h1 className="title">trouve tes <span className="accent">prochains clients.</span></h1>
      <p className="muted">Ajoute tes prospects et écris-leur directement d'ici : le mail part de ton Gmail (et apparaît dans tes « Envoyés »). Dans les modèles, <b>{"{prénom}"}</b> et <b>{"{marque}"}</b> sont remplacés automatiquement.</p>

      <div className="row" style={{ margin: "10px 0" }}>
        <button className="ghost" onClick={() => setShowCfg(!showCfg)}><Settings2 size={15} /> Adresse d'envoi & modèles</button>
        {msg && <span className="muted">{msg}</span>}
      </div>

      {showCfg && (
        <section className="settings-card" style={{ display: "grid", gap: 10 }}>
          <label className="muted small">Envoyer depuis (laisser vide = adresse Gmail principale). Utilise un alias ajouté dans Gmail → Paramètres → Comptes → « Envoyer des e-mails en tant que ».</label>
          <input placeholder="Prénom Nom <contact@mondomaine.fr>" value={from} onChange={(e) => setFrom(e.target.value)} onBlur={() => saveCfg()} />
          <b>Modèles</b>
          {templates.map((t, i) => (
            <div key={i} style={{ display: "grid", gap: 6, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
              <div className="row">
                <input placeholder="Nom du modèle (ex. Premier contact)" value={t.name} onChange={(e) => setTemplates(templates.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} onBlur={() => saveCfg()} />
                <button className="ghost" title="Supprimer" onClick={() => { const n = templates.filter((_, j) => j !== i); setTemplates(n); saveCfg(from, n); }}><Trash2 size={15} /></button>
              </div>
              <input placeholder="Objet" value={t.subject} onChange={(e) => setTemplates(templates.map((x, j) => (j === i ? { ...x, subject: e.target.value } : x)))} onBlur={() => saveCfg()} />
              <textarea rows={6} placeholder={"Salut {prénom},\n\n…"} value={t.body} onChange={(e) => setTemplates(templates.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))} onBlur={() => saveCfg()} />
            </div>
          ))}
          <div><button onClick={() => { const n = [...templates, { name: "", subject: "", body: "" }]; setTemplates(n); }}><Plus size={15} /> Nouveau modèle</button></div>
        </section>
      )}

      <form className="row" style={{ margin: "12px 0 16px" }} onSubmit={async (e) => { e.preventDefault(); if (!form.name.trim()) return; await api("prospects", "POST", form); setForm({ name: "", email: "", company: "" }); load(); }}>
        <input placeholder="Nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input type="email" placeholder="Mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input placeholder="Marque / chaîne" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
        <button className="primary"><Plus size={16} /> Ajouter</button>
      </form>

      <div className="row" style={{ marginBottom: 10 }}>
        <button className={filter === "all" ? "primary" : ""} onClick={() => setFilter("all")}>Tous ({list.length})</button>
        {Object.entries(STATUS).map(([k, v]) => <button key={k} className={filter === k ? "primary" : ""} onClick={() => setFilter(k)}>{v} ({count(k)})</button>)}
      </div>

      {shown.length === 0 && <p className="muted">Aucun prospect ici.</p>}
      {shown.map((p) => (
        <section key={p.id} className="settings-card">
          <div className="liv-row" onClick={() => setOpen(open === p.id ? "" : p.id)}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>{p.name}</b>{p.company && <span className="muted"> · {p.company}</span>}
              <div className="muted small">{p.email || "pas de mail"} · {p.mails ? `${p.mails} mail${p.mails > 1 ? "s" : ""}, dernier le ${new Date(p.lastMail!).toLocaleDateString("fr-FR")}` : "jamais contacté"}</div>
            </div>
            <select value={p.status} onClick={(e) => e.stopPropagation()} onChange={(e) => save(p, { status: e.target.value })}>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button className="primary" onClick={(e) => { e.stopPropagation(); setMail({ p, to: p.email, subject: "", body: "" }); }}><Mail size={15} /> Écrire</button>
          </div>
          {open === p.id && (
            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              <input type="email" placeholder="Mail" defaultValue={p.email} onBlur={(e) => e.target.value !== p.email && save(p, { email: e.target.value.trim() })} />
              <input placeholder="Marque / chaîne" defaultValue={p.company} onBlur={(e) => e.target.value !== p.company && save(p, { company: e.target.value })} />
              <textarea placeholder="Note (où tu l'as trouvé, idées, réponse…)" defaultValue={p.note} onBlur={(e) => e.target.value !== p.note && save(p, { note: e.target.value })} />
              <div><button className="ghost" onClick={async () => { if (confirm(`Supprimer « ${p.name} » ?`)) { await api("prospects", "POST", { id: p.id, delete: true }); load(); } }}><Trash2 size={15} /> Supprimer</button></div>
            </div>
          )}
        </section>
      ))}

      {mail && (
        <div onClick={() => setMail(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "grid", placeItems: "center", zIndex: 100, padding: 16 }}>
          <div className="settings-card" onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, display: "grid", gap: 8, background: "var(--card)", maxHeight: "90vh", overflow: "auto" }}>
            <div className="row" style={{ justifyContent: "space-between" }}><b>Mail à {mail.p.name}</b><button className="ghost" onClick={() => setMail(null)}><X size={16} /></button></div>
            <div className="muted small">De : {from || "ton adresse Gmail principale"}</div>
            {templates.length > 0 && (
              <select defaultValue="" onChange={(e) => { const t = templates[Number(e.target.value)]; if (t) setMail({ ...mail, subject: fill(t.subject, mail.p), body: fill(t.body, mail.p) }); }}>
                <option value="" disabled>Choisir un modèle…</option>
                {templates.map((t, i) => <option key={i} value={i}>{t.name || `Modèle ${i + 1}`}</option>)}
              </select>
            )}
            <input type="email" placeholder="À" value={mail.to} onChange={(e) => setMail({ ...mail, to: e.target.value })} />
            <input placeholder="Objet" value={mail.subject} onChange={(e) => setMail({ ...mail, subject: e.target.value })} />
            <textarea rows={10} placeholder="Message" value={mail.body} onChange={(e) => setMail({ ...mail, body: e.target.value })} />
            {msg.startsWith("Erreur") && <div className="muted" style={{ color: "var(--red)" }}>{msg}</div>}
            <div><button className="primary" disabled={sending} onClick={send}><Send size={15} /> {sending ? "Envoi…" : "Envoyer"}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
