import { db } from "@/lib/db";
import { Discount, InvoiceData, Line, Party, totals } from "@/lib/cii";
import { invoicePdf } from "@/lib/invoicePdf";
import { sendGmail } from "@/lib/google";
import { mailAccount } from "@/lib/notify";
import { invoiceSettings, nextNumber } from "@/lib/invoices";

const parse = <T,>(s: string, d: T): T => { try { return JSON.parse(s) as T; } catch { return d; } };
const day = (d: Date) => d.toISOString().slice(0, 10);

// Numéro de devis par année : D-2026-001…
export async function nextQuoteNumber(date = new Date()) {
  const prefix = `D-${date.getFullYear()}-`;
  const last = await db.quote.findFirst({ where: { number: { startsWith: prefix } }, orderBy: { number: "desc" } });
  return prefix + String(last ? Number(last.number.slice(prefix.length)) + 1 : 1).padStart(3, "0");
}

export async function quoteData(id: string): Promise<InvoiceData> {
  const [q, s] = await Promise.all([db.quote.findUniqueOrThrow({ where: { id } }), invoiceSettings()]);
  return {
    quote: true,
    number: q.number,
    date: day(q.date),
    dueDate: day(q.validUntil),
    seller: { name: s.name, siren: s.siren, address: s.address, zip: s.zip, city: s.city, email: s.email, vat: s.vat },
    buyer: parse<Party>(q.buyer, {} as Party),
    lines: parse<Line[]>(q.lines, []),
    vatRate: s.vatRate,
    vatNote: s.vatNote,
    note: q.note,
    discount: q.discount ? parse<Discount | undefined>(q.discount, undefined) : undefined,
    logo: s.logo,
  };
}

export async function quotePdf(id: string) {
  const d = await quoteData(id);
  return { data: d, pdf: await invoicePdf(d) };
}

// Envoie le devis au client (PDF par mail) et le passe en « envoyé »
export async function sendQuote(id: string, opts: { email: boolean }) {
  const q = await db.quote.findUniqueOrThrow({ where: { id } });
  if (q.status === "accepted") throw new Error("Ce devis est déjà validé.");
  const d = await quoteData(id);
  if (!d.lines.length || d.lines.some((l) => !l.label || !(l.qty > 0))) throw new Error("Ajoute au moins une prestation.");
  if (!d.buyer.name) throw new Error("Indique le nom du client.");
  let mailed = false;
  if (opts.email && d.buyer.email) {
    const acc = await mailAccount();
    if (!acc) throw new Error("Aucun compte Gmail connecté pour envoyer le devis.");
    const amount = totals(d).ttc.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
    const html = `<p>Bonjour,</p><p>Tu trouveras ci-joint le devis <b>${d.number}</b> d'un montant de <b>${amount}</b>, valable jusqu'au ${d.dueDate.split("-").reverse().join("/")}.</p><p>Pour le valider, renvoie-le-moi signé avec la mention « Bon pour accord ».</p><p>${d.seller.name}</p>`;
    await sendGmail(acc.id, d.buyer.email, `Devis ${d.number}`, html, false, "", [{ name: `Devis ${d.number}.pdf`, type: "application/pdf", data: await invoicePdf(d) }]);
    mailed = true;
  }
  await db.quote.update({ where: { id }, data: { status: "sent", sentAt: q.sentAt ?? new Date(), error: "" } });
  return { mailed };
}

// Devis validé (signé ou non) → facture brouillon avec les mêmes lignes
export async function acceptQuote(id: string, file?: { name: string; type: string; data: Buffer }) {
  const q = await db.quote.findUniqueOrThrow({ where: { id } });
  if (q.status === "accepted" && q.invoiceId) return { invoiceId: q.invoiceId };
  const s = await invoiceSettings();
  const date = new Date();
  const inv = await db.invoice.create({
    data: {
      number: await nextNumber(date, "F"),
      date,
      dueDate: new Date(date.getTime() + s.dueDays * 864e5),
      client: parse<Party>(q.buyer, {} as Party).name ?? "",
      buyer: q.buyer,
      lines: q.lines,
      discount: q.discount,
      note: q.note || `Selon devis ${q.number}`,
    },
  });
  await db.quote.update({
    where: { id },
    data: { status: "accepted", acceptedAt: date, invoiceId: inv.id, ...(file ? { signed: new Uint8Array(file.data), signedName: file.name, signedType: file.type } : {}) },
  });
  return { invoiceId: inv.id };
}
