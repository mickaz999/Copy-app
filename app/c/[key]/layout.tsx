import DeadLink from "@/components/DeadLink";
import { isLegacy } from "@/lib/site";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { keyFromSlug } from "@/lib/clients";
import { PUBLIC_URL } from "@/lib/site";

export async function generateMetadata({ params }: { params: { key: string } }): Promise<Metadata> {
  const c = await db.client.findUnique({ where: { key: keyFromSlug(params.key) } }).catch(() => null);
  const title = c ? `${c.name} · maderino production` : "Espace client · maderino production";
  const description = "Ton espace : tes livraisons et tes dépôts de fichiers en cours.";
  return { metadataBase: new URL(PUBLIC_URL), title, description, robots: { index: false }, openGraph: { title, description, type: "website", siteName: "maderino production" } };
}

export default function Layout({ children, params }: { children: React.ReactNode; params: { key: string } }) {
  if (isLegacy(params.key, 12)) return <DeadLink />;
  return children;
}
