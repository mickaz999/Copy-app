import { db } from "@/lib/db";
import { parseSignature, signatureHtml } from "@/lib/signatureHtml";
export * from "@/lib/signatureHtml";

// Ajoute la signature à un mail : toujours en prospection, pour les mails clients si l'option est cochée
export async function signed(html: string, kind: "prospect" | "client") {
  const s = parseSignature((await db.notifSettings.findUnique({ where: { id: 1 } }))?.signature);
  if (kind === "client" && !s.clients) return html;
  const sig = signatureHtml(s);
  return sig ? `${html}${sig}` : html;
}
