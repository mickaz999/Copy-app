"use client";
import { useEffect, useState } from "react";
import { ChevronDown, CloudUpload, Copy, ExternalLink, Folder, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import FramePicker, { FrameProject } from "@/components/FramePicker";
import { PUBLIC_URL, dropUrl } from "@/lib/site";
import ClientPick from "@/components/ClientPick";
import { copyText } from "@/lib/copy";

type Drop = { space?: string; notes?: { id: string; author: string; text: string; audio: string; createdAt: string }[]; id: string; token: string; title: string; client: string; message: string; folderName: string; active: boolean; createdAt: string; expiresAt: string | null; files: { name: string; size: number; author: string; createdAt: string }[] };
// Valable 1 semaine après la création, sauf prolongation
const expiry = (d: Drop) => new Date(d.expiresAt ?? Date.parse(d.createdAt) + 7 * 864e5);
const size = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} Go` : `${Math.max(1, Math.round(n / 1e6))} Mo`);
const errorText = (e: unknown) => { const raw = (e as Error).message; try { return JSON.parse(raw).error ?? raw; } catch { return raw; } };

// Liens de dépôt de rushs vers un dossier Frame.io (créé au besoin)
export default function DropLinks({ projects }: { projects: FrameProject[] }) {
  const [list, setList] = useState<Drop[]>([]);
  const [draft, setDraft] = useState<{ title: string; client: string; message: string; accountId: string; folderId: string; folderName: string; newFolder: string; create: boolean } | null>(null);
  const [picking, setPicking] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showOld, setShowOld] = useState(false);
  const [open, setOpen] = useState("");
  const load = () => api<Drop[]>("drops").then(setList).catch(() => {});
  useEffect(() => { load(); }, []);
  const direct = (d: Drop) => dropUrl(d);
  const link = (d: Drop) => d.space || direct(d);
  const copy = async (url: string, text: string) => setMsg(await copyText(url) ? { ok: true, text } : { ok: false, text: `Copie impossible, voici le lien : ${url}` });
  // Modifié tout de suite à l'écran, enregistré en arrière-plan
  async function patch(d: Drop, body: Record<string, unknown>, local: Partial<Drop> = {}, ok?: string) {
    if (Object.keys(local).length) setList((l) => l.map((x) => (x.id === d.id ? { ...x, ...local } : x)));
    try { await api(`drops/${d.id}`, "PATCH", body); if (ok) setMsg({ ok: true, text: ok }); }
    catch (e) { setMsg({ ok: false, text: errorText(e) }); }
    load();
  }

  const [notify, setNotify] = useState(true);
  async function tellClient(id: string) {
    try { const r = await api<{ sent: number }>("clients", "POST", { action: "notify", kind: "drop", id }); setMsg({ ok: true, text: r.sent ? `Client prévenu par mail (${r.sent} adresse${r.sent > 1 ? "s" : ""}).` : "Pas de mail connu pour ce client : ajoute-le dans sa fiche pour le prévenir." }); }
    catch (e) { setMsg({ ok: false, text: errorText(e) }); }
  }
  async function create() {
    if (!draft) return;
    setBusy(true);
    try {
      const d = await api<Drop>("drops", "POST", { ...draft, newFolder: draft.create ? draft.newFolder || draft.title : "" });
      const copied = await copyText(link(d));
      setMsg({ ok: true, text: copied ? "Lien de dépôt créé et copié : envoie-le au client." : `Lien de dépôt créé : ${link(d)}` });
      if (notify && draft.client.trim()) await api<{ sent: number }>("clients", "POST", { action: "notify", kind: "drop", id: d.id })
        .then((r) => r.sent && setMsg({ ok: true, text: `Lien de dépôt créé${copied ? " et copié" : ""}, client prévenu par mail (${r.sent} adresse${r.sent > 1 ? "s" : ""}).` }))
        .catch(() => {});
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
          <ClientPick value={draft.client} onChange={(v) => setDraft({ ...draft, client: v })} />
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
            <label className="check"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Prévenir le client par mail</label>
            <button className="primary" disabled={busy || !draft.title.trim() || !draft.folderId} onClick={create}>{busy ? "Création…" : "Créer le lien"}</button>
          </div>
        </div>
      )}

      {(() => { const n = list.filter((d) => expiry(d).getTime() < Date.now()).length; return n > 0 && <div className="row"><button className="ghost small" onClick={() => setShowOld(!showOld)}>{showOld ? "Masquer les liens expirés" : `Voir les liens expirés (${n})`}</button></div>; })()}
      {list.filter((d) => showOld || expiry(d).getTime() >= Date.now()).map((d) => {
        const total = d.files.reduce((n, f) => n + f.size, 0);
        return (
          <div key={d.id} className="liv-detail">
            <div className="liv-row" onClick={() => setOpen(open === d.id ? "" : d.id)}>
              <div className="liv-row-main">
                <b>{d.title}</b>{d.client && <span className="muted"> · {d.client}</span>}
                <div className="muted small drop-meta liv-sub"><Folder size={12} /> {d.folderName} · {d.files.length} fichier{d.files.length > 1 ? "s" : ""} reçu{d.files.length > 1 ? "s" : ""}{total ? ` (${size(total)})` : ""}</div>
              </div>
              {!d.active ? <span className="late-pill">fermé</span> : expiry(d).getTime() < Date.now() && <span className="late-pill">expiré</span>}
              <button className="ghost liv-quick" title="Copier le lien" onClick={(e) => { e.stopPropagation(); copy(link(d), "Lien copié."); }}><Copy size={15} /></button>
              <ChevronDown size={18} className={`liv-chev ${open === d.id ? "on" : ""}`} />
            </div>
            {open === d.id && <>
            <div className="row liv-actions">
              <button className="primary" onClick={() => copy(link(d), d.space ? `Lien de l'espace ${d.client} copié : le dépôt y est, avec tout ce qu'il a en cours.` : "Lien copié.")}><Copy size={15} /> {d.space ? "Copier son espace" : "Copier le lien"}</button>
              {d.space && <button onClick={() => copy(direct(d), "Lien direct du dépôt copié.")}>Lien direct</button>}
              {d.client && <button onClick={() => tellClient(d.id)}>Prévenir le client</button>}
              <button onClick={() => window.open(link(d), "_blank")}><ExternalLink size={15} /> Voir</button>
              <span className={`small ${expiry(d).getTime() < Date.now() ? "neg" : "muted"}`}>{expiry(d).getTime() < Date.now() ? "Expiré le" : "Valable jusqu'au"} {expiry(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
              <button onClick={() => patch(d, { action: "extend" }, {}, `Lien « ${d.title} » prolongé d'une semaine.`)}>Prolonger d&apos;une semaine</button>
              <label className="check small"><input type="checkbox" checked={d.active} onChange={(e) => patch(d, { active: e.target.checked }, { active: e.target.checked })} /> Ouvert</label>
              <span style={{ flex: 1 }} />
              <button className="ghost neg" onClick={async () => { if (!confirm(`Supprimer le lien « ${d.title} » ? Les fichiers restent sur Frame.io.`)) return; setList((l) => l.filter((x) => x.id !== d.id)); try { await api(`drops/${d.id}`, "DELETE"); } catch (e) { setMsg({ ok: false, text: errorText(e) }); } load(); }}><Trash2 size={15} /></button>
            </div>
            {(d.notes ?? []).map((n) => (
              <div key={n.id} className="drop-brief-admin">
                <b>Brief{n.author ? ` de ${n.author}` : ""}</b>
                {n.text && <p>{n.text}</p>}
                {n.audio && <audio controls preload="none" src={`/api/drop/${d.token}/audio?id=${n.id}`} />}
              </div>
            ))}
            {d.files.slice(0, 5).map((f, i) => <div key={i} className="muted small">• {f.name} ({size(f.size)}){f.author ? ` · ${f.author}` : ""}</div>)}
            </>}
          </div>
        );
      })}

      {picking && (
        <FramePicker title="Où arrivent les rushs ?" projects={projects} folderLabel="Choisir ce dossier" allowCreate onClose={() => setPicking(false)}
          onPickFolder={(accountId, f) => { setDraft((d) => d && { ...d, accountId, folderId: f.id, folderName: f.name, create: false }); setPicking(false); }} />
      )}
    </section>
  );
}
