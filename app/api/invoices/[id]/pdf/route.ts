import { pdfFor } from "@/lib/invoices";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const { data, pdf } = await pdfFor(params.id);
  return new Response(Buffer.from(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="Facture ${data.number}.pdf"` },
  });
}
