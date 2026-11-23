import { db } from "@/lib/db";
import { quotePdf } from "@/lib/quotes";

export const dynamic = "force-dynamic";

// Devis : la version signée renvoyée par le client remplace le devis d'origine
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const q = await db.quote.findUnique({ where: { id: params.id }, select: { number: true, signed: true, signedName: true, signedType: true } });
  if (q?.signed) {
    return new Response(Buffer.from(q.signed), {
      headers: { "Content-Type": q.signedType || "application/pdf", "Content-Disposition": `inline; filename="${encodeURIComponent(`Devis ${q.number} signé${(q.signedName.match(/\.\w+$/) ?? [".pdf"])[0]}`)}"` },
    });
  }
  const { data, pdf } = await quotePdf(params.id);
  return new Response(Buffer.from(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="Devis ${data.number}.pdf"` },
  });
}
