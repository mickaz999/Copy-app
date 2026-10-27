import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { exchangeCode, forgetToken, redirectUri, syncCalendars } from "@/lib/google";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const back = (msg: string) => NextResponse.redirect(new URL(`/planning?google=${encodeURIComponent(msg)}`, req.url));
  if (q.get("error")) return back("Connexion Google annulée");
  if (!q.get("state") || q.get("state") !== req.cookies.get("g_state")?.value) return back("Connexion Google refusée (session expirée), réessaie");
  try {
    const t = await exchangeCode(q.get("code") ?? "", redirectUri(req));
    // L'id_token contient l'e-mail du compte (JWT, partie centrale en base64url)
    const email = JSON.parse(Buffer.from((t.id_token ?? "").split(".")[1] ?? "", "base64url").toString() || "{}").email ?? "compte Google";
    const existing = await db.googleAccount.findUnique({ where: { email } });
    const refreshToken = t.refresh_token ?? existing?.refreshToken;
    if (!refreshToken) return back("Google n'a pas donné d'accès permanent, réessaie");
    const data = { refreshToken, accessToken: t.access_token, expiresAt: new Date(Date.now() + t.expires_in * 1000), scopes: t.scope ?? "" };
    const acc = await db.googleAccount.upsert({ where: { email }, create: { email, ...data }, update: data });
    forgetToken(acc.id);
    await syncCalendars(acc.id);
    const res = back(`Compte ${email} connecté`);
    res.cookies.delete("g_state");
    return res;
  } catch (e) {
    return back((e as Error).message.slice(0, 200));
  }
}
