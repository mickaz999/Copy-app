import { NextResponse } from "next/server";
import { xmlFor } from "@/lib/invoices";

export const dynamic = "force-dynamic";

// Fichier officiel à déposer sur l'espace Super PDP
export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const { data, xml } = await xmlFor(params.id);
    return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="Facture ${data.number}.xml"` } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
