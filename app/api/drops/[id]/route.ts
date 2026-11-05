import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DROP_DAYS, dropExpiry } from "@/lib/frameio";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const b = await req.json();
  const data: Record<string, unknown> = {};
  if (typeof b.active === "boolean") data.active = b.active;
  // Prolonger d'une semaine (à partir d'aujourd'hui si déjà expiré)
  if (b.action === "extend") {
    const cur = await db.dropLink.findUniqueOrThrow({ where: { id: params.id } });
    data.expiresAt = new Date(Math.max(Date.now(), dropExpiry(cur).getTime()) + DROP_DAYS * 864e5);
  }
  if (typeof b.title === "string") data.title = b.title.slice(0, 200);
  if (typeof b.message === "string") data.message = b.message.slice(0, 2000);
  return NextResponse.json(await db.dropLink.update({ where: { id: params.id }, data }));
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  return NextResponse.json(await db.dropLink.delete({ where: { id: params.id } }));
}
