import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Écoute d'un brief vocal (depuis ta page Livraisons)
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const n = await db.dropNote.findFirst({ where: { id: new URL(req.url).searchParams.get("id") ?? "", link: { token: params.token } } });
  const m = n?.audio ? await db.media.findUnique({ where: { id: n.audio } }) : null;
  if (!m) return new Response("Introuvable", { status: 404 });
  return new Response(m.data, { headers: { "Content-Type": m.mime, "Cache-Control": "private, max-age=86400" } });
}
