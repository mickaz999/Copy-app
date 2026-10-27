import { db } from "@/lib/db";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const m = await db.media.findUnique({ where: { id: params.id } });
  if (!m) return new Response("Introuvable", { status: 404 });
  return new Response(new Uint8Array(m.data), {
    headers: { "Content-Type": m.mime, "Cache-Control": "private, max-age=31536000, immutable" },
  });
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  await db.media.deleteMany({ where: { id: params.id } });
  return Response.json({ ok: true });
}
