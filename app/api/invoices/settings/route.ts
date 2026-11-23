import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = await req.json();
  const str = (k: string) => String(b[k] ?? "").trim();
  const data = {
    name: str("name"), siren: str("siren").replace(/\s/g, ""), address: str("address"), zip: str("zip"), city: str("city"),
    email: str("email"), vat: str("vat"), iban: str("iban"), vatNote: str("vatNote"), logo: str("logo"),
    vatRate: Number(b.vatRate) || 0, dueDays: Math.max(0, Math.round(Number(b.dueDays) || 0)), einvoice: !!b.einvoice,
  };
  return NextResponse.json(await db.invoiceSettings.upsert({ where: { id: 1 }, create: data, update: data }));
}
