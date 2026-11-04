"use client";
import { useEffect, useState } from "react";
import { Check, ChevronLeft, Clapperboard, Copy, ExternalLink, Folder, Link2, MessageSquare, Plus, Trash2, Film, CheckCircle2, Layers, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import FramePicker from "@/components/FramePicker";

type Project = { accountId: string; account: string; workspace: string; id: string; name: string; rootFolderId: string };
type Info = { configured: boolean; connected: boolean; projects: Project[]; error?: string };
type Item = { id: string; name: string; type: string; mediaType: string; createdAt: string; version: number };
const when = (iso: string) => iso ? new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
type File = { fileId: string; name: string };
type Comment = { fileName?: string; id: string; version: number; author: string; text: string; time: number | null; resolved: boolean };
type Delivery = { id: string; token: string; title: string; client: string; message: string; networks: string; mode: string; linked: { id: string; title: string; status: string; done: number; total: number }[]; accountId: string; files: string; download: boolean; approvedV: number; approvedAt: string | null; comments: Comment[]; kind: string; approved: string; dlMode: string };
// Choix : versions d'une même vidéo ou plusieurs vidéos différentes
function KindPicker({ value, onChange }: { value: string; onChange: (k: string) => void }) {
  return (
    <div className="field-line">Ces fichiers sont…
      <div className="seg liv-mode">
        <button type="button" className={value !== "videos" ? "on" : ""} onClick={() => onChange("versions")}>Des versions (V1, V2…)</button>
        <button type="button" className={value === "videos" ? "on" : ""} onClick={() => onChange("videos")}>Des vidéos / photos différentes</button>
      </div>
    </div>
  );
}

const tc = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const NETS = [["reel", "Instagram"], ["tiktok", "TikTok"], ["short", "Shorts"], ["youtube", "YouTube"]];
// Choix des aperçus réseaux proposés au client (aucun = automatique selon le format)
function NetPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="field-line">Aperçus réseaux
      <div className="net-pick">
        {NETS.map(([k, label]) => <button key={k} type="button" className={value.includes(k) ? "on" : ""} onClick={() => onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k])}>{label}</button>)}
      </div>
      <span className="muted small">{value.length ? "Le lien s'ouvre directement sur le premier choisi." : "Aucun choisi : automatique (Instagram, TikTok, Shorts en vertical ; YouTube en horizontal)."}</span>
    </div>
  );
}
const errorText = (e: unknown) => { const raw = (e as Error).message; try { return JSON.parse(raw).error ?? raw; } catch { return raw; } };


export default function Livraisons() {
  const [info, setInfo] = useState<Info | null>(null);
  const [list, setList] = useState<Delivery[]>([]);
  const [draft, setDraft] = useState<{ title: string; client: string; message: string; networks: string[]; mode: string; kind: string; accountId: string; files: File[]; folderId?: string; folderName?: string } | null>(null);
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

  async function pick(accountId: string, f: File[]) {
    // Photos ou plusieurs fichiers d'un coup : par défaut, des fichiers différents (pas des versions)
    if (picking === "new") setDraft((d) => d && { ...d, accountId, files: [...d.files, ...f], kind: d.files.length + f.length > 1 && (f.length > 1 || /\.(jpe?g|png|heic|webp|tiff?)$/i.test(f[0]?.name ?? "")) ? "videos" : d.kind });
    else {
      const d = list.find((x) => x.id === picking)!;
      if (d.accountId !== accountId) { setMsg({ ok: false, text: "Choisis une vidéo du même compte Frame.io." }); return; }
      await api(`livraisons/${d.id}`, "PATCH", { files: [...filesOf(d), ...f] });
      setMsg({ ok: true, text: `V${filesOf(d).length + f.length} ajoutée à « ${d.title} ». Le client la voit avec le même lien.` }); load();
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

      {info?.connected && !draft && <div className="row" style={{ marginBottom: 16 }}>
        <button className="primary" onClick={() => setDraft({ title: "", client: "", message: "", networks: [], mode: "page", kind: "versions", accountId: "", files: [] })}><Plus size={16} /> Nouvelle livraison</button></div>}

      {draft && (
        <section className="settings-card">
          <h3>Nouvelle livraison</h3>
          <div className="seg liv-mode">
            <button type="button" className={draft.mode === "page" ? "on" : ""} onClick={() => setDraft({ ...draft, mode: "page" })}>Lien maderino</button>
            <button type="button" className={draft.mode === "frame" ? "on" : ""} onClick={() => setDraft({ ...draft, mode: "frame" })}>Suivi Frame (agence)</button>
          </div>
          <p className="muted small">{draft.mode === "page"
            ? "Le client reçoit ta page à tes couleurs. Ses retours créent une tâche « Modifs » dans le Planning."
            : "Tu continues à partager le lien Frame.io de l'agence. L'app lit les commentaires laissés sur Frame (toutes les 5 min) et les ajoute à une tâche « Modifs » dans le Planning."}</p>
          <label className="field-line">Titre du projet<input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Clip « Été 2026 »" /></label>
          <label className="field-line">Client<input value={draft.client} onChange={(e) => setDraft({ ...draft, client: e.target.value })} placeholder="Nom du client" /></label>
          {draft.mode === "page" && <>
            <label className="field-line">Message au client (facultatif)<textarea rows={2} value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })} placeholder="Salut ! Voici la V1 du clip, dis-moi ce que tu en penses 🙌" /></label>
            <NetPicker value={draft.networks} onChange={(networks) => setDraft({ ...draft, networks })} />
          </>}
          <div className="field-line">Vidéo(s)</div>
          {draft.folderId && <div className="liv-item static"><Folder size={15} /> Dossier « {draft.folderName} » (sous-dossiers compris, à jour en direct)</div>}
          {draft.files.map((f, i) => <div key={i} className="liv-item static"><Film size={15} /> {draft.kind === "videos" ? f.name : `V${i + 1} · ${f.name}`}</div>)}
          {draft.files.length > 1 && <KindPicker value={draft.kind} onChange={(kind) => setDraft({ ...draft, kind })} />}
          <div className="row">
            {!draft.folderId && <button onClick={() => setPicking("new")}><Plus size={15} /> {draft.files.length ? "Ajouter une version" : "Choisir sur Frame.io"}</button>}
            <span style={{ flex: 1 }} />
            <button onClick={() => setDraft(null)}>Annuler</button>
            <button className="primary" disabled={!draft.title.trim() || (!draft.files.length && !draft.folderId)} onClick={create}>{draft.mode === "frame" ? "Suivre" : "Créer le lien"}</button>
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
                <div className="muted small">{d.kind === "folder" ? "Dossier Frame (en direct)" : d.kind === "videos" ? `${files.length} vidéos` : `V${files.length}`} · {d.comments.length} retour{d.comments.length > 1 ? "s" : ""}{todo ? ` (${todo} à traiter)` : ""}</div>
              </div>
              {d.kind === "videos" && JSON.parse(d.approved || "[]").length ? <span className="ok-pill"><CheckCircle2 size={14} /> {JSON.parse(d.approved).length}/{files.length} validées</span> : d.approvedV ? <span className="ok-pill"><CheckCircle2 size={14} /> V{d.approvedV} validée</span> : todo ? <span className="late-pill"><MessageSquare size={12} /> {todo}</span> : null}
            </div>
            {d.linked.map((t) => (
              <a key={t.id} className="liv-task" href="/planning">
                <span>📋 {t.title}</span>
                <span className="muted small">{t.status === "done" ? "terminée ✓" : t.total ? `${t.done}/${t.total} retours corrigés` : "à faire"}</span>
              </a>
            ))}
            <div className="row">
              {d.mode === "frame"
                ? <>
                    <span className="ok-pill">Suivi Frame</span>
                    <button onClick={async () => { try { const r = await api<{ added: number }>(`livraisons/${d.id}`, "PATCH", { action: "sync" }); setMsg({ ok: true, text: r.added ? `${r.added} nouveau(x) retour(s) Frame ajouté(s) au Planning.` : "Aucun nouveau commentaire sur Frame." }); load(); } catch (e) { setMsg({ ok: false, text: errorText(e) }); } }}><RefreshCw size={15} /> Vérifier Frame</button>
                  </>
                : <>
                    <button className="primary" onClick={() => { navigator.clipboard.writeText(link(d)); setMsg({ ok: true, text: "Lien copié." }); }}><Copy size={15} /> Copier le lien</button>
                    <button onClick={() => window.open(link(d), "_blank")}><ExternalLink size={15} /> Voir</button>
                  </>}
              {d.kind !== "folder" && <button onClick={() => setPicking(d.id)}><Plus size={15} /> Nouvelle version</button>}
              {d.mode !== "frame" && (
                <label className="field-line liv-dl">Téléchargement
                  <select value={!d.download ? "never" : d.dlMode} onChange={async (e) => { await api(`livraisons/${d.id}`, "PATCH", { dlMode: e.target.value }); load(); }}>
                    <option value="always">Toujours</option>
                    <option value="approved">Après validation</option>
                    <option value="never">Jamais</option>
                  </select>
                </label>
              )}
            </div>
            {open === d.id && (
              <div className="liv-detail">
                <label className="field-line">Titre<input defaultValue={d.title} onBlur={async (e) => { if (e.target.value !== d.title) { await api(`livraisons/${d.id}`, "PATCH", { title: e.target.value }); load(); } }} /></label>
                <label className="field-line">Client<input defaultValue={d.client} onBlur={async (e) => { if (e.target.value !== d.client) { await api(`livraisons/${d.id}`, "PATCH", { client: e.target.value }); load(); } }} /></label>
                {files.length > 1 && <KindPicker value={d.kind} onChange={async (kind) => { await api(`livraisons/${d.id}`, "PATCH", { kind }); load(); }} />}
                {d.mode !== "frame" && <NetPicker value={JSON.parse(d.networks || "[]")} onChange={async (networks) => { await api(`livraisons/${d.id}`, "PATCH", { networks }); load(); }} />}
                <label className="field-line">Message au client<textarea rows={2} defaultValue={d.message} onBlur={async (e) => { if (e.target.value !== d.message) { await api(`livraisons/${d.id}`, "PATCH", { message: e.target.value }); load(); } }} /></label>
                {d.kind === "folder" && (
                  <div className="liv-vblock">
                    <b>Retours sur le dossier</b>
                    {d.comments.length === 0 && <p className="muted small">Aucun retour.</p>}
                    {d.comments.map((c) => (
                      <label key={c.id} className={`liv-admin-c ${c.resolved ? "done" : ""}`}>
                        <input type="checkbox" checked={c.resolved} onChange={async (e) => { await api(`livraisons/${d.id}`, "PATCH", { commentId: c.id, resolved: e.target.checked }); load(); }} />
                        <span>{c.fileName && <b>{c.fileName} · </b>}{c.time !== null && <b className="liv-tc">{tc(c.time)}</b>} <b>{c.author}</b> : {c.text}</span>
                      </label>
                    ))}
                  </div>
                )}
                {files.map((f, i) => {
                  const cs = d.comments.filter((c) => c.version === i + 1);
                  return (
                    <div key={i} className="liv-vblock">
                      <b>{d.kind === "videos" ? f.name : `V${i + 1} · ${f.name}`}</b>
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

      {picking && info && <FramePicker projects={info.projects} onPick={pick} onClose={() => setPicking(null)}
        onPickFolder={picking === "new" ? (accountId, f) => { setDraft((d) => d && { ...d, accountId, files: [], folderId: f.id, folderName: f.name, kind: "folder", mode: "page", title: d.title || f.name }); setPicking(null); } : undefined} />}
    </div>
  );
}
