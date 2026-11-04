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
  const { data = [] } = await fio(`/accounts/${accountId}/${stack ? "version_stacks" : "folders"}/${folderId}/children?page_size=100`);
  const items = (data as any[]).map((x) => ({
    id: x.id as string, name: (x.name ?? "") as string, type: (x.type ?? "file") as string, mediaType: (x.media_type ?? "") as string,
    createdAt: (x.created_at ?? x.inserted_at ?? "") as string,
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
    original: url("original"),
    thumb: url("thumbnail"),
    status: (f?.status ?? "") as string,
  };
}

// Téléchargement permis pour ce fichier (n = 1 pour V1 ou la 1re vidéo)
export function canDownload(d: { download: boolean; dlApproved: boolean; kind: string; approvedV: number; approved: string; files: string }, n: number) {
  if (!d.download) return false;
  // Versions : seule la dernière se télécharge, les anciennes restent consultables (retours) mais bloquées
  if (d.kind !== "videos" && n < (JSON.parse(d.files || "[]") as unknown[]).length) return false;
  if (!d.dlApproved) return true;
  return d.kind === "videos" ? (JSON.parse(d.approved || "[]") as number[]).includes(n) : d.approvedV === n;
}

// Aperçus réseaux autorisés pour une livraison
export const nets = (v: unknown) => (Array.isArray(v) ? v : []).filter((n) => ["reel", "tiktok", "short", "youtube"].includes(n));
