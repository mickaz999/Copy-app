import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientDocs, keyFromSlug } from "@/lib/clients";
import { quotePdf } from "@/lib/quotes";
import { pdfFor } from "@/lib/invoices";

export const dynamic = "force-dynamic";

// PDF d'un devis ou d'une facture, uniquement s'il appartient au client de cet espace
export async function GET(req: Request, { params }: { params: { key: string } }) {
  const c = await db.client.findUnique({ where: { key: keyFromSlug(params.key) } });
  if (!c) return NextResponse.json({ error: "Lien invalide." }, { status: 404 });
  const u = new URL(req.url); const t = u.searchParams.get("t"); const id = u.searchParams.get("id") ?? "";
  const docs = await clientDocs(c.nameKey);
  const pdf = (b: Uint8Array, type: string, name: string) => new Response(Buffer.from(b), { headers: { "Content-Type": type, "Content-Disposition": `inline; filename="${encodeURIComponent(name)}"` } });
  if (t === "quote" && docs.quotes.some((q) => q.id === id)) {
    const q = await db.quote.findUnique({ where: { id }, select: { number: true, signed: true, signedName: true, signedType: true } });
    if (q?.signed) return pdf(q.signed, q.signedType || "application/pdf", `Devis ${q.number} signé${(q.signedName.match(/\.\w+$/) ?? [".pdf"])[0]}`);
    const r = await quotePdf(id); return pdf(r.pdf, "application/pdf", `Devis ${r.data.number}.pdf`);
  }
  if (t === "invoice" && docs.invoices.some((i) => i.id === id)) { const r = await pdfFor(id); return pdf(r.pdf, "application/pdf", `Facture ${r.data.number}.pdf`); }
  return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
}
