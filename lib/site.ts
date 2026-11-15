// Adresse publique des liens envoyés aux clients (livraisons, RDV, dépôts)
export const PUBLIC_URL = "https://client.maderinoprod.com";

// Liens lisibles : /l/nom-du-client-<jeton> (le jeton = 16 derniers caractères, c'est lui qui compte)
export const slugify = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
export const tokenOf = (s: string) => { const t = decodeURIComponent(s); return t.length > 16 ? t.slice(-16) : t; };
const pretty = (x: { token: string; client?: string; title?: string }, fallback: string) => `${slugify(x.client?.trim() || x.title || "") || fallback}-${x.token}`;
// Anciens liens (jeton seul, sans nom) : bloqués
export const isLegacy = (s: string, len: number) => decodeURIComponent(s).length <= len;
export const deliveryUrl = (d: { token: string; client?: string; title?: string }) => `${PUBLIC_URL}/l/${pretty(d, "livraison")}`;
export const dropUrl = (d: { token: string; client?: string; title?: string }) => `${PUBLIC_URL}/d/${pretty(d, "depot")}`;
