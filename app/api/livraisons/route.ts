import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const list = await db.delivery.findMany({ orderBy: { createdAt: "desc" }, include: { comments: { orderBy: { createdAt: "asc" } } } });
  return NextResponse.json(list);
}

export async function POST(req: Request) {
  const b = await req.json();
  const files = Array.isArray(b.files) ? b.files.map((f: any) => ({ fileId: String(f.fileId), name: String(f.name ?? "") })) : [];
  if (!b.title || !b.accountId || !files.length) return NextResponse.json({ error: "Titre, compte et au moins une vidéo requis." }, { status: 400 });
  return NextResponse.json(await db.delivery.create({
    data: { token: randomBytes(12).toString("base64url"), title: String(b.title).slice(0, 200), client: String(b.client ?? "").slice(0, 200), message: String(b.message ?? "").slice(0, 2000), accountId: String(b.accountId), files: JSON.stringify(files), download: b.download !== false },
  }));
}
