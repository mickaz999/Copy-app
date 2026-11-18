import { db } from "@/lib/db";
import { audioResponse } from "@/lib/audioResponse";

export const dynamic = "force-dynamic";

// Lecture d'une note vocale de l'échange (côté client)
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const msg = await db.deliveryMessage.findFirst({ where: { id, delivery: { token: params.token } } });
  const m = msg?.audio ? await db.media.findUnique({ where: { id: msg.audio } }) : null;
  if (!m) return new Response("Introuvable", { status: 404 });
  return audioResponse(req, new Uint8Array(m.data), m.mime);
}
