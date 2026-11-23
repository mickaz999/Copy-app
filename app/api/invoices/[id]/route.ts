import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoiceData } from "@/lib/invoices";
import { totals } from "@/lib/cii";
import { clean } from "../clean";
import { rememberBuyer } from "@/lib/clients";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();
  const inv = await db.invoice.findUnique({ where: { id: params.id } });
  if (!inv) return NextResponse.json({ error: "not found" }, { status: 404 });
  // Facture émise → payée : on l'ajoute au livre des recettes (Compta)
  if (body.status === "paid" && inv.status === "sent") {
    const d = await invoiceData(inv.id);
    await db.transaction.create({ data: { date: body.paidAt ? new Date(body.paidAt) : new Date(), label: `${inv.kind === "credit" ? "Avoir" : "Facture"} ${inv.number}`, kind: "recette", amount: (inv.kind === "credit" ? -1 : 1) * totals(d).due, client: d.buyer.name || inv.client, payment: "Virement", reference: inv.number } });
    return NextResponse.json(await db.invoice.update({ where: { id: inv.id }, data: { status: "paid" } }));
  }
  // Fichier officiel déposé (ou pas) sur l'espace Super PDP
  if (typeof body.deposited === "boolean" && inv.status !== "draft")
    return NextResponse.json(await db.invoice.update({ where: { id: inv.id }, data: { deposited: body.deposited } }));
  // Une facture émise ne se modifie plus (obligation légale) : il faudrait un avoir
  if (inv.status !== "draft") return NextResponse.json({ error: "Facture déjà émise : elle ne peut plus être modifiée." }, { status: 400 });
  if (body.buyer) await rememberBuyer(body.buyer);
  return NextResponse.json(await db.invoice.update({ where: { id: inv.id }, data: clean(body) }));
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const inv = await db.invoice.findUnique({ where: { id: params.id } });
  if (inv && inv.status !== "draft") return NextResponse.json({ error: "Facture déjà émise : elle ne peut pas être supprimée." }, { status: 400 });
  // Seul le dernier brouillon peut être supprimé, pour garder une numérotation sans trou
  const last = await db.invoice.findFirst({ where: { number: { startsWith: inv?.number.slice(0, 7) ?? "" } }, orderBy: { number: "desc" } });
  if (inv && last && last.id !== inv.id) return NextResponse.json({ error: "Seul le dernier brouillon peut être supprimé (numérotation continue). Réutilise celui-ci pour une autre facture." }, { status: 400 });
  if (inv) await db.invoice.delete({ where: { id: inv.id } });
  return NextResponse.json({ ok: true });
}
