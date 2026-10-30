import { NextRequest } from "next/server";
import { Provider, PROVIDERS, callbackUrl, saveCode } from "@/lib/social";

export const dynamic = "force-dynamic";

const page = (title: string, msg = "") =>
  new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:40px auto;padding:0 16px"><h2>${title}</h2><p>${msg.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!))}</p></body>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } });

export async function GET(req: NextRequest, { params }: { params: { provider: string } }) {
  const p = params.provider as Provider;
  if (!PROVIDERS[p]) return page("Inconnu");
  const q = req.nextUrl.searchParams;
  if (q.get("error")) return page("Connexion annulée", q.get("error_description") ?? q.get("error") ?? "");
  if (!q.get("state") || q.get("state") !== req.cookies.get("c_state")?.value) return page("Session expirée", "Recommence la connexion.");
  try {
    await saveCode(p, q.get("code") ?? "", callbackUrl(req, p));
    return page(`✅ ${p === "youtube" ? "YouTube" : "Twitch"} connecté`, "Les stats avancées apparaîtront dans le prochain rapport. Tu peux fermer cette page.");
  } catch (e) {
    return page("Erreur", (e as Error).message);
  }
}
