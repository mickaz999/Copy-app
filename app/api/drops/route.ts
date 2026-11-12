import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { createFolder } from "@/lib/frameio";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await db.dropLink.findMany({ orderBy: { createdAt: "desc" }, include: { files: { orderBy: { createdAt: "desc" } }, notes: { orderBy: { createdAt: "asc" } } } }));
}

// Nouveau lien de dépôt ; newFolder = nom du sous-dossier à créer dans le dossier choisi
export async function POST(req: Request) {
  const b = await req.json();
  const title = String(b.title ?? "").trim().slice(0, 200);
  if (!title || !b.accountId || !b.folderId) return NextResponse.json({ error: "Titre et dossier Frame.io requis." }, { status: 400 });
  let folder = { id: String(b.folderId), name: String(b.folderName ?? "") };
  if (String(b.newFolder ?? "").trim()) {
    try { folder = await createFolder(b.accountId, folder.id, String(b.newFolder).trim().slice(0, 200)); }
    catch (e) { return NextResponse.json({ error: `Création du dossier impossible : ${(e as Error).message}` }, { status: 502 }); }
  }
  return NextResponse.json(await db.dropLink.create({
    data: { token: randomBytes(12).toString("base64url"), title, client: String(b.client ?? "").slice(0, 200), message: String(b.message ?? "").slice(0, 2000), accountId: String(b.accountId), folderId: folder.id, folderName: folder.name },
  }));
}
