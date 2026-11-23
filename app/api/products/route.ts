import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await db.product.findMany({ orderBy: { name: "asc" } }));
}

export async function POST(req: Request) {
  const b = await req.json();
  const name = String(b.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Nom manquant" }, { status: 400 });
  return NextResponse.json(await db.product.create({ data: { name, unitPrice: Number(b.unitPrice) || 0 } }));
}
