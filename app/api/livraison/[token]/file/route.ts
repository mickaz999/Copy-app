import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fileMedia } from "@/lib/frameio";
import { checkItem } from "@/lib/sign";

export const dynamic = "force-dynamic";

// Livraison d'un dossier : lecture d'un fichier (et téléchargement si autorisé)
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const d = await db.delivery.findUnique({ where: { token: params.token } });
  if (!d || d.kind !== "folder") return NextResponse.json({ error: "Lien invalide." }, { status: 404 });
  const q = new URL(req.url).searchParams;
  const id = q.get("id") ?? "";
  try {
    if (!checkItem(params.token, id, q.get("sig") ?? "")) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    const m = await fileMedia(d.accountId, id);
    if (q.get("download") === "1") {
      if (!d.download || !m.original) return NextResponse.json({ error: "Téléchargement non autorisé." }, { status: 403 });
      return NextResponse.redirect(m.original);
    }
    return NextResponse.json({ name: m.name, mediaType: m.mediaType, play: m.play, thumb: m.thumb, canDownload: d.download && !!m.original });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
