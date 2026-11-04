import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Modifier : titre, client, versions (ajout d'une V2…), téléchargement ; ou un commentaire (résolu)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const b = await req.json();
  if (b.commentId) return NextResponse.json(await db.deliveryComment.update({ where: { id: String(b.commentId) }, data: { resolved: !!b.resolved } }));
  const data: Record<string, unknown> = {};
  if (typeof b.title === "string") data.title = b.title.slice(0, 200);
  if (typeof b.client === "string") data.client = b.client.slice(0, 200);
  if (typeof b.message === "string") data.message = b.message.slice(0, 2000);
  if (typeof b.download === "boolean") data.download = b.download;
  if (Array.isArray(b.files)) { data.files = JSON.stringify(b.files.map((f: any) => ({ fileId: String(f.fileId), name: String(f.name ?? "") }))); data.approvedAt = null; data.approvedV = 0; }
  return NextResponse.json(await db.delivery.update({ where: { id: params.id }, data }));
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  return NextResponse.json(await db.delivery.delete({ where: { id: params.id } }));
}
