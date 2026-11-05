import type { Metadata } from "next";
import { PUBLIC_URL } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(PUBLIC_URL),
  title: "Prendre rendez-vous · maderino production",
  description: "Choisis un créneau libre, en visio ou par appel WhatsApp.",
  openGraph: { title: "Prendre rendez-vous · maderino production", description: "Choisis un créneau libre, en visio ou par appel WhatsApp.", type: "website", siteName: "maderino production" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
