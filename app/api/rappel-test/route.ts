import { NextResponse } from "next/server";
import { sendGmail } from "@/lib/google";
import { mailHtml } from "@/lib/clients";
import { mailAccount } from "@/lib/notify";

export const dynamic = "force-dynamic";

// Réservé à l'admin (connecté) : envoie un exemple du mail « dépose tes rushs » à ?to=
export async function GET(req: Request) {
  const to = (new URL(req.url).searchParams.get("to") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return NextResponse.json({ error: "Ajoute ?to=ton@mail.com" }, { status: 400 });
  const acc = await mailAccount();
  if (!acc) return NextResponse.json({ error: "Aucun compte Gmail connecté." }, { status: 400 });
  const end = new Date(Date.now() + 864e5).toLocaleString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  const html = mailHtml("N'oublie pas de déposer tes rushs",
    [`Le lien de dépôt <b>Exemple de projet</b> est encore vide, et il ferme le <b>${end}</b> (heure de Paris).`, "Il te reste 24 h pour y déposer tes fichiers."],
    "Déposer mes rushs", new URL(req.url).origin);
  await sendGmail(acc.id, to, "[Test] Il te reste 24 h pour déposer tes rushs · Exemple de projet", html);
  return NextResponse.json({ ok: true, sentTo: to });
}
