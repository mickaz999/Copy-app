import { db } from "@/lib/db";
import { Discount, InvoiceData, InvoiceKind, Line, Party, Prepaid, buildCii, totals } from "@/lib/cii";
import { invoicePdf } from "@/lib/invoicePdf";
import { validateInvoice } from "@/lib/superpdp";
import { sendGmail } from "@/lib/google";
import { mailAccount } from "@/lib/notify";
import { einvoiceMandatory } from "@/lib/einvoice";
import { docMailHtml } from "@/lib/mailTemplate";

export const invoiceSettings = () => db.invoiceSettings.upsert({ where: { id: 1 }, create: {}, update: {} });

const parse = <T,>(s: string, d: T): T => { try { return JSON.parse(s) as T; } catch { return d; } };
const day = (d: Date) => d.toISOString().slice(0, 10);

// Prochain numéro, sans trou, par année : F-2026-001, F-2026-002… ; avoirs : A-2026-001…
export async function nextNumber(date = new Date(), series: "F" | "A" = "F") {
  const prefix = `${series}-${date.getFullYear()}-`;
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
  // Avoir : facture d'origine
  const orig = inv.kind === "credit" && inv.refId ? await db.invoice.findUnique({ where: { id: inv.refId } }) : null;
  return {
    kind: (inv.kind as InvoiceKind) || "standard",
    credited: orig ? { number: orig.number, date: day(orig.date) } : undefined,
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

  const electronic = (inv.einvoice || einvoiceMandatory(d.date)) && isPro(d);
  if (electronic && !inv.einvoice) await db.invoice.update({ where: { id }, data: { einvoice: true } });
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
    try { mailed = await mailInvoice(d); }
    catch (e) {
      // La facture est déjà émise : on garde l'erreur de mail sans tout annuler
      await db.invoice.update({ where: { id }, data: { error: `Facture émise, mais mail non envoyé : ${(e as Error).message}` } });
    }
  }
  return { mailed, pro: electronic };
}

// Mail au client avec le PDF (à l'émission, ou renvoi d'une facture déjà émise)
async function mailInvoice(d: InvoiceData) {
  if (!d.buyer.email) throw new Error("Pas de mail pour ce client.");
  const acc = await mailAccount();
  if (!acc) throw new Error("Aucun compte Gmail connecté.");
  const pdf = await invoicePdf(d);
  const { due: ttc } = totals(d);
  const what = d.kind === "deposit" ? "la facture d'acompte" : d.kind === "final" ? "la facture de solde" : d.kind === "credit" ? "l'avoir" : "la facture";
  const title = d.kind === "deposit" ? "Facture d'acompte" : d.kind === "final" ? "Facture de solde" : d.kind === "credit" ? "Avoir" : "Facture";
  const amount = ttc.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
  const until = d.dueDate.split("-").reverse().join("/");
  const first = (d.buyer.name ?? "").trim().replace(/[<>&]/g, "");
  const credit = d.kind === "credit";
  const html = docMailHtml({
    logo: d.logo,
    eyebrow: `${title} ${d.number}`,
    title: credit ? "Voici ton avoir" : d.kind === "deposit" ? "C'est parti pour ton projet 🎬" : d.kind === "final" ? "Ton projet est bouclé, merci ! 🙌" : "Merci pour ta confiance 🙌",
    intro: [
      `Bonjour${first ? ` ${first}` : ""},`,
      credit
        ? `Tu trouveras ci-joint l'avoir <b>${d.number}</b>${d.credited ? `, qui annule la facture ${d.credited.number}` : ""}.`
        : d.kind === "deposit"
          ? `Merci d'avoir validé le devis ! Voici ${what} <b>${d.number}</b> : dès réception du règlement, ta date est bloquée et on lance la préparation.`
          : d.kind === "final"
            ? `On espère que le résultat te plaît autant qu'à nous. Voici ${what} <b>${d.number}</b> pour clôturer le projet.`
            : `Voici ${what} <b>${d.number}</b>. C'était un plaisir de bosser avec toi !`,
    ],
    amountLabel: credit ? "Montant de l'avoir" : "Montant à régler",
    amount,
    rows: credit ? [["Date", d.date.split("-").reverse().join("/")]] : [["À régler avant le", until], ...(d.iban ? ([["Virement (IBAN)", d.iban]] as [string, string][]) : [])],
    outro: [credit ? "Une question ? Réponds simplement à ce mail." : "Une question sur la facture ? Réponds simplement à ce mail, on te répond vite."],
    signature: "Coralie & Mickaël · Maderino Production",
  });
  await sendGmail(acc.id, d.buyer.email, `${title} ${d.number}`, html, false, "", [{ name: `${title} ${d.number}.pdf`, type: "application/pdf", data: pdf }]);
  return true;
}

export async function resendInvoice(id: string) {
  const inv = await db.invoice.findUniqueOrThrow({ where: { id } });
  if (inv.status === "draft") throw new Error("La facture n'est pas encore émise.");
  const d = await invoiceData(id);
  await mailInvoice(d);
  await db.invoice.update({ where: { id }, data: { error: "" } });
  return { mailed: true, to: d.buyer.email };
}
