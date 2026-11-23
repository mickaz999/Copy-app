// Mail client soigné pour les devis et factures (HTML en tableaux, compatible Gmail, Outlook et Apple Mail)
const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export type DocMail = {
  logo?: string;
  eyebrow: string; // ex. « Devis D-2026-001 »
  title: string; // grande phrase d'accroche
  intro: string[]; // paragraphes (HTML autorisé, déjà échappé par l'appelant)
  amountLabel: string;
  amount: string;
  rows: [string, string][]; // détails sous le montant
  steps?: { title: string; items: string[] }; // encadré « et maintenant ? »
  outro: string[];
  signature: string;
};

export function docMailHtml(m: DocMail) {
  const orange = "#FF6B2B";
  const rows = m.rows
    .map(([k, v]) => `<tr><td style="padding:6px 0;color:#8a8a93;font-size:14px">${esc(k)}</td><td align="right" style="padding:6px 0;color:#1b1b1f;font-size:14px;font-weight:600">${esc(v)}</td></tr>`)
    .join("");
  const steps = m.steps
    ? `<tr><td style="padding:8px 32px 4px">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF4EE;border-radius:14px">
          <tr><td style="padding:18px 20px">
            <div style="font-size:13px;font-weight:700;color:${orange};text-transform:uppercase;letter-spacing:1.5px;margin-bottom:10px">${esc(m.steps.title)}</div>
            ${m.steps.items.map((s, i) => `<div style="font-size:14px;color:#3a3a40;line-height:1.5;margin:6px 0"><span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;border-radius:50%;background:${orange};color:#fff;font-size:12px;font-weight:700;margin-right:8px">${i + 1}</span>${s}</div>`).join("")}
          </td></tr>
        </table>
      </td></tr>`
    : "";
  return `<!doctype html><html><body style="margin:0;padding:0;background:#F4F1EC">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F1EC;padding:28px 12px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.06)">
        <tr><td style="height:6px;background:${orange}"></td></tr>
        <tr><td style="padding:28px 32px 8px">
          ${m.logo ? `<img src="${esc(m.logo)}" alt="Maderino Production" height="34" style="display:block;height:34px;margin-bottom:22px">` : ""}
          <div style="font-size:12px;font-weight:700;color:${orange};text-transform:uppercase;letter-spacing:2px">${esc(m.eyebrow)}</div>
          <h1 style="margin:8px 0 16px;font-size:24px;line-height:1.25;color:#1b1b1f">${esc(m.title)}</h1>
          ${m.intro.map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#3a3a40">${p}</p>`).join("")}
        </td></tr>
        <tr><td style="padding:8px 32px 16px">
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #EEE9E2;border-radius:14px">
            <tr><td style="padding:18px 20px 6px">
              <div style="font-size:13px;color:#8a8a93">${esc(m.amountLabel)}</div>
              <div style="font-size:32px;font-weight:800;color:#1b1b1f;letter-spacing:-.5px">${esc(m.amount)}</div>
            </td></tr>
            <tr><td style="padding:4px 20px 14px"><table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #EEE9E2">${rows}</table></td></tr>
          </table>
        </td></tr>
        ${steps}
        <tr><td style="padding:16px 32px 28px">
          ${m.outro.map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#3a3a40">${p}</p>`).join("")}
          <p style="margin:18px 0 0;font-size:15px;color:#1b1b1f">À très vite,<br><b>${esc(m.signature)}</b></p>
        </td></tr>
        <tr><td style="padding:14px 32px;background:#FAF8F5;font-size:12px;color:#9a9aa2;text-align:center">📎 Le document est en pièce jointe (PDF) · Une question ? Réponds simplement à ce mail.</td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}
