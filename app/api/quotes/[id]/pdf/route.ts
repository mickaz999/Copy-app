import { quotePdf } from "@/lib/quotes";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const { data, pdf } = await quotePdf(params.id);
  return new Response(Buffer.from(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="Devis ${data.number}.pdf"` },
  });
}
