import { db } from "@/lib/db";
import { audioResponse } from "@/lib/audioResponse";

export const dynamic = "force-dynamic";

// Lecture d'un message vocal laissé sur une livraison
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const c = await db.deliveryComment.findFirst({ where: { id, delivery: { token: params.token } } });
  const m = c?.audio ? await db.media.findUnique({ where: { id: c.audio } }) : null;
  if (!m) return new Response("Introuvable", { status: 404 });
  return audioResponse(req, new Uint8Array(m.data), m.mime);
}
