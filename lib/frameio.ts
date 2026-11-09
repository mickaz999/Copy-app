import { db } from "@/lib/db";
import { userToken } from "@/lib/social";

const API = "https://api.frame.io/v4";

export const frameConfigured = () => !!(process.env.FRAMEIO_CLIENT_ID && process.env.FRAMEIO_CLIENT_SECRET);
export const frameConnected = async () => !!(await db.apiToken.findUnique({ where: { provider: "frameio" } }));

// Appel à l'API Frame.io V4 avec le compte connecté
export async function fio(path: string, init: RequestInit = {}, attempt = 1): Promise<any> {
  const token = await userToken("frameio");
  if (!token) throw new Error("Frame.io n'est pas connecté.");
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });
  // Trop de demandes d'un coup : Frame.io demande d'attendre, on réessaie (4 fois max)
  if ((res.status === 429 || res.status >= 500) && attempt < 5) {
    const wait = Number(res.headers.get("retry-after")) * 1000 || 600 * attempt;
    await new Promise((ok) => setTimeout(ok, Math.min(wait, 4000)));
    return fio(path, init, attempt + 1);
  }
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
  // Vignettes demandées en même temps si Frame.io l'accepte, sinon liste simple ;
  // Frame.io renvoie 100 éléments par page : on suit les pages suivantes (links.next) jusqu'au bout
  let first = await fio(`${path}&include=media_links.thumbnail`).catch(() => null);
  const withThumbs = !!first;
  if (!first) first = await fio(path);
  const data: any[] = [...(first.data ?? [])];
  let next: string | null = first.links?.next ?? null;
  for (let i = 0; next && i < 50; i++) {
    const rel = next.replace(/^https?:\/\/[^/]+/, "").replace(/^\/v4/, "");
    const sep = rel.includes("?") ? "&" : "?";
    const page = await fio(withThumbs && !rel.includes("include=") ? `${rel}${sep}include=media_links.thumbnail` : rel);
    data.push(...(page.data ?? []));
    next = page.links?.next ?? null;
  }
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

// Exécute des tâches par petits groupes (Frame.io limite les demandes simultanées)
export async function pool<T, R>(items: T[], size: number, fn: (x: T, i: number) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

// Liens d'un fichier gardés 5 min en mémoire (les adresses signées de Frame.io durent plus longtemps)
const mediaCache = new Map<string, { at: number; m: Awaited<ReturnType<typeof loadMedia>> }>();
export async function fileMedia(accountId: string, fileId: string) {
  const hit = mediaCache.get(fileId);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.m;
  const m = await loadMedia(accountId, fileId);
  mediaCache.set(fileId, { at: Date.now(), m });
  return m;
}

// Liens de lecture et de téléchargement d'un fichier (adresses temporaires signées par Frame.io)
async function loadMedia(accountId: string, fileId: string) {
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
export function canDownload(d: { download: boolean; dlMode: string; kind: string; approvedV: number; approved: string; files: string; validation?: boolean }, n: number) {
  if (!d.download || d.dlMode === "never") return false;
  // Versions : seule la dernière se télécharge, les anciennes restent consultables (retours) mais bloquées
  if (d.kind !== "videos" && n < (JSON.parse(d.files || "[]") as unknown[]).length) return false;
  // Sans validation demandée, « après validation » revient à « toujours »
  if (d.dlMode === "always" || d.validation === false) return true;
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

// Lien de dépôt de rushs valable 1 semaine (prolongeable)
export const DROP_DAYS = 7;
export const dropExpiry = (l: { createdAt: Date; expiresAt: Date | null }) => l.expiresAt ?? new Date(l.createdAt.getTime() + DROP_DAYS * 864e5);

// Lien de livraison valable 1 mois (prolongeable)
export const LINK_DAYS = 30;
export const expiryOf = (d: { createdAt: Date; expiresAt: Date | null }) => d.expiresAt ?? new Date(d.createdAt.getTime() + LINK_DAYS * 864e5);
export const isExpired = (d: { createdAt: Date; expiresAt: Date | null }) => expiryOf(d).getTime() < Date.now();

// Dossier de destination pour un chemin relatif (« Jour 1/Caméra A ») : sous-dossiers trouvés ou créés sur Frame.io
const pathCache = new Map<string, string>();
export async function ensurePath(accountId: string, rootId: string, parts: string[]) {
  let cur = rootId;
  for (const raw of parts) {
    const name = raw.trim().slice(0, 200);
    if (!name) continue;
    const key = `${cur}/${name.toLowerCase()}`;
    let id = pathCache.get(key);
    if (!id) {
      const kids = await folderChildren(accountId, cur).catch(() => []);
      id = kids.find((k) => k.type === "folder" && k.name.toLowerCase() === name.toLowerCase())?.id ?? (await createFolder(accountId, cur, name)).id;
      pathCache.set(key, id);
    }
    cur = id;
  }
  return cur;
}
