import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { folderChildren } from "@/lib/frameio";
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
    const items = (await folderChildren(d.accountId, id, q.get("stack") === "1"))
      .map(({ id, name, type, mediaType, version }) => ({ id, name, type, mediaType, version, sig: signItem(params.token, id) }));
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
