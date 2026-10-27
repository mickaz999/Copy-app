import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const MAX = 4 * 1024 * 1024; // 4 Mo par fichier (Vercel refuse les envois de plus de 4,5 Mo)

// Reçoit un fichier (vocal, image) et renvoie son identifiant
export async function POST(req: Request) {
  const mime = req.headers.get("content-type") ?? "application/octet-stream";
  if (!/^(audio|image)\//.test(mime)) return NextResponse.json({ error: "Seuls les vocaux et les images sont acceptés" }, { status: 400 });
  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length) return NextResponse.json({ error: "Fichier vide" }, { status: 400 });
  if (buf.length > MAX) return NextResponse.json({ error: "Fichier trop lourd (4 Mo maximum)" }, { status: 413 });
  const m = await db.media.create({ data: { mime: mime.split(";")[0], data: buf } });
  return NextResponse.json({ id: m.id });
}
