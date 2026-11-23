import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendGmail } from "@/lib/google";
import { signed } from "@/lib/signature";
import { mailAccount } from "@/lib/notify";

export const dynamic = "force-dynamic";

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Envoie un mail de prospection depuis le Gmail connecté (adresse d'envoi réglée dans Réglages)
export async function POST(req: Request) {
  const { id, to, subject, body } = await req.json();
  const p = await db.prospect.findUnique({ where: { id } });
  if (!p) return NextResponse.json({ error: "Prospect introuvable" }, { status: 404 });
  const dest = String(to ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dest)) return NextResponse.json({ error: "Adresse mail invalide" }, { status: 400 });
  if (!String(subject ?? "").trim() || !String(body ?? "").trim()) return NextResponse.json({ error: "Objet et message requis" }, { status: 400 });
  const acc = await mailAccount();
  if (!acc) return NextResponse.json({ error: "Aucun compte Google avec l'envoi de mails : connecte-le dans Réglages." }, { status: 400 });
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">${esc(String(body)).replace(/\n/g, "<br>")}</div>`;
  try {
    await sendGmail(acc.id, dest, String(subject), await signed(html, "prospect"));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Envoi impossible" }, { status: 502 });
  }
  const updated = await db.prospect.update({
    where: { id },
    data: { email: p.email || dest, lastMail: new Date(), mails: { increment: 1 }, status: p.status === "todo" ? "contacted" : p.status },
  });
  return NextResponse.json(updated);
}
