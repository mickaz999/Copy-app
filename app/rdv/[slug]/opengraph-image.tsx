import { ogCard } from "@/lib/ogCard";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return ogCard({ title: "Prendre rendez-vous", kicker: "maderino production", sub: "Visio ou appel WhatsApp · créneaux en direct" });
}
