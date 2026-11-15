import type { Metadata } from "next";
import { db } from "@/lib/db";
import { PUBLIC_URL, tokenOf } from "@/lib/site";

// Titre et description de l'aperçu du lien (l'image vient de opengraph-image.tsx)
export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const d = await db.delivery.findUnique({ where: { token: tokenOf(params.token) } }).catch(() => null);
  // Avec un client : « Livraison Marion » plutôt que le nom du fichier
  const title = d ? `${d.client.trim() ? `Livraison ${d.client.trim()}` : d.title} · maderino production` : "Livraison · maderino production";
  const description = d ? `${d.client.trim() ? `${d.title} : ta` : "Ta"} livraison est prête. Regarde, valide et télécharge tes fichiers.` : "Livraison privée maderino production.";
  return { metadataBase: new URL(PUBLIC_URL), title, description, openGraph: { title, description, type: "website", siteName: "maderino production" }, twitter: { card: "summary_large_image", title, description } };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
