"use client";
import { useEffect, useState } from "react";
import { Check, ChevronLeft, Film, Folder, FolderPlus, Layers } from "lucide-react";
import { api } from "@/lib/api";

export type FrameProject = { accountId: string; account: string; workspace: string; id: string; name: string; rootFolderId: string };
export type FrameFile = { fileId: string; name: string };
type Item = { id: string; name: string; type: string; mediaType: string; createdAt: string; version: number };

const when = (iso: string) => iso ? new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
const errorText = (e: unknown) => { const raw = (e as Error).message; try { return JSON.parse(raw).error ?? raw; } catch { return raw; } };

// Explorateur Frame.io : choisir une ou plusieurs vidéos (dans l'ordre des clics : V1, V2…)
export default function FramePicker({ title = "Choisir sur Frame.io", projects: given, onPick, onPickFolder, folderLabel = "Livrer ce dossier entier", allowCreate, onClose, children }: {
  title?: string; projects?: FrameProject[]; onPick?: (accountId: string, files: FrameFile[]) => void; folderLabel?: string; allowCreate?: boolean;
  onPickFolder?: (accountId: string, folder: { id: string; name: string }) => void; onClose: () => void; children?: React.ReactNode;
}) {
  const [projects, setProjects] = useState<FrameProject[] | null>(given ?? null);
  const [project, setProject] = useState<FrameProject | null>(null);
  const [path, setPath] = useState<{ id: string; name: string; stack?: boolean }[]>([]);
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState("");
  const [sel, setSel] = useState<FrameFile[]>([]);
  const [newName, setNewName] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const folder = path[path.length - 1];

  useEffect(() => {
    if (given) return;
    api<{ connected: boolean; projects: FrameProject[]; error?: string }>("frameio/projects")
      .then((r) => { if (!r.connected) setError("Frame.io n'est pas connecté (page Livraisons)."); else if (r.error) setError(r.error); setProjects(r.projects); })
      .catch((e) => setError(errorText(e)));
  }, []);
  useEffect(() => {
    if (!project || !folder) return;
    setItems(null); setError("");
    api<Item[]>(`frameio/browse?accountId=${project.accountId}&folderId=${folder.id}${folder.stack ? "&stack=1" : ""}`).then(setItems).catch((e) => setError(errorText(e)));
  }, [project, folder?.id, reload]);
  // Crée un dossier dans le dossier ouvert, puis entre dedans
  async function create() {
    if (!project || !folder || !newName?.trim()) return;
    try {
      const f = await api<{ id: string; name: string }>("frameio/folders", "POST", { accountId: project.accountId, parentId: folder.id, name: newName.trim() });
      setNewName(null); setPath([...path, { id: f.id, name: f.name }]); setReload((n) => n + 1);
    } catch (e) { setError(errorText(e)); }
  }

  const toggle = (f: FrameFile) => setSel((s) => s.some((x) => x.fileId === f.fileId) ? s.filter((x) => x.fileId !== f.fileId) : [...s, f]);
  const order = (id: string) => sel.findIndex((x) => x.fileId === id) + 1;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal appt-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {children}
        {error && <p className="neg small">{error}</p>}
        {!project && !projects && !error && <p className="muted">Chargement…</p>}
        {!project && projects?.map((p) => (
          <button key={p.id} className="liv-item" onClick={() => { setProject(p); setPath([{ id: p.rootFolderId, name: p.name }]); }}><Folder size={16} /> {p.name} <span className="muted small">{p.workspace}</span></button>
        ))}
        {project && (
          <>
            <button className="rdv-back" onClick={() => path.length > 1 ? setPath(path.slice(0, -1)) : (setProject(null), setPath([]))}><ChevronLeft size={16} /> {path.map((p) => p.name).join(" / ")}</button>
            {allowCreate && !folder?.stack && (newName === null
              ? <button className="liv-item fp-new" onClick={() => setNewName("")}><FolderPlus size={16} /> Nouveau dossier ici</button>
              : <div className="row fp-new-row">
                  <input autoFocus placeholder="Nom du dossier" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
                  <button className="primary" disabled={!newName.trim()} onClick={create}>Créer</button>
                  <button onClick={() => setNewName(null)}>Annuler</button>
                </div>)}
            {!items && !error && <p className="muted">Chargement…</p>}
            {items && items.some((x) => x.type !== "folder" && x.type !== "version_stack") && (
              // Coche d'un coup tous les fichiers du dossier (dans l'ordre affiché), ou les décoche
              <button className="liv-item" onClick={() => {
                const all = items.filter((x) => x.type !== "folder" && x.type !== "version_stack").map((x) => ({ fileId: x.id, name: x.name }));
                const every = all.every((f) => sel.some((x) => x.fileId === f.fileId));
                setSel(every ? sel.filter((x) => !all.some((f) => f.fileId === x.fileId)) : [...sel, ...all.filter((f) => !sel.some((x) => x.fileId === f.fileId))]);
              }}><Check size={16} /> Tout le dossier ({items.filter((x) => x.type !== "folder" && x.type !== "version_stack").length} fichiers)</button>
            )}
            {items?.length === 0 && <p className="muted">Dossier vide.</p>}
            {items?.map((it) => it.type === "folder" || it.type === "version_stack"
              ? <button key={it.id} className="liv-item" onClick={() => setPath([...path, { id: it.id, name: it.name, stack: it.type === "version_stack" }])}>{it.type === "folder" ? <Folder size={16} /> : <Layers size={16} />} {it.name}{it.type === "version_stack" && <span className="muted small">pile de versions</span>}</button>
              : <button key={it.id} className={`liv-item ${order(it.id) ? "picked" : ""}`} onClick={() => toggle({ fileId: it.id, name: it.name })}>
                  {order(it.id) ? <b className="liv-vtag"><Check size={11} /> {order(it.id)}</b> : it.version > 0 ? <b className="liv-vtag">V{it.version}</b> : <Film size={16} />} {it.name}
                  <span className="muted small">{it.version > 0 ? `envoyée le ${when(it.createdAt)}` : it.mediaType || it.type}</span>
                </button>)}
          </>
        )}
        <div className="row">
          <button onClick={onClose}>Fermer</button>
          <span style={{ flex: 1 }} />
          {onPickFolder && project && folder && !folder.stack && !sel.length && (
            // Livrer le dossier entier, sous-dossiers compris (lu en direct : ce qui y est ajouté ensuite apparaît aussi)
            <button onClick={() => onPickFolder(project.accountId, { id: folder.id, name: folder.name })}><Folder size={15} /> {folderLabel}</button>
          )}
          {onPick && <button className="primary" disabled={!sel.length || !project} onClick={() => onPick(project!.accountId, sel)}>Ajouter {sel.length > 1 ? `(${sel.length})` : ""}</button>}
        </div>
      </div>
    </div>
  );
}
