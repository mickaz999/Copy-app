import { db } from "@/lib/db";
import { userToken } from "@/lib/social";

const API = "https://api.frame.io/v4";

export const frameConfigured = () => !!(process.env.FRAMEIO_CLIENT_ID && process.env.FRAMEIO_CLIENT_SECRET);
export const frameConnected = async () => !!(await db.apiToken.findUnique({ where: { provider: "frameio" } }));

// Appel à l'API Frame.io V4 avec le compte connecté
export async function fio(path: string, init: RequestInit = {}) {
  const token = await userToken("frameio");
  if (!token) throw new Error("Frame.io n'est pas connecté.");
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Frame.io ${res.status} : ${body?.errors?.[0]?.detail ?? body?.message ?? JSON.stringify(body).slice(0, 200)}`);
  return body;
}

// Tous les projets de tous les espaces de travail du compte
export async function listProjects() {
  const { data: accounts = [] } = await fio("/accounts");
  const out: { accountId: string; account: string; workspace: string; id: string; name: string; rootFolderId: string }[] = [];
  for (const a of accounts) {
    const { data: workspaces = [] } = await fio(`/accounts/${a.id}/workspaces`);
    for (const w of workspaces) {
      const { data: projects = [] } = await fio(`/accounts/${a.id}/workspaces/${w.id}/projects`);
      for (const p of projects) out.push({ accountId: a.id, account: a.display_name ?? a.name ?? "", workspace: w.name ?? "", id: p.id, name: p.name, rootFolderId: p.root_folder_id ?? "" });
    }
  }
  return out;
}

// Contenu d'un dossier Frame.io (dossiers, fichiers, piles de versions)
export async function folderChildren(accountId: string, folderId: string, stack = false) {
  const path = `/accounts/${accountId}/${stack ? "version_stacks" : "folders"}/${folderId}/children?page_size=100`;
  // Vignettes demandées en même temps si Frame.io l'accepte, sinon liste simple
  const { data = [] } = await fio(`${path}&include=media_links.thumbnail`).catch(() => fio(path));
  const items = (data as any[]).map((x) => ({
    id: x.id as string, name: (x.name ?? "") as string, type: (x.type ?? "file") as string, mediaType: (x.media_type ?? "") as string,
    createdAt: (x.created_at ?? x.inserted_at ?? "") as string,
    updatedAt: (x.updated_at ?? x.created_at ?? x.inserted_at ?? "") as string,
    thumb: (x.media_links?.thumbnail?.download_url ?? x.media_links?.thumbnail?.url ?? "") as string,
    version: 0,
  }));
  // Pile de versions : de la plus ancienne (V1) à la plus récente
  if (stack) items.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).forEach((x, i) => { x.version = i + 1; });
  return items;
}

// Liens de lecture et de téléchargement d'un fichier (adresses temporaires signées par Frame.io)
export async function fileMedia(accountId: string, fileId: string) {
  const { data: f } = await fio(`/accounts/${accountId}/files/${fileId}?include=media_links.high_quality,media_links.efficient,media_links.original,media_links.thumbnail`);
  const l = f?.media_links ?? {};
  const url = (k: string) => l[k]?.download_url ?? l[k]?.url ?? "";
  return {
    name: (f?.name ?? "") as string,
    mediaType: (f?.media_type ?? "") as string,
    play: url("high_quality") || url("efficient") || url("original"),
    // Version allégée : lue tant que le téléchargement n'est pas débloqué
    light: url("efficient") || url("high_quality") || url("original"),
    // Fichier original tel qu'envoyé (download_url force le téléchargement ; jamais une version recompressée)
    original: l.original?.download_url ?? "",
    thumb: url("thumbnail"),
    status: (f?.status ?? "") as string,
  };
}

// Téléchargement permis pour ce fichier (n = 1 pour V1 ou la 1re vidéo)
export function canDownload(d: { download: boolean; dlMode: string; kind: string; approvedV: number; approved: string; files: string }, n: number) {
  if (!d.download || d.dlMode === "never") return false;
  // Versions : seule la dernière se télécharge, les anciennes restent consultables (retours) mais bloquées
  if (d.kind !== "videos" && n < (JSON.parse(d.files || "[]") as unknown[]).length) return false;
  if (d.dlMode === "always") return true;
  return d.kind === "videos" ? (JSON.parse(d.approved || "[]") as number[]).includes(n) : d.approvedV === n;
}

// Aperçus réseaux autorisés pour une livraison
export const nets = (v: unknown) => (Array.isArray(v) ? v : []).filter((n) => ["reel", "tiktok", "short", "youtube"].includes(n));

// Un dossier ou fichier se trouve-t-il dans le dossier livré ? (remonte les parents, résultat mis en cache)
const inside = new Map<string, boolean>();
export async function isInside(accountId: string, rootId: string, id: string, type: "folder" | "file") {
  if (id === rootId) return true;
  const key = `${rootId}:${id}`;
  if (inside.has(key)) return inside.get(key)!;
  let cur = id, kind: string = type, ok = false;
  for (let i = 0; i < 15 && cur; i++) {
    const path = kind === "file" ? `/accounts/${accountId}/files/${cur}` : kind === "version_stack" ? `/accounts/${accountId}/version_stacks/${cur}` : `/accounts/${accountId}/folders/${cur}`;
    const { data } = await fio(path).catch(() => ({ data: null }));
    const parent = data?.parent_id;
    if (!parent) break;
    if (parent === rootId) { ok = true; break; }
    cur = parent; kind = "folder";
  }
  inside.set(key, ok);
  return ok;
}

export async function folderInfo(accountId: string, folderId: string) {
  const { data } = await fio(`/accounts/${accountId}/folders/${folderId}`);
  return { id: data?.id as string, name: (data?.name ?? "") as string, parentId: (data?.parent_id ?? "") as string };
}

// Crée un sous-dossier dans un dossier Frame.io
export async function createFolder(accountId: string, parentId: string, name: string) {
  const { data } = await fio(`/accounts/${accountId}/folders/${parentId}/folders`, {
    method: "POST", headers: { "api-version": "experimental" }, body: JSON.stringify({ data: { name } }),
  });
  return { id: data.id as string, name: (data.name ?? name) as string };
}

// Prépare l'envoi d'un fichier dans un dossier : Frame.io renvoie des adresses où envoyer le fichier, morceau par morceau
export async function startUpload(accountId: string, folderId: string, name: string, size: number) {
  const body = JSON.stringify({ data: { name, file_size: size } });
  const { data } = await fio(`/accounts/${accountId}/folders/${folderId}/files/local_upload`, { method: "POST", body })
    .catch(() => fio(`/accounts/${accountId}/folders/${folderId}/files/local_upload`, { method: "POST", body, headers: { "api-version": "experimental" } }));
  return {
    fileId: data.id as string,
    mediaType: (data.media_type ?? "") as string,
    urls: ((data.upload_urls ?? []) as { url: string; size: number }[]).map((u) => ({ url: u.url, size: u.size })),
  };
}
