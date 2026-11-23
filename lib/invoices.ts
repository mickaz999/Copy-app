import { db } from "@/lib/db";
import { Discount, InvoiceData, InvoiceKind, Line, Party, Prepaid, buildCii, totals } from "@/lib/cii";
import { invoicePdf } from "@/lib/invoicePdf";
import { validateInvoice } from "@/lib/superpdp";
import { sendGmail } from "@/lib/google";
import { mailAccount } from "@/lib/notify";

export const invoiceSettings = () => db.invoiceSettings.upsert({ where: { id: 1 }, create: {}, update: {} });

const parse = <T,>(s: string, d: T): T => { try { return JSON.parse(s) as T; } catch { return d; } };
const day = (d: Date) => d.toISOString().slice(0, 10);

// Prochain numéro, sans trou, par année : F-2026-001, F-2026-002…
export async function nextNumber(date = new Date()) {
  const prefix = `F-${date.getFullYear()}-`;
  const last = await db.invoice.findFirst({ where: { number: { startsWith: prefix } }, orderBy: { number: "desc" } });
  const n = last ? Number(last.number.slice(prefix.length)) + 1 : 1;
  return prefix + String(n).padStart(3, "0");
}

export async function invoiceData(id: string): Promise<InvoiceData> {
  const [inv, s] = await Promise.all([db.invoice.findUniqueOrThrow({ where: { id } }), invoiceSettings()]);
  // Facture de solde : montant TTC de chaque facture d'acompte déduite
  const depIds = inv.kind === "final" ? parse<string[]>(inv.deposits, []) : [];
  const deps = depIds.length ? await db.invoice.findMany({ where: { id: { in: depIds }, kind: "deposit" }, orderBy: { number: "asc" } }) : [];
  const prepaid: Prepaid[] = deps.map((x) => ({
    number: x.number,
    date: day(x.date),
    amount: totals({ lines: parse<Line[]>(x.lines, []), vatRate: s.vatRate, discount: x.discount ? parse<Discount | undefined>(x.discount, undefined) : undefined }).ttc,
  }));
  return {
    kind: (inv.kind as InvoiceKind) || "standard",
    prepaid,
    number: inv.number,
    date: day(inv.date),
    dueDate: day(inv.dueDate),
    seller: { name: s.name, siren: s.siren, address: s.address, zip: s.zip, city: s.city, email: s.email, vat: s.vat },
    buyer: parse<Party>(inv.buyer, {} as Party),
    lines: parse<Line[]>(inv.lines, []),
    vatRate: s.vatRate,
    vatNote: s.vatNote,
    iban: s.iban,
    note: inv.note,
    discount: inv.discount ? parse<Discount | undefined>(inv.discount, undefined) : undefined,
    logo: s.logo,
  };
}

// Ce qui manque pour pouvoir émettre (messages clairs, avant même d'appeler la plateforme)
export function missing(d: InvoiceData): string[] {
  const out: string[] = [];
  const siren = (v: string) => /^\d{9}$/.test((v ?? "").replace(/\s/g, ""));
  if (!d.seller.name || !d.seller.address || !d.seller.zip || !d.seller.city) out.push("Tes infos d'émetteur sont incomplètes (Réglages factures).");
  if (!siren(d.seller.siren)) out.push("Ton SIREN (9 chiffres) manque dans les réglages.");
  if (!d.buyer.name || !d.buyer.address || !d.buyer.zip || !d.buyer.city) out.push("L'adresse du client est incomplète.");
  // SIREN vide = client particulier (pas de fichier officiel à déposer) ; rempli = entreprise
  if (d.buyer.siren && !siren(d.buyer.siren)) out.push("Le SIREN du client doit faire 9 chiffres (laisse vide pour un particulier).");
  if (!d.lines.length || d.lines.some((l) => !l.label || !(l.qty > 0))) out.push("Ajoute au moins une ligne avec un libellé et une quantité.");
  return out;
}

export const isPro = (d: InvoiceData) => !!(d.buyer.siren ?? "").trim();

// Fichier officiel (CII) à déposer sur l'espace Super PDP — entreprises seulement
export async function xmlFor(id: string) {
  const d = await invoiceData(id);
  if (!isPro(d)) throw new Error("Client particulier : pas de fichier officiel, le PDF suffit.");
  d.seller.siren = d.seller.siren.replace(/\s/g, "");
  d.buyer.siren = d.buyer.siren.replace(/\s/g, "");
  return { data: d, xml: buildCii(d) };
}

export async function pdfFor(id: string) {
  const d = await invoiceData(id);
  return { data: d, pdf: await invoicePdf(d) };
}

// Émet la facture : validation officielle (entreprise) → PDF envoyé par mail au client.
// Le fichier officiel se dépose ensuite à la main sur l'espace Super PDP (gratuit).
export async function emitInvoice(id: string, opts: { email: boolean }) {
  const inv = await db.invoice.findUniqueOrThrow({ where: { id } });
  if (inv.status !== "draft") throw new Error("Cette facture a déjà été émise.");
  const d = await invoiceData(id);
  const miss = missing(d);
  if (miss.length) throw new Error(miss.join(" "));
  d.seller.siren = d.seller.siren.replace(/\s/g, "");
  d.buyer.siren = (d.buyer.siren ?? "").replace(/\s/g, "");

  const electronic = (await invoiceSettings()).einvoice && isPro(d);
  if (electronic) {
    const check = await validateInvoice(buildCii(d));
    if (!check.valid) {
      const msg = `Facture refusée par le validateur : ${check.errors.join(" · ") || "voir le détail sur superpdp.tech"}`;
      await db.invoice.update({ where: { id }, data: { error: msg } });
      throw new Error(msg);
    }
  }
  await db.invoice.update({ where: { id }, data: { status: "sent", sentAt: new Date(), error: "" } });

  let mailed = false;
  if (opts.email && d.buyer.email) {
    const acc = await mailAccount();
    if (acc) {
      const pdf = await invoicePdf(d);
      const { due: ttc } = totals(d);
      const what = d.kind === "deposit" ? "la facture d'acompte" : d.kind === "final" ? "la facture de solde" : "la facture";
      const title = d.kind === "deposit" ? "Facture d'acompte" : d.kind === "final" ? "Facture de solde" : "Facture";
      const amount = ttc.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
      const html = `<p>Bonjour,</p><p>Tu trouveras ci-joint ${what} <b>${d.number}</b> d'un montant de <b>${amount}</b>, à régler avant le ${d.dueDate.split("-").reverse().join("/")}.</p>${d.iban ? `<p>IBAN : ${d.iban}</p>` : ""}<p>Merci !</p>`;
      try {
        await sendGmail(acc.id, d.buyer.email, `${title} ${d.number}`, html, false, "", [{ name: `${title} ${d.number}.pdf`, type: "application/pdf", data: pdf }]);
        mailed = true;
      } catch (e) {
        // La facture est déjà transmise : on garde l'erreur de mail sans tout annuler
        await db.invoice.update({ where: { id }, data: { error: `Facture transmise, mais mail non envoyé : ${(e as Error).message}` } });
      }
    }
  }
  return { mailed, pro: electronic };
}
