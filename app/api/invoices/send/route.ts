import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendGmail } from "@/lib/google";
import { mailAccount } from "@/lib/notify";
import { addClientEmail } from "@/lib/clients";
import { euro, invoiceUrl, itemsOf, totalOf } from "@/lib/invoices";

export const dynamic = "force-dynamic";

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Envoie la facture au client par mail (lien vers la facture en ligne, téléchargeable en PDF)
export async function POST(req: Request) {
  const { id, to, subject, body } = await req.json();
  const inv = await db.invoice.findUnique({ where: { id: String(id) } });
  if (!inv) return NextResponse.json({ error: "Facture introuvable" }, { status: 404 });
  const dest = String(to ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dest)) return NextResponse.json({ error: "Adresse mail invalide" }, { status: 400 });
  const acc = await mailAccount();
  if (!acc) return NextResponse.json({ error: "Aucun compte Google avec l'envoi de mails : connecte-le dans Réglages." }, { status: 400 });
  const url = invoiceUrl(inv);
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">${esc(String(body ?? "")).replace(/\n/g, "<br>")}
<p style="margin:22px 0"><a href="${url}" style="background:#ff6a00;color:#fff;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Voir la facture ${esc(inv.number)} · ${euro(totalOf(itemsOf(inv.items)))}</a></p>
<p style="color:#777;font-size:12px">Tu peux la télécharger en PDF depuis cette page.</p></div>`;
  try {
    await sendGmail(acc.id, dest, String(subject || `Facture ${inv.number}`), html);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Envoi impossible" }, { status: 502 });
  }
  await addClientEmail(inv.client, dest.toLowerCase()).catch(() => {});
  return NextResponse.json(await db.invoice.update({ where: { id: inv.id }, data: { email: dest, sentAt: new Date(), status: inv.status === "paid" ? "paid" : "sent" } }));
}
