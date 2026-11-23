import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const b = await req.json();
  const data: { name?: string; unitPrice?: number } = {};
  if ("name" in b && String(b.name).trim()) data.name = String(b.name).trim();
  if ("unitPrice" in b) data.unitPrice = Number(b.unitPrice) || 0;
  return NextResponse.json(await db.product.update({ where: { id: params.id }, data }));
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  await db.product.deleteMany({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
