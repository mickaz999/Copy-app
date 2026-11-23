import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { nextQuoteNumber } from "@/lib/quotes";
import { cleanQuote } from "./clean";
import { rememberBuyer } from "@/lib/clients";

export const dynamic = "force-dynamic";

const LIST = { id: true, number: true, date: true, validUntil: true, buyer: true, lines: true, note: true, discount: true, status: true, signedName: true, invoiceId: true, error: true, sentAt: true, acceptedAt: true };

export async function GET() {
  return NextResponse.json(await db.quote.findMany({ orderBy: { number: "desc" }, select: LIST }));
}

// Nouveau devis (brouillon), valable 30 jours par défaut
export async function POST(req: Request) {
  const body = await req.json();
  const date = body.date ? new Date(body.date) : new Date();
  const q = await db.quote.create({
    data: { validUntil: new Date(date.getTime() + 30 * 864e5), ...cleanQuote(body), date, number: await nextQuoteNumber(date) },
    select: LIST,
  });
  if (body.buyer) await rememberBuyer(body.buyer);
  return NextResponse.json(q);
}
