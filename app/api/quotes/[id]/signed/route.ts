import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Devis signé renvoyé par le client
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const q = await db.quote.findUnique({ where: { id: params.id }, select: { signed: true, signedName: true, signedType: true } });
  if (!q?.signed) return new Response("Pas de devis signé", { status: 404 });
  return new Response(Buffer.from(q.signed), {
    headers: { "Content-Type": q.signedType || "application/octet-stream", "Content-Disposition": `inline; filename="${encodeURIComponent(q.signedName || "devis-signe")}"` },
  });
}
