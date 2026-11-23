import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cleanQuote } from "../clean";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();
  const q = await db.quote.findUnique({ where: { id: params.id } });
  if (!q) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (q.status === "accepted") return NextResponse.json({ error: "Devis déjà validé : il ne peut plus être modifié." }, { status: 400 });
  // Refusé par le client (ou remis en attente)
  if (body.status === "refused" || body.status === "sent") {
    await db.quote.update({ where: { id: q.id }, data: { status: body.status } });
    return NextResponse.json({ ok: true });
  }
  await db.quote.update({ where: { id: q.id }, data: cleanQuote(body) });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const q = await db.quote.findUnique({ where: { id: params.id } });
  if (q?.status === "accepted") return NextResponse.json({ error: "Devis validé : il est lié à une facture." }, { status: 400 });
  await db.quote.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
