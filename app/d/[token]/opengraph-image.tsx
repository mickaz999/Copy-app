import { db } from "@/lib/db";
import { ogCard } from "@/lib/ogCard";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: { token: string } }) {
  const l = await db.dropLink.findUnique({ where: { token: params.token } }).catch(() => null);
  return ogCard({ title: l?.title ?? "Dépôt de rushs", kicker: l?.client ? `dépôt de rushs · ${l.client.toLowerCase()}` : "dépôt de rushs", sub: "Dépose tes fichiers, sans limite de taille" });
}
