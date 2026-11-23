// Facture électronique au format CII (UN/CEFACT Cross Industry Invoice), profil EN16931.
// C'est un des 3 formats officiels de la réforme (Factur-X / UBL / CII) : Super PDP le valide et le transmet.

export type Party = {
  name: string;
  siren: string; // 9 chiffres
  address: string;
  zip: string;
  city: string;
  country?: string; // code ISO, FR par défaut
  email?: string;
  vat?: string; // n° de TVA intracommunautaire (facultatif)
};

export type Line = { label: string; qty: number; unitPrice: number };

export type InvoiceData = {
  number: string;
  date: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  seller: Party;
  buyer: Party;
  lines: Line[];
  vatRate: number; // 0 = franchise en base de TVA (micro-entreprise)
  vatNote: string; // mention d'exonération, ex. « TVA non applicable, art. 293 B du CGI »
  iban?: string;
  note?: string;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const d8 = (iso: string) => iso.slice(0, 10).replace(/-/g, "");
const m = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

export function totals(inv: Pick<InvoiceData, "lines" | "vatRate">) {
  const ht = inv.lines.reduce((s, l) => s + Math.round(l.qty * l.unitPrice * 100) / 100, 0);
  const tva = Math.round(ht * inv.vatRate) / 100;
  return { ht, tva, ttc: ht + tva };
}

function party(tag: string, p: Party, fiscal: boolean) {
  return `<ram:${tag}>
      <ram:Name>${esc(p.name)}</ram:Name>
      <ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">${esc(p.siren)}</ram:ID></ram:SpecifiedLegalOrganization>
      <ram:PostalTradeAddress>
        <ram:PostcodeCode>${esc(p.zip)}</ram:PostcodeCode>
        <ram:LineOne>${esc(p.address)}</ram:LineOne>
        <ram:CityName>${esc(p.city)}</ram:CityName>
        <ram:CountryID>${esc(p.country || "FR")}</ram:CountryID>
      </ram:PostalTradeAddress>
      <ram:URIUniversalCommunication><ram:URIID schemeID="0225">${esc(p.siren)}</ram:URIID></ram:URIUniversalCommunication>${p.vat ? `
      <ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(p.vat)}</ram:ID></ram:SpecifiedTaxRegistration>` : fiscal ? `
      <ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">${esc(p.siren)}</ram:ID></ram:SpecifiedTaxRegistration>` : ""}
    </ram:${tag}>`;
}

export function buildCii(inv: InvoiceData): string {
  const { ht, tva, ttc } = totals(inv);
  const cat = inv.vatRate > 0 ? "S" : "E"; // E = exonéré (franchise en base)
  const exempt = cat === "E" ? `
      <ram:ExemptionReason>${esc(inv.vatNote)}</ram:ExemptionReason>` : "";
  const exemptCode = cat === "E" ? `
      <ram:ExemptionReasonCode>VATEX-FR-FRANCHISE</ram:ExemptionReasonCode>` : "";
  const lines = inv.lines.map((l, i) => `
  <ram:IncludedSupplyChainTradeLineItem>
    <ram:AssociatedDocumentLineDocument><ram:LineID>${i + 1}</ram:LineID></ram:AssociatedDocumentLineDocument>
    <ram:SpecifiedTradeProduct><ram:Name>${esc(l.label)}</ram:Name></ram:SpecifiedTradeProduct>
    <ram:SpecifiedLineTradeAgreement>
      <ram:NetPriceProductTradePrice><ram:ChargeAmount>${m(l.unitPrice)}</ram:ChargeAmount></ram:NetPriceProductTradePrice>
    </ram:SpecifiedLineTradeAgreement>
    <ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="C62">${l.qty}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>
    <ram:SpecifiedLineTradeSettlement>
      <ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>${cat}</ram:CategoryCode><ram:RateApplicablePercent>${m(inv.vatRate)}</ram:RateApplicablePercent></ram:ApplicableTradeTax>
      <ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${m(l.qty * l.unitPrice)}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>
    </ram:SpecifiedLineTradeSettlement>
  </ram:IncludedSupplyChainTradeLineItem>`).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
<rsm:ExchangedDocumentContext>
  <ram:BusinessProcessSpecifiedDocumentContextParameter><ram:ID>S1</ram:ID></ram:BusinessProcessSpecifiedDocumentContextParameter>
  <ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>urn:cen.eu:en16931:2017</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter>
</rsm:ExchangedDocumentContext>
<rsm:ExchangedDocument>
  <ram:ID>${esc(inv.number)}</ram:ID>
  <ram:TypeCode>380</ram:TypeCode>
  <ram:IssueDateTime><udt:DateTimeString format="102">${d8(inv.date)}</udt:DateTimeString></ram:IssueDateTime>${inv.note ? `
  <ram:IncludedNote><ram:Content>${esc(inv.note)}</ram:Content></ram:IncludedNote>` : ""}
  <ram:IncludedNote><ram:Content>Pénalités de retard : 3 fois le taux d'intérêt légal. Indemnité forfaitaire pour frais de recouvrement : 40 €.</ram:Content><ram:SubjectCode>PMT</ram:SubjectCode></ram:IncludedNote>
  <ram:IncludedNote><ram:Content>Pas d'escompte pour paiement anticipé.</ram:Content><ram:SubjectCode>AAB</ram:SubjectCode></ram:IncludedNote>
  <ram:IncludedNote><ram:Content>Indemnité forfaitaire pour frais de recouvrement en cas de retard de paiement : 40 €.</ram:Content><ram:SubjectCode>PMD</ram:SubjectCode></ram:IncludedNote>
</rsm:ExchangedDocument>
<rsm:SupplyChainTradeTransaction>${lines}
  <ram:ApplicableHeaderTradeAgreement>
    ${party("SellerTradeParty", inv.seller, inv.vatRate === 0)}
    ${party("BuyerTradeParty", inv.buyer, false)}
  </ram:ApplicableHeaderTradeAgreement>
  <ram:ApplicableHeaderTradeDelivery>
    <ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime><udt:DateTimeString format="102">${d8(inv.date)}</udt:DateTimeString></ram:OccurrenceDateTime></ram:ActualDeliverySupplyChainEvent>
  </ram:ApplicableHeaderTradeDelivery>
  <ram:ApplicableHeaderTradeSettlement>
    <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>${inv.iban ? `
    <ram:SpecifiedTradeSettlementPaymentMeans>
      <ram:TypeCode>58</ram:TypeCode>
      <ram:PayeePartyCreditorFinancialAccount><ram:IBANID>${esc(inv.iban.replace(/\s/g, ""))}</ram:IBANID></ram:PayeePartyCreditorFinancialAccount>
    </ram:SpecifiedTradeSettlementPaymentMeans>` : ""}
    <ram:ApplicableTradeTax>
      <ram:CalculatedAmount>${m(tva)}</ram:CalculatedAmount>
      <ram:TypeCode>VAT</ram:TypeCode>${exempt}
      <ram:BasisAmount>${m(ht)}</ram:BasisAmount>
      <ram:CategoryCode>${cat}</ram:CategoryCode>${exemptCode}
      <ram:RateApplicablePercent>${m(inv.vatRate)}</ram:RateApplicablePercent>
    </ram:ApplicableTradeTax>
    <ram:SpecifiedTradePaymentTerms><ram:DueDateDateTime><udt:DateTimeString format="102">${d8(inv.dueDate)}</udt:DateTimeString></ram:DueDateDateTime></ram:SpecifiedTradePaymentTerms>
    <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
      <ram:LineTotalAmount>${m(ht)}</ram:LineTotalAmount>
      <ram:TaxBasisTotalAmount>${m(ht)}</ram:TaxBasisTotalAmount>
      <ram:TaxTotalAmount currencyID="EUR">${m(tva)}</ram:TaxTotalAmount>
      <ram:GrandTotalAmount>${m(ttc)}</ram:GrandTotalAmount>
      <ram:DuePayableAmount>${m(ttc)}</ram:DuePayableAmount>
    </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
  </ram:ApplicableHeaderTradeSettlement>
</rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
`;
}
