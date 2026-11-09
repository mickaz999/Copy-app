import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dropExpiry, ensurePath, startUpload } from "@/lib/frameio";
import { getSettings, parisNow, sendPush } from "@/lib/notify";

export const dynamic = "force-dynamic";

const find = (token: string) => db.dropLink.findUnique({ where: { token }, include: { files: { orderBy: { createdAt: "desc" } } } });
const gb = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} Go` : `${Math.max(1, Math.round(n / 1e6))} Mo`);

// Page de dépôt (sans connexion)
export async function GET(_: Request, { params }: { params: { token: string } }) {
  const l = await find(params.token);
  if (!l || !l.active) return NextResponse.json({ error: "Ce lien de dépôt n'est plus actif." }, { status: 404 });
  if (dropExpiry(l).getTime() < Date.now()) return NextResponse.json({ error: "Ce lien de dépôt a expiré. Demande-moi un nouveau lien si besoin." }, { status: 410 });
  return NextResponse.json({ expiresAt: dropExpiry(l), title: l.title, client: l.client, message: l.message, files: l.files.map((f) => ({ name: f.name, size: f.size, author: f.author, createdAt: f.createdAt })) });
}

// start : prépare l'envoi d'un fichier sur Frame.io ; done : fichier reçu ; finish : fin d'un envoi groupé (notification + tâche)
export async function POST(req: Request, { params }: { params: { token: string } }) {
  const l = await find(params.token);
  if (!l || !l.active) return NextResponse.json({ error: "Ce lien de dépôt n'est plus actif." }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  // Expiré : plus de nouvel envoi (un fichier déjà commencé peut se terminer)
  if (dropExpiry(l).getTime() < Date.now() && b.action === "start") return NextResponse.json({ error: "Ce lien de dépôt a expiré." }, { status: 410 });
  const author = String(b.author ?? "").trim().slice(0, 80);
  if (b.action === "start") {
    const name = String(b.name ?? "").slice(0, 300), size = Number(b.size);
    if (!name || !(size > 0)) return NextResponse.json({ error: "Fichier invalide." }, { status: 400 });
    // Fichier venant d'un dossier déposé : on recrée ses sous-dossiers sur Frame.io
    const parts = String(b.dir ?? "").split("/").filter(Boolean).slice(0, 8);
    try {
      const folderId = parts.length ? await ensurePath(l.accountId, l.folderId, parts) : l.folderId;
      return NextResponse.json(await startUpload(l.accountId, folderId, name, size));
    }
    catch (e) { return NextResponse.json({ error: `Frame.io refuse l'envoi : ${(e as Error).message}` }, { status: 502 }); }
  }
  if (b.action === "done") {
    await db.dropFile.create({ data: { linkId: l.id, name: String(b.name ?? "").slice(0, 300), size: Number(b.size) || 0, fileId: String(b.fileId ?? ""), author } });
    return NextResponse.json({ ok: true });
  }
  if (b.action === "finish") {
    const names: string[] = (Array.isArray(b.names) ? b.names : []).map((n: unknown) => String(n).slice(0, 300)).slice(0, 200);
    const total = Number(b.total) || 0;
    const who = author || l.client || "Le client";
    const s = await getSettings();
    if (s.pushEnabled) await sendPush({ title: `Rushs reçus · ${l.title}`, body: `${who} a déposé ${names.length} fichier${names.length > 1 ? "s" : ""} (${gb(total)}).`, url: "/livraisons", tag: `drop-${l.id}-${Date.now()}` }).catch(() => {});
    // Tâche « Dérusher » dans le Planning, avec la liste des fichiers reçus
    const today = parisNow().day;
    await db.task.create({ data: {
      title: `Dérusher · ${l.title}`, category: "Clients", status: "todo", date: new Date(today),
      notes: `${who} a déposé ${names.length} fichier(s) (${gb(total)}) dans le dossier Frame.io « ${l.folderName} ».`,
      subtasks: JSON.stringify(names.map((n, i) => ({ id: `r${Date.now()}${i}`, title: n, done: false }))),
    } }).catch(() => {});
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
}
