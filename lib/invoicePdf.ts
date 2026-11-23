import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { type InvoiceData, totals } from "@/lib/cii";

// PDF lisible de la facture (copie envoyée par mail au client). La version officielle est le XML transmis par Super PDP.
const eur = (n: number) => n.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " €";
const fr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
// Les polices standard du PDF ne connaissent que le WinAnsi : on remplace ce qu'elles ne savent pas écrire
const safe = (s: string) => s.replace(/[’‘]/g, "'").replace(/[“”«»]/g, '"').replace(/[–—]/g, "-").replace(/ | /g, " ").replace(/[^\x20-\x7E\xA0-\xFF€]/g, "");

export async function invoicePdf(inv: InvoiceData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Facture ${inv.number}`);
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const grey = rgb(0.4, 0.4, 0.4);
  const t = (s: string, x: number, y: number, o: { size?: number; b?: boolean; color?: any; right?: boolean } = {}) => {
    const f = o.b ? bold : font, size = o.size ?? 10, txt = safe(s);
    page.drawText(txt, { x: o.right ? x - f.widthOfTextAtSize(txt, size) : x, y, size, font: f, color: o.color ?? rgb(0, 0, 0) });
  };

  t("FACTURE", 50, 780, { size: 22, b: true });
  t(`N° ${inv.number}`, 50, 758, { size: 11 });
  t(`Date : ${fr(inv.date)}`, 545, 780, { right: true });
  t(`Échéance : ${fr(inv.dueDate)}`, 545, 765, { right: true });

  const block = (title: string, p: InvoiceData["seller"], x: number) => {
    let y = 710;
    t(title, x, y, { size: 8, color: grey }); y -= 15;
    t(p.name, x, y, { b: true }); y -= 13;
    for (const l of [p.address, `${p.zip} ${p.city}`, `SIREN ${p.siren}`, p.vat ? `TVA ${p.vat}` : "", p.email ?? ""].filter(Boolean)) { t(l, x, y); y -= 13; }
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
  const { ht, tva, ttc } = totals(inv);
  y -= 10;
  t("Total HT", 460, y, { right: true }); t(eur(ht), 540, y, { right: true }); y -= 15;
  t(`TVA (${inv.vatRate} %)`, 460, y, { right: true }); t(eur(tva), 540, y, { right: true }); y -= 18;
  t("Total TTC", 460, y, { right: true, b: true, size: 12 }); t(eur(ttc), 540, y, { right: true, b: true, size: 12 });
  y -= 30;
  if (inv.vatRate === 0) { t(inv.vatNote, 50, y, { color: grey }); y -= 15; }
  if (inv.note) { t(inv.note.slice(0, 100), 50, y); y -= 15; }

  let fy = 120;
  if (inv.iban) { t(`Paiement par virement - IBAN : ${inv.iban}`, 50, fy, { b: true }); fy -= 15; }
  for (const l of [
    `Paiement au plus tard le ${fr(inv.dueDate)}. Pas d'escompte pour paiement anticipé.`,
    "Pénalités de retard : 3 fois le taux d'intérêt légal. Indemnité forfaitaire pour frais de recouvrement : 40 €.",
  ]) { t(l, 50, fy, { size: 8, color: grey }); fy -= 12; }

  return doc.save();
}
