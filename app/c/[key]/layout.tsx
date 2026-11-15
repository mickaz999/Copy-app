import type { Metadata } from "next";
import { db } from "@/lib/db";
import { PUBLIC_URL } from "@/lib/site";

export async function generateMetadata({ params }: { params: { key: string } }): Promise<Metadata> {
  const c = await db.client.findUnique({ where: { key: params.key } }).catch(() => null);
  const title = c ? `${c.name} · maderino production` : "Espace client · maderino production";
  const description = "Ton espace : tes livraisons et tes dépôts de fichiers en cours.";
  return { metadataBase: new URL(PUBLIC_URL), title, description, robots: { index: false }, openGraph: { title, description, type: "website", siteName: "maderino production" } };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
