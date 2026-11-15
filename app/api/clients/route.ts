import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientFor, emailsOf, nameKey } from "@/lib/clients";

export const dynamic = "force-dynamic";

// Base clients : fiches (créées depuis les livraisons et liens de dépôt), mails connus, livraisons
export async function GET() {
  const [deliveries, drops] = await Promise.all([
    db.delivery.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, title: true, client: true, createdAt: true, expiresAt: true, approvedV: true, approvedAt: true } }),
    db.dropLink.findMany({ select: { client: true } }),
  ]);
  for (const n of Array.from(new Set([...deliveries, ...drops].map((d) => d.client.trim()).filter(Boolean)))) await clientFor(n).catch(() => {});
  const clients = await db.client.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(clients.map((c) => ({ ...c, emails: emailsOf(c), deliveries: deliveries.filter((d) => nameKey(d.client) === c.nameKey) })));
}

// { name } : nouveau client | { id, emails, note } : mise à jour | { id, delete: true }
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  if (b.id && b.delete) { await db.client.delete({ where: { id: String(b.id) } }); return NextResponse.json({ ok: true }); }
  if (b.id) {
    const emails = Array.from(new Set((Array.isArray(b.emails) ? b.emails : []).map((e: unknown) => String(e).trim().toLowerCase()).filter((e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))));
    return NextResponse.json(await db.client.update({ where: { id: String(b.id) }, data: { emails: JSON.stringify(emails), note: String(b.note ?? "").slice(0, 2000) } }));
  }
  const c = await clientFor(String(b.name ?? "").slice(0, 200));
  if (!c) return NextResponse.json({ error: "Nom du client manquant." }, { status: 400 });
  return NextResponse.json(c);
}
