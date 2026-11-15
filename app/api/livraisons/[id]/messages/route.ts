import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { saveAudio } from "@/lib/deliveryMessages";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Moi → client : note vocale et/ou texte sur une livraison
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const b = await req.json().catch(() => ({}));
  if (b.delete) { await db.deliveryMessage.deleteMany({ where: { id: String(b.delete), deliveryId: params.id } }); return NextResponse.json({ ok: true }); }
  try {
    const audio = await saveAudio(b.audio);
    const text = String(b.text ?? "").trim().slice(0, 3000);
    if (!audio && !text) return NextResponse.json({ error: "Enregistre une note vocale ou écris un message." }, { status: 400 });
    return NextResponse.json(await db.deliveryMessage.create({ data: { deliveryId: params.id, fromMe: true, text, audio } }));
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
