import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Lance la connexion TikTok pour récupérer le jeton de l'agent de reporting (dépôt mickaz999/reporting)
export async function GET(req: Request) {
  const key = process.env.TIKTOK_CLIENT_KEY;
  if (!key) return new Response("TIKTOK_CLIENT_KEY manquant dans les variables Vercel", { status: 500 });
  const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
  url.search = new URLSearchParams({
    client_key: key,
    scope: "user.info.basic,user.info.stats,video.list",
    response_type: "code",
    redirect_uri: `${new URL(req.url).origin}/api/tiktok/callback`,
    state: Math.random().toString(36).slice(2),
  }).toString();
  return NextResponse.redirect(url);
}
