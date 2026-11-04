"use client";
import { useEffect, useState } from "react";
import { Check, ChevronLeft, Film, Folder, Layers } from "lucide-react";
import { api } from "@/lib/api";

export type FrameProject = { accountId: string; account: string; workspace: string; id: string; name: string; rootFolderId: string };
export type FrameFile = { fileId: string; name: string };
type Item = { id: string; name: string; type: string; mediaType: string; createdAt: string; version: number };

const when = (iso: string) => iso ? new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
const errorText = (e: unknown) => { const raw = (e as Error).message; try { return JSON.parse(raw).error ?? raw; } catch { return raw; } };

// Explorateur Frame.io : choisir une ou plusieurs vidéos (dans l'ordre des clics : V1, V2…)
export default function FramePicker({ title = "Choisir sur Frame.io", projects: given, onPick, onClose, children }: {
  title?: string; projects?: FrameProject[]; onPick: (accountId: string, files: FrameFile[]) => void; onClose: () => void; children?: React.ReactNode;
}) {
  const [projects, setProjects] = useState<FrameProject[] | null>(given ?? null);
  const [project, setProject] = useState<FrameProject | null>(null);
  const [path, setPath] = useState<{ id: string; name: string; stack?: boolean }[]>([]);
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState("");
  const [sel, setSel] = useState<FrameFile[]>([]);
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
  }, [project, folder?.id]);

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
          <button className="primary" disabled={!sel.length || !project} onClick={() => onPick(project!.accountId, sel)}>Ajouter {sel.length > 1 ? `(${sel.length})` : ""}</button>
        </div>
      </div>
    </div>
  );
}
