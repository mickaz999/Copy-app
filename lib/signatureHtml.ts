import { PUBLIC_URL } from "@/lib/site";

export type Signature = { name: string; title: string; phone: string; site: string; logo: string; clients: boolean; wordmark: boolean };
export const DEFAULT_LOGO = `${PUBLIC_URL}/icons/icon-192.png`;
export const WORDMARK = `${PUBLIC_URL}/icons/logo-mail.png`; // logo « maderino production. » avec le texte

export function parseSignature(raw: string | null | undefined): Signature {
  let s: Partial<Signature> = {};
  try { s = JSON.parse(raw || "{}"); } catch {}
  return { name: s.name ?? "", title: s.title ?? "", phone: s.phone ?? "", site: s.site ?? "", logo: s.logo ?? DEFAULT_LOGO, clients: s.clients ?? true, wordmark: s.wordmark ?? true };
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Numéro pour un lien WhatsApp (wa.me) : chiffres seuls, 06… → 336…
const waNumber = (t: string) => {
  const d = t.replace(/\D/g, "");
  return t.trim().startsWith("+") || d.startsWith("00") ? d.replace(/^00/, "") : d.replace(/^0/, "33");
};

// Bloc HTML de signature (tableau : compatible Gmail, Outlook, Apple Mail)
export function signatureHtml(s: Signature) {
  if (!s.name.trim()) return "";
  const site = s.site.trim();
  const href = site ? (/^https?:\/\//.test(site) ? site : `https://${site}`) : "";
  const tel = s.phone.trim();
  return `<table cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;font-family:Arial,Helvetica,sans-serif;color:#1c1814">
  <tr>
    <td style="border-left:3px solid #ff6a00;padding-left:14px;vertical-align:middle;font-size:13px;line-height:1.5">
      <div style="font-size:15px;font-weight:bold">${esc(s.name.trim())}</div>
      ${s.title.trim() ? `<div style="color:#ff6a00;font-weight:bold">${esc(s.title.trim())}</div>` : ""}
      ${tel ? `<div><a href="https://wa.me/${waNumber(tel)}" style="color:#5c544c;text-decoration:none">${esc(tel)}</a></div>` : ""}
      ${href ? `<div><a href="${esc(href)}" style="color:#5c544c;text-decoration:none">${esc(site.replace(/^https?:\/\//, ""))}</a></div>` : ""}
    </td>
  </tr>
  ${s.wordmark ? `<tr><td style="padding-top:12px">${href ? `<a href="${esc(href)}">` : ""}<img src="${WORDMARK}" width="220" height="41" alt="maderino production." style="display:block;border:0">${href ? "</a>" : ""}</td></tr>` : ""}
</table>`;
}

