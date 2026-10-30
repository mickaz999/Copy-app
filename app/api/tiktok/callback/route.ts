export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const page = (body: string) =>
  new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font-family:Inter,Arial,sans-serif;max-width:640px;margin:40px auto;padding:0 16px">${body}</body>`, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });

// Retour de TikTok : échange le code contre un jeton et l'affiche pour le copier dans GitHub
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) return page(`<h2>Connexion refusée</h2><p>${esc(url.searchParams.get("error_description") ?? url.searchParams.get("error") ?? "Pas de code reçu")}</p>`);

  const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY ?? "",
      client_secret: process.env.TIKTOK_CLIENT_SECRET ?? "",
      code,
      grant_type: "authorization_code",
      redirect_uri: `${url.origin}/api/tiktok/callback`,
    }),
  });
  const data = await res.json();
  if (!data.refresh_token) return page(`<h2>Erreur TikTok</h2><pre style="white-space:pre-wrap">${esc(JSON.stringify(data, null, 2))}</pre>`);

  return page(`<h2>✅ TikTok connecté</h2>
<p>Copie ce jeton dans GitHub (dépôt <b>reporting</b> → Settings → Secrets → Actions) sous le nom <code>TIKTOK_REFRESH_TOKEN</code>. Il est valable 1 an.</p>
<textarea readonly onclick="this.select()" style="width:100%;height:120px;font-family:monospace">${esc(data.refresh_token)}</textarea>
<p style="color:#8a8079">Ne le partage avec personne. Tu peux fermer cette page une fois copié.</p>`);
}
