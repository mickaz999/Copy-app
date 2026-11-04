import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { folderChildren, folderInfo, isInside } from "@/lib/frameio";

export const dynamic = "force-dynamic";

// Livraison d'un dossier : contenu d'un (sous-)dossier, lu en direct sur Frame.io
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const d = await db.delivery.findUnique({ where: { token: params.token } });
  if (!d || d.kind !== "folder") return NextResponse.json({ error: "Lien invalide." }, { status: 404 });
  const q = new URL(req.url).searchParams;
  const id = q.get("id") || d.folderId;
  const stack = q.get("stack") === "1";
  try {
    if (!(await isInside(d.accountId, d.folderId, id, stack ? "file" : "folder"))) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    // Fil d'Ariane jusqu'au dossier livré
    const path: { id: string; name: string }[] = [];
    if (!stack) for (let cur = id, i = 0; cur && i < 15; i++) {
      const f = await folderInfo(d.accountId, cur);
      path.unshift({ id: f.id, name: cur === d.folderId ? d.title : f.name });
      if (cur === d.folderId) break;
      cur = f.parentId;
    }
    const items = (await folderChildren(d.accountId, id, stack)).map(({ id, name, type, mediaType, version }) => ({ id, name, type, mediaType, version }));
    return NextResponse.json({ path, items });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
