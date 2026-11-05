import type { Metadata } from "next";
import { db } from "@/lib/db";
import { PUBLIC_URL } from "@/lib/site";

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const l = await db.dropLink.findUnique({ where: { token: params.token } }).catch(() => null);
  const title = l ? `Dépôt de rushs · ${l.title}` : "Dépôt de rushs · maderino production";
  const description = "Dépose tes fichiers ici, ils m'arrivent directement. Aucun compte à créer.";
  return { metadataBase: new URL(PUBLIC_URL), title, description, openGraph: { title, description, type: "website", siteName: "maderino production" }, twitter: { card: "summary_large_image", title, description } };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
