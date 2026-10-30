import { NextResponse } from "next/server";
import { PROVIDERS, Provider, callbackUrl } from "@/lib/social";

export const dynamic = "force-dynamic";

// Connecte un compte (youtube, twitch) pour les stats avancées du rapport hebdo
export async function GET(req: Request, { params }: { params: { provider: string } }) {
  const p = params.provider as Provider;
  const c = PROVIDERS[p];
  if (!c) return new Response("Inconnu", { status: 404 });
  if (!c.clientId()) return new Response(`Identifiants ${p} manquants dans les variables Vercel`, { status: 500 });
  const state = crypto.randomUUID();
  const url = new URL(c.authorize);
  url.search = new URLSearchParams({
    client_id: c.clientId(), redirect_uri: callbackUrl(req, p), response_type: "code", scope: c.scope, state, ...c.extra,
  }).toString();
  const res = NextResponse.redirect(url);
  res.cookies.set("c_state", state, { httpOnly: true, sameSite: "lax", secure: true, maxAge: 600, path: "/" });
  return res;
}
