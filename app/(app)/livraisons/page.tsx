"use client";
import { useEffect, useState } from "react";
import { Check, ChevronLeft, Clapperboard, Copy, ExternalLink, Folder, Link2, MessageSquare, Plus, Trash2, Film, CheckCircle2, Layers } from "lucide-react";
import { api } from "@/lib/api";

type Project = { accountId: string; account: string; workspace: string; id: string; name: string; rootFolderId: string };
type Info = { configured: boolean; connected: boolean; projects: Project[]; error?: string };
type Item = { id: string; name: string; type: string; mediaType: string };
type File = { fileId: string; name: string };
type Comment = { id: string; version: number; author: string; text: string; time: number | null; resolved: boolean };
type Delivery = { id: string; token: string; title: string; client: string; accountId: string; files: string; download: boolean; approvedV: number; approvedAt: string | null; comments: Comment[] };

const tc = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const errorText = (e: unknown) => { const raw = (e as Error).message; try { return JSON.parse(raw).error ?? raw; } catch { return raw; } };

// Explorateur Frame.io : choisir une vidéo dans un projet
function Picker({ projects, onPick, onClose }: { projects: Project[]; onPick: (accountId: string, f: File) => void; onClose: () => void }) {
  const [project, setProject] = useState<Project | null>(null);
  const [path, setPath] = useState<{ id: string; name: string; stack?: boolean }[]>([]);
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState("");
  const folder = path[path.length - 1];

  useEffect(() => {
    if (!project || !folder) return;
    setItems(null); setError("");
    api<Item[]>(`frameio/browse?accountId=${project.accountId}&folderId=${folder.id}${folder.stack ? "&stack=1" : ""}`).then(setItems).catch((e) => setError(errorText(e)));
  }, [project, folder?.id]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal appt-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Choisir une vidéo sur Frame.io</h3>
        {!project && projects.map((p) => (
          <button key={p.id} className="liv-item" onClick={() => { setProject(p); setPath([{ id: p.rootFolderId, name: p.name }]); }}><Folder size={16} /> {p.name} <span className="muted small">{p.workspace}</span></button>
        ))}
        {project && (
          <>
            <button className="rdv-back" onClick={() => path.length > 1 ? setPath(path.slice(0, -1)) : (setProject(null), setPath([]))}><ChevronLeft size={16} /> {path.map((p) => p.name).join(" / ")}</button>
            {error && <p className="neg small">{error}</p>}
            {!items && !error && <p className="muted">Chargement…</p>}
            {items?.length === 0 && <p className="muted">Dossier vide.</p>}
            {items?.map((it) => it.type === "folder" || it.type === "version_stack"
              // Dossier ou pile de versions : on entre dedans
              ? <button key={it.id} className="liv-item" onClick={() => setPath([...path, { id: it.id, name: it.name, stack: it.type === "version_stack" }])}>{it.type === "folder" ? <Folder size={16} /> : <Layers size={16} />} {it.name}{it.type === "version_stack" && <span className="muted small">pile de versions</span>}</button>
              : <button key={it.id} className="liv-item" onClick={() => onPick(project.accountId, { fileId: it.id, name: it.name })}><Film size={16} /> {it.name} <span className="muted small">{it.mediaType || it.type}</span></button>)}
          </>
        )}
        <button onClick={onClose}>Fermer</button>
      </div>
    </div>
  );
}

export default function Livraisons() {
  const [info, setInfo] = useState<Info | null>(null);
  const [list, setList] = useState<Delivery[]>([]);
  const [draft, setDraft] = useState<{ title: string; client: string; accountId: string; files: File[] } | null>(null);
  const [picking, setPicking] = useState<"new" | string | null>(null);
  const [open, setOpen] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () => api<Delivery[]>("livraisons").then(setList);
  useEffect(() => {
    api<Info>("frameio/projects").then(setInfo).catch((e) => setInfo({ configured: true, connected: true, projects: [], error: errorText(e) }));
    load();
  }, []);

  const link = (d: Delivery) => `${window.location.origin}/l/${d.token}`;
  const filesOf = (d: Delivery): File[] => JSON.parse(d.files || "[]");

  async function create() {
    try {
      await api("livraisons", "POST", draft);
      setDraft(null); setMsg({ ok: true, text: "Livraison créée : copie le lien et envoie-le au client." }); load();
    } catch (e) { setMsg({ ok: false, text: errorText(e) }); }
  }

  async function pick(accountId: string, f: File) {
    if (picking === "new") setDraft((d) => d && { ...d, accountId, files: [...d.files, f] });
    else {
      const d = list.find((x) => x.id === picking)!;
      if (d.accountId !== accountId) { setMsg({ ok: false, text: "Choisis une vidéo du même compte Frame.io." }); return; }
      await api(`livraisons/${d.id}`, "PATCH", { files: [...filesOf(d), f] });
      setMsg({ ok: true, text: `V${filesOf(d).length + 1} ajoutée à « ${d.title} ». Le client la voit avec le même lien.` }); load();
    }
    setPicking(null);
  }

  return (
    <div className="content narrow">
      <div className="eyebrow">livraisons</div>
      <h1 className="title">tes <span className="accent">livraisons.</span></h1>
      {msg && <div className={`notice ${msg.ok ? "ok" : "err"}`} onClick={() => setMsg(null)}>{msg.text}</div>}

      {info && !info.configured && <section className="settings-card warn"><p>Il manque <b>FRAMEIO_CLIENT_ID</b> et <b>FRAMEIO_CLIENT_SECRET</b> dans les variables Vercel.</p></section>}
      {info?.configured && !info.connected && (
        <section className="settings-card">
          <div className="sc-head"><Clapperboard size={18} /> <h3>Frame.io</h3></div>
          <p className="muted">Connecte ton compte Frame.io (connexion Adobe) pour livrer tes vidéos depuis l&apos;app.</p>
          <div className="row"><a href="/api/connect/frameio"><button className="primary"><Link2 size={16} /> Connecter Frame.io</button></a></div>
        </section>
      )}
      {info?.error && <section className="settings-card warn"><p>{info.error}</p><a href="/api/connect/frameio"><button><Link2 size={16} /> Reconnecter Frame.io</button></a></section>}

      {info?.connected && !draft && <div className="row" style={{ marginBottom: 16 }}><button className="primary" onClick={() => setDraft({ title: "", client: "", accountId: "", files: [] })}><Plus size={16} /> Nouvelle livraison</button></div>}

      {draft && (
        <section className="settings-card">
          <h3>Nouvelle livraison</h3>
          <label className="field-line">Titre du projet<input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Clip « Été 2026 »" /></label>
          <label className="field-line">Client<input value={draft.client} onChange={(e) => setDraft({ ...draft, client: e.target.value })} placeholder="Nom du client" /></label>
          <div className="field-line">Vidéo(s)</div>
          {draft.files.map((f, i) => <div key={i} className="liv-item static"><Film size={15} /> V{i + 1} · {f.name}</div>)}
          <div className="row">
            <button onClick={() => setPicking("new")}><Plus size={15} /> {draft.files.length ? "Ajouter une version" : "Choisir sur Frame.io"}</button>
            <span style={{ flex: 1 }} />
            <button onClick={() => setDraft(null)}>Annuler</button>
            <button className="primary" disabled={!draft.title.trim() || !draft.files.length} onClick={create}>Créer le lien</button>
          </div>
        </section>
      )}

      {list.map((d) => {
        const files = filesOf(d);
        const todo = d.comments.filter((c) => !c.resolved).length;
        return (
          <section key={d.id} className="settings-card">
            <div className="liv-row" onClick={() => setOpen(open === d.id ? "" : d.id)}>
              <div>
                <b>{d.title}</b>{d.client && <span className="muted"> · {d.client}</span>}
                <div className="muted small">V{files.length} · {d.comments.length} retour{d.comments.length > 1 ? "s" : ""}{todo ? ` (${todo} à traiter)` : ""}</div>
              </div>
              {d.approvedV ? <span className="ok-pill"><CheckCircle2 size={14} /> V{d.approvedV} validée</span> : todo ? <span className="late-pill"><MessageSquare size={12} /> {todo}</span> : null}
            </div>
            <div className="row">
              <button className="primary" onClick={() => { navigator.clipboard.writeText(link(d)); setMsg({ ok: true, text: "Lien copié." }); }}><Copy size={15} /> Copier le lien</button>
              <button onClick={() => window.open(link(d), "_blank")}><ExternalLink size={15} /> Voir</button>
              <button onClick={() => setPicking(d.id)}><Plus size={15} /> Nouvelle version</button>
              <label className="check small"><input type="checkbox" checked={d.download} onChange={async (e) => { await api(`livraisons/${d.id}`, "PATCH", { download: e.target.checked }); load(); }} /> Téléchargement autorisé</label>
            </div>
            {open === d.id && (
              <div className="liv-detail">
                {files.map((f, i) => {
                  const cs = d.comments.filter((c) => c.version === i + 1);
                  return (
                    <div key={i} className="liv-vblock">
                      <b>V{i + 1} · {f.name}</b>
                      {cs.length === 0 && <p className="muted small">Aucun retour.</p>}
                      {cs.map((c) => (
                        <label key={c.id} className={`liv-admin-c ${c.resolved ? "done" : ""}`}>
                          <input type="checkbox" checked={c.resolved} onChange={async (e) => { await api(`livraisons/${d.id}`, "PATCH", { commentId: c.id, resolved: e.target.checked }); load(); }} />
                          <span>{c.time !== null && <b className="liv-tc">{tc(c.time)}</b>} <b>{c.author}</b> : {c.text}</span>
                        </label>
                      ))}
                    </div>
                  );
                })}
                <button className="ghost neg" onClick={async () => { if (confirm(`Supprimer la livraison « ${d.title} » ? Le lien ne marchera plus (les vidéos restent sur Frame.io).`)) { await api(`livraisons/${d.id}`, "DELETE"); load(); } }}><Trash2 size={15} /> Supprimer la livraison</button>
              </div>
            )}
          </section>
        );
      })}
      {info?.connected && !list.length && !draft && <p className="muted">Aucune livraison pour l&apos;instant.</p>}

      {picking && info && <Picker projects={info.projects} onPick={pick} onClose={() => setPicking(null)} />}
    </div>
  );
}
