import { NextResponse } from "next/server";
import { resendInvoice } from "@/lib/invoices";

export const dynamic = "force-dynamic";

// Renvoie le mail d'une facture déjà émise (même PDF)
export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    return NextResponse.json(await resendInvoice(params.id));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
