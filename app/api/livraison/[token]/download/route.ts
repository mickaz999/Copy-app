import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notifyDownload } from "@/lib/deliveryTasks";
import { canDownload, fileMedia, isExpired } from "@/lib/frameio";

export const dynamic = "force-dynamic";

// ?v=2 : lien de téléchargement Frame.io frais (ceux de Frame expirent), puis redirection
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const d = await db.delivery.findUnique({ where: { token: params.token } });
  if (d && isExpired(d)) return NextResponse.json({ error: "Ce lien de livraison a expiré. Demande-moi un nouveau lien si besoin.", expired: true }, { status: 410 });
  const n = Number(new URL(req.url).searchParams.get("v"));
  if (!d || !canDownload(d, n)) return NextResponse.json({ error: "Téléchargement non autorisé : valide d'abord cette version." }, { status: 403 });
  const files: { fileId: string }[] = JSON.parse(d.files || "[]");
  const f = files[n - 1];
  if (!f) return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
  try {
    const m = await fileMedia(d.accountId, f.fileId);
    if (!m.original) throw new Error("pas de lien");
    // ?url=1 : renvoie l'adresse (pour enregistrer dans Photos sur iPhone)
    if (new URL(req.url).searchParams.get("url")) { await notifyDownload(d, files.length > 1 ? "ses fichiers" : "sa vidéo"); return NextResponse.json({ url: m.original, name: m.name, type: m.mediaType }); }
    await notifyDownload(d, files.length > 1 ? "ses fichiers" : "sa vidéo");
    return NextResponse.redirect(m.original);
  } catch {
    return NextResponse.json({ error: "Frame.io ne répond pas, réessaie dans un instant." }, { status: 502 });
  }
}
