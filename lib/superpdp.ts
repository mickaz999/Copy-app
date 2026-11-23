// Super PDP : plateforme agréée (PA). On n'utilise que son validateur, gratuit et sans compte.
// La transmission se fait en déposant le fichier sur l'espace en ligne Super PDP (gratuit jusqu'à 1 000 factures/mois).
// Doc : https://www.superpdp.tech/documentation

const ENDPOINT = "https://api.superpdp.tech";

// Valide la facture avec les règles officielles (XSD CII + EN16931 + règles France)
export async function validateInvoice(xml: string): Promise<{ valid: boolean; errors: string[] }> {
  const fd = new FormData();
  fd.append("file", new Blob([xml], { type: "application/xml" }), "facture.xml");
  const res = await fetch(`${ENDPOINT}/v1.beta/validation_reports`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(`Validateur indisponible (${res.status}), réessaie dans un instant.`);
  const b = await res.json();
  const r = b.data?.[0] ?? {};
  // Réponse : { is_valid, error?, subreports: [{ validator, failures: [{ rule?, message }] }] }
  const errors: string[] = (r.subreports ?? []).flatMap((s: any) => (s.failures ?? []).map((f: any) => String(f.message ?? "").trim()));
  if (!errors.length && r.error) errors.push(String(r.error));
  return { valid: !!r.is_valid, errors: Array.from(new Set(errors)).slice(0, 10) };
}
