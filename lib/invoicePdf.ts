import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { type InvoiceData, totals } from "@/lib/cii";

// PDF lisible de la facture (copie envoyée par mail au client). La version officielle est le XML transmis par Super PDP.
const eur = (n: number) => n.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " €";
const fr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
// Les polices standard du PDF ne connaissent que le WinAnsi : on remplace ce qu'elles ne savent pas écrire
const safe = (s: string) => s.replace(/[’‘]/g, "'").replace(/[“”«»]/g, '"').replace(/[–—]/g, "-").replace(/ | /g, " ").replace(/[^\x20-\x7E\xA0-\xFF€]/g, "");

export async function invoicePdf(inv: InvoiceData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${inv.quote ? "Devis" : "Facture"} ${inv.number}`);
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const grey = rgb(0.4, 0.4, 0.4);
  const t = (s: string, x: number, y: number, o: { size?: number; b?: boolean; color?: any; right?: boolean } = {}) => {
    const f = o.b ? bold : font, size = o.size ?? 10, txt = safe(s);
    page.drawText(txt, { x: o.right ? x - f.widthOfTextAtSize(txt, size) : x, y, size, font: f, color: o.color ?? rgb(0, 0, 0) });
  };

  // Logo en haut à droite (PNG ou JPG) ; s'il ne se charge pas, la facture part quand même
  let top = 780;
  const img = inv.logo ? await loadImage(doc, inv.logo) : null;
  if (img) {
    const k = Math.min(180 / img.width, 45 / img.height);
    page.drawImage(img, { x: 545 - img.width * k, y: 800 - img.height * k, width: img.width * k, height: img.height * k });
    top = Math.min(780, 800 - img.height * k - 18);
  }
  t(inv.quote ? "DEVIS" : inv.kind === "deposit" ? "FACTURE D'ACOMPTE" : inv.kind === "final" ? "FACTURE DE SOLDE" : inv.kind === "credit" ? "AVOIR" : "FACTURE", 50, 780, { size: inv.kind && inv.kind !== "standard" ? 18 : 22, b: true });
  t(`N° ${inv.number}`, 50, 758, { size: 11 });
  t(`Date : ${fr(inv.date)}`, 545, top, { right: true });
  if (inv.quote) t(`Valable jusqu'au ${fr(inv.dueDate)}`, 545, top - 15, { right: true });
  else if (inv.kind !== "credit") t(`Échéance : ${fr(inv.dueDate)}`, 545, top - 15, { right: true });
  else if (inv.credited) t(`Sur la facture ${inv.credited.number} du ${fr(inv.credited.date)}`, 545, top - 15, { right: true });

  const block = (title: string, p: InvoiceData["seller"], x: number) => {
    let y = 710;
    t(title, x, y, { size: 8, color: grey }); y -= 15;
    t(p.name, x, y, { b: true }); y -= 13;
    for (const l of [p.address, `${p.zip} ${p.city}`, `SIREN ${p.siren}`, p.vat ? `TVA ${p.vat}` : "", p.email ?? "", p.phone ? `Tél. ${p.phone}` : ""].filter(Boolean)) { t(l, x, y); y -= 13; }
  };
  block("ÉMETTEUR", inv.seller, 50);
  block("CLIENT", inv.buyer, 320);

  let y = 580;
  page.drawRectangle({ x: 50, y: y - 6, width: 495, height: 20, color: rgb(0.94, 0.94, 0.94) });
  t("Désignation", 56, y, { b: true }); t("Qté", 370, y, { b: true, right: true }); t("Prix unit. HT", 460, y, { b: true, right: true }); t("Total HT", 540, y, { b: true, right: true });
  y -= 22;
  for (const l of inv.lines) {
    t(l.label.slice(0, 60), 56, y); t(String(l.qty), 370, y, { right: true }); t(eur(l.unitPrice), 460, y, { right: true }); t(eur(l.qty * l.unitPrice), 540, y, { right: true });
    y -= 18;
  }
  const { gross, remise, ht, tva, ttc, prepaid, due } = totals(inv);
  y -= 10;
  if (remise > 0) {
    const d = inv.discount!;
    t("Sous-total HT", 460, y, { right: true }); t(eur(gross), 540, y, { right: true }); y -= 15;
    t(`${d.label || "Remise"}${d.type === "pct" ? ` (${String(d.value).replace(".", ",")} %)` : ""}`, 460, y, { right: true, color: rgb(0.85, 0.35, 0.05) }); t(`- ${eur(remise)}`, 540, y, { right: true, color: rgb(0.85, 0.35, 0.05) }); y -= 15;
  }
  t("Total HT", 460, y, { right: true }); t(eur(ht), 540, y, { right: true }); y -= 15;
  t(`TVA (${inv.vatRate} %)`, 460, y, { right: true }); t(eur(tva), 540, y, { right: true }); y -= 18;
  if (prepaid > 0) {
    // Facture de solde : acomptes déjà facturés, puis le reste à payer
    t("Total TTC", 460, y, { right: true }); t(eur(ttc), 540, y, { right: true }); y -= 15;
    for (const p of inv.prepaid ?? []) { t(`Acompte ${p.number} du ${fr(p.date)}`, 460, y, { right: true, color: grey }); t(`- ${eur(p.amount)}`, 540, y, { right: true, color: grey }); y -= 15; }
    y -= 3;
    t("Reste à payer", 460, y, { right: true, b: true, size: 12 }); t(eur(due), 540, y, { right: true, b: true, size: 12 });
  } else {
    t(inv.kind === "deposit" ? "Acompte à payer" : inv.kind === "credit" ? "Total de l'avoir" : "Total TTC", 460, y, { right: true, b: true, size: 12 }); t(eur(ttc), 540, y, { right: true, b: true, size: 12 });
  }
  y -= 30;
  if (inv.vatRate === 0) { t(inv.vatNote, 50, y, { color: grey }); y -= 15; }
  if (inv.note) { t(inv.note.slice(0, 100), 50, y); y -= 15; }

  let fy = 120;
  if (inv.quote) {
    // Bon pour accord : le client signe et renvoie le devis
    page.drawRectangle({ x: 320, y: 60, width: 225, height: 80, borderColor: grey, borderWidth: 0.7 });
    t("Bon pour accord", 328, 126, { b: true });
    t("Date, signature et mention « Bon pour accord »", 328, 112, { size: 8, color: grey });
    t(`Devis valable jusqu'au ${fr(inv.dueDate)}.`, 50, fy, { size: 9, color: grey }); fy -= 13;
    const pct = inv.depositPct ?? 0;
    if (pct > 0) {
      t(`Devis validé à réception de l'acompte de ${pct} % (${eur((totals(inv).ttc * pct) / 100)}), solde à la livraison.`, 50, fy, { size: 9, b: true }); fy -= 13;
      t("Une facture d'acompte puis une facture de solde seront émises.", 50, fy, { size: 9, color: grey });
    } else t("Une facture sera émise après acceptation du devis.", 50, fy, { size: 9, color: grey });
    return doc.save();
  }
  if (inv.kind === "credit") {
    t(inv.credited ? `Cet avoir annule ou corrige la facture ${inv.credited.number} du ${fr(inv.credited.date)}.` : "Avoir.", 50, fy, { b: true });
    return doc.save();
  }
  if (inv.iban) { t(`Paiement par virement - IBAN : ${inv.iban}`, 50, fy, { b: true }); fy -= 15; }
  for (const l of [
    `Paiement au plus tard le ${fr(inv.dueDate)}. Pas d'escompte pour paiement anticipé.`,
    "Pénalités de retard : 3 fois le taux d'intérêt légal. Indemnité forfaitaire pour frais de recouvrement : 40 €.",
  ]) { t(l, 50, fy, { size: 8, color: grey }); fy -= 12; }

  return doc.save();
}

async function loadImage(doc: PDFDocument, url: string) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const b = new Uint8Array(await res.arrayBuffer());
    if (b[0] === 0x89 && b[1] === 0x50) return await doc.embedPng(b);
    if (b[0] === 0xff && b[1] === 0xd8) return await doc.embedJpg(b);
  } catch {}
  return null;
}
