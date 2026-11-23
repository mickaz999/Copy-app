import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const config = () => db.prospectConfig.upsert({ where: { id: 1 }, create: {}, update: {} });
const STATUSES = ["todo", "contacted", "replied", "won", "lost"];

// Liste des prospects + modèles de mails
export async function GET() {
  const [list, c] = await Promise.all([db.prospect.findMany({ orderBy: { createdAt: "desc" } }), config()]);
  return NextResponse.json({ list, templates: JSON.parse(c.templates || "[]") });
}

// Création / modification / suppression d'un prospect, ou des réglages ({ config: … })
export async function POST(req: Request) {
  const b = await req.json();
  if (b.config) {
    const data = {
      templates: JSON.stringify((Array.isArray(b.config.templates) ? b.config.templates : []).map((t: any) => ({ name: String(t.name ?? ""), subject: String(t.subject ?? ""), body: String(t.body ?? "") }))),
    };
    await db.prospectConfig.upsert({ where: { id: 1 }, create: data, update: data });
    return NextResponse.json({ ok: true });
  }
  if (b.id && b.delete) return NextResponse.json(await db.prospect.delete({ where: { id: b.id } }));
  const data: Record<string, string> = {};
  for (const f of ["name", "email", "company", "note"]) if (f in b) data[f] = String(b[f] ?? "").trim();
  if ("status" in b && STATUSES.includes(b.status)) data.status = b.status;
  if (b.id) return NextResponse.json(await db.prospect.update({ where: { id: b.id }, data }));
  if (!data.name) return NextResponse.json({ error: "Nom manquant" }, { status: 400 });
  return NextResponse.json(await db.prospect.create({ data: { ...data, name: data.name } }));
}
