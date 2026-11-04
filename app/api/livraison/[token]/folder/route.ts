import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fileMedia, folderChildren } from "@/lib/frameio";
import { checkItem, signItem } from "@/lib/sign";

export const dynamic = "force-dynamic";

// Livraison d'un dossier : contenu d'un (sous-)dossier, lu en direct sur Frame.io.
// Chaque élément renvoyé est signé ; on ne peut ouvrir que le dossier livré ou un élément signé.
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const d = await db.delivery.findUnique({ where: { token: params.token } });
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
    const out = items.map(({ id, name, type, mediaType, version, thumb, updatedAt }) => ({ id, name, type, mediaType, version, thumb, updatedAt, sig: signItem(params.token, id) }));
    return NextResponse.json({ items: out });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
