import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Enregistre l'appareil pour recevoir les notifications
export async function POST(req: Request) {
  const { subscription, device } = await req.json();
  const { endpoint, keys } = subscription ?? {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) return NextResponse.json({ error: "Abonnement invalide" }, { status: 400 });
  const data = { p256dh: keys.p256dh, auth: keys.auth, device: String(device ?? "").slice(0, 120) };
  await db.pushSub.upsert({ where: { endpoint }, create: { endpoint, ...data }, update: data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { endpoint } = await req.json();
  await db.pushSub.deleteMany({ where: { endpoint } });
  return NextResponse.json({ ok: true });
}
