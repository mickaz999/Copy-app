import { NextResponse } from "next/server";
import { runCron } from "@/lib/notify";
import { mergeDropTasks, pullFrameComments, purgeExpiredDeliveries } from "@/lib/deliveryTasks";
import { frameConnected } from "@/lib/frameio";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Appelé par Vercel (tous les jours) et par cron-job.org (toutes les 5 min)
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url);
  const ok = secret && (req.headers.get("authorization") === `Bearer ${secret}` || url.searchParams.get("key") === secret);
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const log = await runCron(url.origin);
    // Commentaires laissés directement sur Frame.io → tâches « Modifs »
    if (await frameConnected()) await pullFrameComments().then((n) => n && log.push(`${n} retour(s) Frame.io`)).catch((e) => log.push(`Frame.io : ${e.message}`));
    await mergeDropTasks().then((n) => n && log.push(`${n} tâche(s) « Dérusher » en double fusionnée(s)`)).catch(() => {});
    await purgeExpiredDeliveries().then((n) => n && log.push(`${n} lien(s) de livraison expiré(s) supprimé(s)`)).catch(() => {});
    return NextResponse.json({ ok: true, log });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
