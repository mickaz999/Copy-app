import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fileMedia, folderChildren, isExpired } from "@/lib/frameio";
import { checkItem, signItem } from "@/lib/sign";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Couverture d'un dossier (1re image trouvée) + nombre d'éléments, gardée 10 min en mémoire
const covers = new Map<string, { at: number; cover: string; count: number; latest: string }>();
// Image d'un élément : fichier → sa vignette ; pile de versions → vignette de la dernière version
async function thumbOf(accountId: string, k: { id: string; type: string; thumb: string }) {
  if (k.thumb) return k.thumb;
  if (k.type === "version_stack") {
    const v = (await folderChildren(accountId, k.id, true).catch(() => [])).filter((x) => x.type !== "folder").pop();
    return v ? v.thumb || (await fileMedia(accountId, v.id).then((m) => m.thumb).catch(() => "")) : "";
  }
  return fileMedia(accountId, k.id).then((m) => m.thumb).catch(() => "");
}
async function cover(accountId: string, folderId: string, depth = 0): Promise<{ at: number; cover: string; count: number; latest: string }> {
  const hit = covers.get(folderId);
  // Couverture trouvée : gardée 10 min ; introuvable : on réessaie au bout d'1 min (vignette Frame pas encore prête)
  if (hit && Date.now() - hit.at < (hit.cover ? 10 : 1) * 60_000) return hit;
  const kids = await folderChildren(accountId, folderId).catch(() => []);
  let img = "";
  for (const k of kids.filter((k) => k.type !== "folder").slice(0, 3)) if ((img = await thumbOf(accountId, k))) break;
  // Rien d'affichable directement : couverture d'un sous-dossier (2 niveaux max)
  if (!img && depth < 2) for (const sub of kids.filter((k) => k.type === "folder").slice(0, 2)) if ((img = (await cover(accountId, sub.id, depth + 1)).cover)) break;
  // Date réelle du dossier : celle de l'élément le plus récent qu'il contient (Frame.io date le dossier lui-même)
  let latest = kids.reduce((m, k) => (k.updatedAt > m ? k.updatedAt : m), "");
  if (depth < 1) for (const sub of kids.filter((k) => k.type === "folder").slice(0, 5)) { const l = (await cover(accountId, sub.id, depth + 1)).latest; if (l > latest) latest = l; }
  const out = { at: Date.now(), cover: img, count: kids.length, latest };
  covers.set(folderId, out);
  return out;
}

export async function GET(req: Request, { params }: { params: { token: string } }) {
  const d = await db.delivery.findUnique({ where: { token: params.token } });
  if (d && isExpired(d)) return NextResponse.json({ error: "Ce lien de livraison a expiré. Demande-moi un nouveau lien si besoin.", expired: true }, { status: 410 });
  if (!d || d.kind !== "folder") return NextResponse.json({ error: "Lien invalide." }, { status: 404 });
  const q = new URL(req.url).searchParams;
  const id = q.get("id") || d.folderId;
  if (id !== d.folderId && !checkItem(params.token, id, q.get("sig") ?? "")) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  try {
    const raw = await folderChildren(d.accountId, id, q.get("stack") === "1");
    // Pile de versions (V1, V2, V3…) : on ne montre que la dernière version, comme un simple fichier
    const items = await Promise.all(raw.map(async (x) => {
      if (x.type !== "version_stack") return x;
      const versions = await folderChildren(d.accountId, x.id, true).catch(() => []);
      const last = versions.filter((v) => v.type !== "folder").pop();
      return last ? { ...last, name: x.name || last.name } : x;
    }));
    // Vignettes manquantes : demandées fichier par fichier (40 max)
    let budget = 40;
    await Promise.all(items.map(async (x) => {
      if (x.type === "folder" || x.thumb || budget-- <= 0) return;
      x.thumb = await fileMedia(d.accountId, x.id).then((m) => m.thumb).catch(() => "");
    }));
    // Dossiers d'abord, puis fichiers ; chacun du plus récemment modifié au plus ancien
    items.sort((a, b) => Number(b.type === "folder") - Number(a.type === "folder") || b.updatedAt.localeCompare(a.updatedAt));
    const counts: Record<string, number> = {};
    await Promise.all(items.filter((x) => x.type === "folder").slice(0, 30).map(async (x) => {
      const c = await cover(d.accountId, x.id);
      x.thumb = c.cover; counts[x.id] = c.count;
      if (c.latest) x.updatedAt = c.latest;
    }));
    items.sort((a, b) => Number(b.type === "folder") - Number(a.type === "folder") || b.updatedAt.localeCompare(a.updatedAt));
    const out = items.map(({ id, name, type, mediaType, version, thumb, updatedAt }) => ({ id, name, type, mediaType, version, thumb, updatedAt, count: counts[id], sig: signItem(params.token, id) }));
    return NextResponse.json({ items: out });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
