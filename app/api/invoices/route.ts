import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoiceSettings, nextNumber } from "@/lib/invoices";
import { clean } from "./clean";
import { rememberBuyer } from "@/lib/clients";

export const dynamic = "force-dynamic";

export async function GET() {
  const [invoices, settings] = await Promise.all([db.invoice.findMany({ orderBy: { number: "desc" } }), invoiceSettings()]);
  return NextResponse.json({ invoices, settings });
}

// Nouvelle facture (brouillon) : numéro attribué tout de suite, échéance selon les réglages
export async function POST(req: Request) {
  const body = await req.json();
  const s = await invoiceSettings();
  const date = body.date ? new Date(body.date) : new Date();
  const data = clean(body);
  const inv = await db.invoice.create({
    data: { dueDate: new Date(date.getTime() + s.dueDays * 864e5), ...data, date, number: await nextNumber(date, data.kind === "credit" ? "A" : "F") },
  });
  if (body.buyer) await rememberBuyer(body.buyer);
  return NextResponse.json(inv);
}
