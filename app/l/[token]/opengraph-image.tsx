import { db } from "@/lib/db";
import { fileMedia } from "@/lib/frameio";
import { ogCard } from "@/lib/ogCard";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Livraison maderino production";

// Image d'aperçu : vignette du premier fichier de la livraison
export default async function Image({ params }: { params: { token: string } }) {
  const d = await db.delivery.findUnique({ where: { token: params.token } }).catch(() => null);
  if (!d) return ogCard({ title: "Livraison", kicker: "livraison privée", sub: "maderino production" });
  const files: { fileId: string }[] = JSON.parse(d.files || "[]");
  const bg = files[0] ? await fileMedia(d.accountId, files[0].fileId).then((m) => m.thumb).catch(() => "") : "";
  const n = files.length;
  const sub = d.kind === "folder" ? "Dossier de livraison" : n > 1 ? `${n} fichiers à découvrir` : "Ta vidéo est prête";
  return ogCard({ title: d.title, kicker: d.client ? `livraison · ${d.client.toLowerCase()}` : "livraison", sub, bg: bg || undefined });
}
