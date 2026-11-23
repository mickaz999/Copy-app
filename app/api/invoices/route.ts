import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getConfig, invoiceUrl, itemsOf, newToken, nextNumber, totalOf } from "@/lib/invoices";

export const dynamic = "force-dynamic";

const dateOrNull = (v: unknown) => (v ? new Date(String(v)) : null);

export async function GET() {
  const [list, config] = await Promise.all([db.invoice.findMany({ orderBy: { createdAt: "desc" } }), getConfig()]);
  return NextResponse.json({ config, list: list.map((i) => ({ ...i, url: invoiceUrl(i), total: totalOf(itemsOf(i.items)) })) });
}

// { config } | nouvelle facture | { id, ...champs } | { id, delete } | { id, paid: true/false }
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  if (b.config) {
    const c = b.config;
    const data = {
      name: String(c.name ?? ""), address: String(c.address ?? ""), siret: String(c.siret ?? ""), email: String(c.email ?? ""),
      phone: String(c.phone ?? ""), iban: String(c.iban ?? ""), bic: String(c.bic ?? ""), mentions: String(c.mentions ?? ""), dueDays: Number(c.dueDays) || 0,
    };
    return NextResponse.json(await db.invoiceConfig.upsert({ where: { id: 1 }, create: data, update: data }));
  }

  const fields = (x: any) => {
    const out: Record<string, unknown> = {};
    for (const k of ["client", "email", "address", "siret", "notes"]) if (k in x) out[k] = String(x[k] ?? "");
    if ("date" in x) out.date = dateOrNull(x.date) ?? new Date();
    if ("dueDate" in x) out.dueDate = dateOrNull(x.dueDate);
    if ("items" in x) out.items = JSON.stringify(itemsOf(JSON.stringify(x.items ?? [])));
    return out;
  };

  if (!b.id) {
    if (!String(b.client ?? "").trim()) return NextResponse.json({ error: "Nom du client requis" }, { status: 400 });
    const cfg = await getConfig();
    const date = dateOrNull(b.date) ?? new Date();
    const due = b.dueDate ? new Date(b.dueDate) : new Date(date.getTime() + cfg.dueDays * 864e5);
    for (let t = 0; t < 3; t++) {
      try {
        return NextResponse.json(await db.invoice.create({ data: { ...fields(b), date, dueDate: due, client: String(b.client).trim(), number: await nextNumber(date), token: newToken() } as any }));
      } catch (e) { if (t === 2) throw e; } // numéro pris entre-temps : on réessaie
    }
  }

  const inv = await db.invoice.findUnique({ where: { id: String(b.id) } });
  if (!inv) return NextResponse.json({ error: "Facture introuvable" }, { status: 404 });

  if (b.delete) {
    if (inv.status !== "draft") return NextResponse.json({ error: "Une facture envoyée ne se supprime pas (obligation légale) : fais plutôt un avoir." }, { status: 400 });
    await db.invoice.delete({ where: { id: inv.id } });
    return NextResponse.json({ ok: true });
  }

  // Payée : la recette est ajoutée au livre des recettes (Compta), et retirée si on annule
  if ("paid" in b) {
    if (b.paid && inv.status !== "paid") {
      const tr = await db.transaction.create({
        data: { date: b.paidAt ? new Date(b.paidAt) : new Date(), label: `Facture ${inv.number}`, kind: "recette", amount: totalOf(itemsOf(inv.items)), client: inv.client, payment: String(b.payment || "Virement"), reference: inv.number },
      });
      return NextResponse.json(await db.invoice.update({ where: { id: inv.id }, data: { status: "paid", paidAt: tr.date, transactionId: tr.id } }));
    }
    if (!b.paid && inv.status === "paid") {
      if (inv.transactionId) await db.transaction.delete({ where: { id: inv.transactionId } }).catch(() => {});
      return NextResponse.json(await db.invoice.update({ where: { id: inv.id }, data: { status: inv.sentAt ? "sent" : "draft", paidAt: null, transactionId: "" } }));
    }
    return NextResponse.json(inv);
  }

  return NextResponse.json(await db.invoice.update({ where: { id: inv.id }, data: fields(b) }));
}
