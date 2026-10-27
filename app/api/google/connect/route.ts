import { NextResponse } from "next/server";
import { googleConfigured, redirectUri, SCOPES } from "@/lib/google";

export async function GET(req: Request) {
  if (!googleConfigured())
    return NextResponse.json({ error: "GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET manquent dans les variables d'environnement." }, { status: 500 });
  const state = crypto.randomUUID();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(req),
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  }).toString();
  const res = NextResponse.redirect(url);
  res.cookies.set("g_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/" });
  return res;
}
