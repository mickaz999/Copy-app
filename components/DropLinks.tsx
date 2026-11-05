"use client";
import { useEffect, useState } from "react";
import { CloudUpload, Copy, ExternalLink, Folder, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import FramePicker, { FrameProject } from "@/components/FramePicker";

type Drop = { id: string; token: string; title: string; client: string; message: string; folderName: string; active: boolean; files: { name: string; size: number; author: string; createdAt: string }[] };
const size = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} Go` : `${Math.max(1, Math.round(n / 1e6))} Mo`);
const errorText = (e: unknown) => { const raw = (e as Error).message; try { return JSON.parse(raw).error ?? raw; } catch { return raw; } };

// Liens de dépôt de rushs vers un dossier Frame.io (créé au besoin)
export default function DropLinks({ projects }: { projects: FrameProject[] }) {
  const [list, setList] = useState<Drop[]>([]);
  const [draft, setDraft] = useState<{ title: string; client: string; message: string; accountId: string; folderId: string; folderName: string; newFolder: string; create: boolean } | null>(null);
  const [picking, setPicking] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => api<Drop[]>("drops").then(setList).catch(() => {});
  useEffect(() => { load(); }, []);
  const link = (d: Drop) => `${window.location.origin}/d/${d.token}`;

  async function create() {
    if (!draft) return;
    setBusy(true);
    try {
      const d = await api<Drop>("drops", "POST", { ...draft, newFolder: draft.create ? draft.newFolder || draft.title : "" });
      navigator.clipboard?.writeText(link(d)).catch(() => {});
      setMsg({ ok: true, text: "Lien de dépôt créé et copié : envoie-le au client." });
      setDraft(null); load();
    } catch (e) { setMsg({ ok: false, text: errorText(e) }); }
    finally { setBusy(false); }
  }

  return (
    <section className="settings-card">
      <div className="sc-head"><CloudUpload size={18} /> <h3>Liens de dépôt de rushs</h3></div>
      <p className="muted small">Le client dépose ses fichiers sur une page à tes couleurs ; ils arrivent directement dans un dossier Frame.io. Tu reçois une notification et une tâche « Dérusher » est créée.</p>
      {msg && <div className={`notice ${msg.ok ? "ok" : "err"}`} onClick={() => setMsg(null)}>{msg.text}</div>}

      {!draft && <div className="row"><button className="primary" onClick={() => setDraft({ title: "", client: "", message: "", accountId: "", folderId: "", folderName: "", newFolder: "", create: true })}><Plus size={15} /> Nouveau lien de dépôt</button></div>}
      {draft && (
        <div className="liv-detail">
          <label className="field-line">Projet<input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Rushs mariage Alizé & Thomas" /></label>
          <label className="field-line">Client<input value={draft.client} onChange={(e) => setDraft({ ...draft, client: e.target.value })} /></label>
          <label className="field-line">Message (facultatif)<textarea rows={2} value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })} placeholder="Dépose ici tous les rushs de la journée, merci !" /></label>
          <div className="field-line">Destination sur Frame.io
            <div className="row">
              <button onClick={() => setPicking(true)}><Folder size={15} /> {draft.folderId ? draft.folderName : "Choisir un dossier"}</button>
            </div>
          </div>
          {draft.folderId && (
            <>
              <label className="check-line"><input type="checkbox" checked={draft.create} onChange={(e) => setDraft({ ...draft, create: e.target.checked })} /> Créer un nouveau dossier dans « {draft.folderName} »</label>
              {draft.create && <label className="field-line">Nom du nouveau dossier<input value={draft.newFolder} onChange={(e) => setDraft({ ...draft, newFolder: e.target.value })} placeholder={draft.title || "Rushs"} /></label>}
            </>
          )}
          <div className="row">
            <button onClick={() => setDraft(null)}>Annuler</button>
            <span style={{ flex: 1 }} />
            <button className="primary" disabled={busy || !draft.title.trim() || !draft.folderId} onClick={create}>{busy ? "Création…" : "Créer le lien"}</button>
          </div>
        </div>
      )}

      {list.map((d) => {
        const total = d.files.reduce((n, f) => n + f.size, 0);
        return (
          <div key={d.id} className="liv-detail">
            <div className="liv-row">
              <div>
                <b>{d.title}</b>{d.client && <span className="muted"> · {d.client}</span>}
                <div className="muted small">📁 {d.folderName} · {d.files.length} fichier{d.files.length > 1 ? "s" : ""} reçu{d.files.length > 1 ? "s" : ""}{total ? ` (${size(total)})` : ""}</div>
              </div>
              {!d.active && <span className="late-pill">fermé</span>}
            </div>
            <div className="row">
              <button className="primary" onClick={() => { navigator.clipboard.writeText(link(d)); setMsg({ ok: true, text: "Lien copié." }); }}><Copy size={15} /> Copier le lien</button>
              <button onClick={() => window.open(link(d), "_blank")}><ExternalLink size={15} /> Voir</button>
              <label className="check small"><input type="checkbox" checked={d.active} onChange={async (e) => { await api(`drops/${d.id}`, "PATCH", { active: e.target.checked }); load(); }} /> Ouvert</label>
              <span style={{ flex: 1 }} />
              <button className="ghost neg" onClick={async () => { if (confirm(`Supprimer le lien « ${d.title} » ? Les fichiers restent sur Frame.io.`)) { await api(`drops/${d.id}`, "DELETE"); load(); } }}><Trash2 size={15} /></button>
            </div>
            {d.files.slice(0, 5).map((f, i) => <div key={i} className="muted small">• {f.name} ({size(f.size)}){f.author ? ` · ${f.author}` : ""}</div>)}
          </div>
        );
      })}

      {picking && (
        <FramePicker title="Où arrivent les rushs ?" projects={projects} folderLabel="Choisir ce dossier" onClose={() => setPicking(false)}
          onPickFolder={(accountId, f) => { setDraft((d) => d && { ...d, accountId, folderId: f.id, folderName: f.name }); setPicking(false); }} />
      )}
    </section>
  );
}
