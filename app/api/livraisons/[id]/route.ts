import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { nets } from "@/lib/frameio";
import { pullFrameComments, syncCommentResolved } from "@/lib/deliveryTasks";

export const dynamic = "force-dynamic";

// Modifier : titre, client, versions (ajout d'une V2…), téléchargement ; ou un commentaire (résolu)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const b = await req.json();
  if (b.commentId) {
    const c = await db.deliveryComment.update({ where: { id: String(b.commentId) }, data: { resolved: !!b.resolved } });
    await syncCommentResolved(c);
    return NextResponse.json(c);
  }
  // Vérifier tout de suite les commentaires Frame.io de cette livraison
  if (b.action === "sync") {
    try { return NextResponse.json({ added: await pullFrameComments(params.id) }); }
    catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 502 }); }
  }
  const data: Record<string, unknown> = {};
  if (typeof b.title === "string") data.title = b.title.slice(0, 200);
  if (typeof b.client === "string") data.client = b.client.slice(0, 200);
  if (typeof b.message === "string") data.message = b.message.slice(0, 2000);
  if (typeof b.download === "boolean") data.download = b.download;
  if (b.kind === "videos" || b.kind === "versions") data.kind = b.kind;
  if (Array.isArray(b.networks)) data.networks = JSON.stringify(nets(b.networks));
  if (Array.isArray(b.files)) { data.files = JSON.stringify(b.files.map((f: any) => ({ fileId: String(f.fileId), name: String(f.name ?? "") }))); data.approvedAt = null; data.approvedV = 0; }
  return NextResponse.json(await db.delivery.update({ where: { id: params.id }, data }));
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  return NextResponse.json(await db.delivery.delete({ where: { id: params.id } }));
}
