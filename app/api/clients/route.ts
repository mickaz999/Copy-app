import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { totals, type Discount, type Line } from "@/lib/cii";
import { invoiceSettings } from "@/lib/invoices";
import { billingOf, cleanBilling, clientFor, emailsOf, nameKey, notifyClient, spaceUrl } from "@/lib/clients";

export const dynamic = "force-dynamic";

// Base clients : fiches (créées depuis les livraisons et liens de dépôt), mails connus, livraisons
export async function GET() {
  const [deliveries, drops] = await Promise.all([
    db.delivery.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, title: true, client: true, createdAt: true, expiresAt: true, approvedV: true, approvedAt: true } }),
    db.dropLink.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, title: true, client: true, active: true, createdAt: true, expiresAt: true, _count: { select: { files: true } } } }),
  ]);
  // Devis et factures, rattachés au client par son nom
  const [invoices, quotes, s] = await Promise.all([
    db.invoice.findMany({ orderBy: { number: "desc" }, select: { id: true, number: true, date: true, client: true, buyer: true, lines: true, discount: true, kind: true, deposits: true, status: true } }),
    db.quote.findMany({ orderBy: { number: "desc" }, select: { id: true, number: true, date: true, buyer: true, lines: true, discount: true, status: true, invoiceId: true, signedName: true } }),
    invoiceSettings(),
  ]);
  const parse = <T,>(v: string, d: T): T => { try { return JSON.parse(v) as T; } catch { return d; } };
  const ttc = (x: { lines: string; discount: string }) => totals({ lines: parse<Line[]>(x.lines, []), vatRate: s.vatRate, discount: x.discount ? parse<Discount | undefined>(x.discount, undefined) : undefined }).ttc;
  const invTtc = new Map(invoices.map((i) => [i.id, ttc(i)]));
  // Montant réellement dû : solde = total moins acomptes déduits ; avoir = négatif
  const due = (i: (typeof invoices)[number]) => {
    const t = invTtc.get(i.id) ?? 0;
    if (i.kind === "credit") return -t;
    if (i.kind === "final") return t - parse<string[]>(i.deposits, []).reduce((n, id) => n + (invTtc.get(id) ?? 0), 0);
    return t;
  };
  const who = (x: { buyer: string; client?: string }) => nameKey(parse<{ name?: string }>(x.buyer, {}).name || x.client || "");
  // Pas de recréation automatique des fiches ici : une fiche supprimée doit le rester
  const clients = await db.client.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(clients.map((c) => ({ ...c, space: spaceUrl(c), emails: emailsOf(c), billing: billingOf(c),
    quotes: quotes.filter((q) => who(q) === c.nameKey).map((q) => ({ id: q.id, number: q.number, date: q.date, status: q.status, total: ttc(q), invoiceId: q.invoiceId, signed: !!q.signedName })),
    invoices: invoices.filter((i) => who(i) === c.nameKey).map((i) => ({ id: i.id, number: i.number, date: i.date, status: i.status, kind: i.kind, total: due(i) })), deliveries: deliveries.filter((d) => nameKey(d.client) === c.nameKey), drops: drops.filter((d) => nameKey(d.client) === c.nameKey).map((d) => ({ id: d.id, title: d.title, active: d.active, createdAt: d.createdAt, files: d._count.files })) })));
}

// { name } : nouveau client | { id, emails, note } : mise à jour | { id, delete: true }
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  // Prévenir le client par mail (nouvelle livraison / nouveau lien de dépôt)
  if (b.action === "notify") {
    try { return NextResponse.json({ sent: await notifyClient(b.kind === "drop" ? "drop" : "delivery", String(b.id)) }); }
    catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  }
  if (b.id && b.delete) { await db.client.delete({ where: { id: String(b.id) } }); return NextResponse.json({ ok: true }); }
  if (b.id) {
    const emails = Array.from(new Set((Array.isArray(b.emails) ? b.emails : []).map((e: unknown) => String(e).trim().toLowerCase()).filter((e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))));
    return NextResponse.json(await db.client.update({ where: { id: String(b.id) }, data: { emails: JSON.stringify(emails), note: String(b.note ?? "").slice(0, 2000), ...(b.billing ? { billing: JSON.stringify(cleanBilling(b.billing)) } : {}) } }));
  }
  const c = await clientFor(String(b.name ?? "").slice(0, 200));
  if (!c) return NextResponse.json({ error: "Nom du client manquant." }, { status: 400 });
  return NextResponse.json(c);
}
