// Super PDP : plateforme agréée (PA) qui valide et transmet les factures électroniques.
// Doc : https://www.superpdp.tech/documentation — API en v1.beta, OAuth2 « client credentials ».
// Variables : SUPERPDP_CLIENT_ID, SUPERPDP_CLIENT_SECRET (application créée dans le compte Super PDP).

const ENDPOINT = process.env.SUPERPDP_ENDPOINT || "https://api.superpdp.tech";

export const superPdpConfigured = () => !!(process.env.SUPERPDP_CLIENT_ID && process.env.SUPERPDP_CLIENT_SECRET);

let cached: { token: string; until: number } | null = null;

async function token(): Promise<string> {
  if (cached && cached.until > Date.now()) return cached.token;
  const res = await fetch(`${ENDPOINT}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.SUPERPDP_CLIENT_ID ?? "",
      client_secret: process.env.SUPERPDP_CLIENT_SECRET ?? "",
    }).toString(),
  });
  if (!res.ok) throw new Error(`Super PDP : connexion refusée (${res.status})`);
  const b = await res.json();
  cached = { token: b.access_token, until: Date.now() + Math.max(60, (b.expires_in ?? 3600) - 60) * 1000 };
  return cached.token;
}

// Valide la facture avec les règles officielles (schematrons EN16931 + France). Pas besoin d'être connecté.
export async function validateInvoice(xml: string): Promise<{ valid: boolean; errors: string[] }> {
  const fd = new FormData();
  fd.append("file", new Blob([xml], { type: "application/xml" }), "facture.xml");
  const res = await fetch(`${ENDPOINT}/v1.beta/validation_reports`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(`Super PDP : validation impossible (${res.status})`);
  const b = await res.json();
  const r = b.data?.[0] ?? {};
  // Réponse : { is_valid, error?, subreports: [{ validator, failures: [{ rule?, message }] }] }
  const errors: string[] = (r.subreports ?? []).flatMap((s: any) => (s.failures ?? []).map((f: any) => String(f.message ?? "").trim()));
  if (!errors.length && r.error) errors.push(String(r.error));
  return { valid: !!r.is_valid, errors: Array.from(new Set(errors)).slice(0, 10) };
}

// Envoie la facture au destinataire via le réseau des plateformes agréées
export async function sendInvoice(xml: string): Promise<{ id: string }> {
  const res = await fetch(`${ENDPOINT}/v1.beta/invoices`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await token()}` },
    body: xml,
  });
  if (!res.ok) throw new Error(`Super PDP : envoi refusé (${res.status}) ${(await res.text()).slice(0, 300)}`);
  const b = await res.json();
  return { id: String(b.id) };
}
