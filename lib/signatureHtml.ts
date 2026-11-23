import { PUBLIC_URL } from "@/lib/site";

export type Signature = { name: string; title: string; phone: string; site: string; logo: string; clients: boolean };
export const DEFAULT_LOGO = `${PUBLIC_URL}/icons/icon-192.png`;

export function parseSignature(raw: string | null | undefined): Signature {
  let s: Partial<Signature> = {};
  try { s = JSON.parse(raw || "{}"); } catch {}
  return { name: s.name ?? "", title: s.title ?? "", phone: s.phone ?? "", site: s.site ?? "", logo: s.logo ?? DEFAULT_LOGO, clients: s.clients ?? true };
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Bloc HTML de signature (tableau : compatible Gmail, Outlook, Apple Mail)
export function signatureHtml(s: Signature) {
  if (!s.name.trim()) return "";
  const site = s.site.trim();
  const href = site ? (/^https?:\/\//.test(site) ? site : `https://${site}`) : "";
  const tel = s.phone.trim();
  return `<table cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;font-family:Arial,Helvetica,sans-serif;color:#1c1814">
  <tr>
    ${s.logo.trim() ? `<td style="padding-right:14px;vertical-align:middle"><img src="${esc(s.logo.trim())}" width="56" height="56" alt="" style="display:block;border-radius:12px"></td>` : ""}
    <td style="border-left:3px solid #ff6a00;padding-left:14px;vertical-align:middle;font-size:13px;line-height:1.5">
      <div style="font-size:15px;font-weight:bold">${esc(s.name.trim())}</div>
      ${s.title.trim() ? `<div style="color:#ff6a00;font-weight:bold">${esc(s.title.trim())}</div>` : ""}
      ${tel ? `<div><a href="tel:${esc(tel.replace(/[^+\d]/g, ""))}" style="color:#5c544c;text-decoration:none">${esc(tel)}</a></div>` : ""}
      ${href ? `<div><a href="${esc(href)}" style="color:#5c544c;text-decoration:none">${esc(site.replace(/^https?:\/\//, ""))}</a></div>` : ""}
    </td>
  </tr>
</table>`;
}

