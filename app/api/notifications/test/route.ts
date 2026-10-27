import { NextResponse } from "next/server";
import { sendGmail } from "@/lib/google";
import { buildDigest, digestHtml, getSettings, mailAccount, parisNow, sendPush } from "@/lib/notify";

// Envoie une notification ou un mail d'essai
export async function POST(req: Request) {
  const { kind } = await req.json();
  try {
    if (kind === "push") {
      const n = await sendPush({ title: "maderino", body: "Les notifications fonctionnent 🎉", url: "/planning", tag: "test" });
      if (!n) throw new Error("Aucun appareil abonné : active d'abord les notifications sur ce téléphone.");
      return NextResponse.json({ ok: true, message: `Notification envoyée à ${n} appareil${n > 1 ? "s" : ""}.` });
    }
    const s = await getSettings();
    const acc = await mailAccount();
    if (!acc) throw new Error("Reconnecte ton compte Google pour autoriser l'envoi de mails.");
    if (!s.emailTo) throw new Error("Indique l'adresse qui doit recevoir le récap.");
    const day = parisNow().day;
    await sendGmail(acc.id, s.emailTo, "Ton planning du jour (essai)", digestHtml(day, await buildDigest(day), new URL(req.url).origin));
    return NextResponse.json({ ok: true, message: `Mail envoyé à ${s.emailTo}.` });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
