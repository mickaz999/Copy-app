import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Lecture d'un message vocal laissé sur une livraison
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const c = await db.deliveryComment.findFirst({ where: { id, delivery: { token: params.token } } });
  const m = c?.audio ? await db.media.findUnique({ where: { id: c.audio } }) : null;
  if (!m) return new Response("Introuvable", { status: 404 });
  return new Response(m.data, { headers: { "Content-Type": m.mime, "Cache-Control": "private, max-age=86400" } });
}
