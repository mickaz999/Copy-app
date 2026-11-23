import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DEFAULT_TEMPLATES, normalizeTemplates } from "@/lib/prospects";

export const dynamic = "force-dynamic";

const config = () => db.prospectConfig.upsert({ where: { id: 1 }, create: { templates: JSON.stringify(DEFAULT_TEMPLATES) }, update: {} });
const STATUSES = ["todo", "contacted", "replied", "won", "lost"];

// Liste des prospects + modèles de mails (séquence)
export async function GET() {
  const [list, c] = await Promise.all([db.prospect.findMany({ orderBy: { createdAt: "desc" } }), config()]);
  const templates = normalizeTemplates(JSON.parse(c.templates || "[]"));
  return NextResponse.json({ list, templates: templates.length ? templates : DEFAULT_TEMPLATES });
}

// Création / modification / suppression d'un prospect, import en masse ({ import: [...] }), ou réglages ({ config: … })
export async function POST(req: Request) {
  const b = await req.json();
  if (b.config) {
    const data = { templates: JSON.stringify(normalizeTemplates(b.config.templates)) };
    await db.prospectConfig.upsert({ where: { id: 1 }, create: data, update: data });
    return NextResponse.json({ ok: true });
  }
  if (Array.isArray(b.import)) {
    const existing = new Set((await db.prospect.findMany({ select: { email: true } })).map((p) => p.email.toLowerCase()).filter(Boolean));
    const rows = b.import
      .map((r: any) => ({ name: String(r?.name ?? "").trim(), email: String(r?.email ?? "").trim(), company: String(r?.company ?? "").trim(), hook: String(r?.hook ?? "").trim() }))
      .filter((r: any) => r.name && !(r.email && existing.has(r.email.toLowerCase())));
    if (rows.length) await db.prospect.createMany({ data: rows });
    return NextResponse.json({ added: rows.length, skipped: b.import.length - rows.length });
  }
  if (b.id && b.delete) return NextResponse.json(await db.prospect.delete({ where: { id: b.id } }));
  const data: Record<string, any> = {};
  for (const f of ["name", "email", "company", "note", "hook"]) if (f in b) data[f] = String(b[f] ?? "").trim();
  if ("status" in b && STATUSES.includes(b.status)) {
    data.status = b.status;
    // A répondu / gagné / perdu : la séquence s'arrête, plus aucune relance
    if (["replied", "won", "lost"].includes(b.status)) data.nextAt = null;
  }
  // Repousser une relance de N jours, ou arrêter la séquence
  if (b.snooze) data.nextAt = new Date(Date.now() + Number(b.snooze) * 864e5);
  if (b.stop) data.nextAt = null;
  if (b.id) return NextResponse.json(await db.prospect.update({ where: { id: b.id }, data }));
  if (!data.name) return NextResponse.json({ error: "Nom manquant" }, { status: 400 });
  return NextResponse.json(await db.prospect.create({ data: { ...data, name: data.name } }));
}
