import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { billingOf, emailsOf } from "@/lib/clients";

export const dynamic = "force-dynamic";

// Clients enregistrés avec leurs coordonnées, pour remplir devis et factures
export async function GET() {
  const clients = await db.client.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(clients.map((c) => {
    const b = billingOf(c);
    return { name: c.name, ...b, email: b.email || emailsOf(c)[0] || "" };
  }));
}
