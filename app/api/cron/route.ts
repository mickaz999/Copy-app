import { NextResponse } from "next/server";
import { runCron } from "@/lib/notify";
import { mergeDropTasks, pullFrameComments, purgeExpiredDeliveries, remindEmptyDrops, remindExpiringDeliveries } from "@/lib/deliveryTasks";
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
    // Les rappels clients passent en premier et en parallèle : une étape lente (Frame.io) ne doit plus les bloquer
    const log: string[] = [];
    const step = (p: Promise<unknown>, label: string) => p.catch((e) => { log.push(`${label} : ${(e as Error).message}`); });
    await Promise.all([
      step(remindEmptyDrops().then((n) => { if (n) log.push(`${n} rappel(s) « dépose tes rushs »`); }), "relance dépôt"),
      step(remindExpiringDeliveries(url.origin).then((n) => { if (n) log.push(`${n} mail(s) de relance « lien bientôt expiré »`); }), "relance livraison"),
    ]);
    log.push(...(await runCron(url.origin)));
    // Tâches secondaires (Frame.io, fusion, purge) : limitées à 10 s pour ne pas tourner jusqu'au timeout
    const secondary = Promise.all([
      step(frameConnected().then(async (ok) => { if (ok) { const n = await pullFrameComments(); if (n) log.push(`${n} retour(s) Frame.io`); } }), "Frame.io"),
      step(mergeDropTasks().then((n) => { if (n) log.push(`${n} tâche(s) « Dérusher » en double fusionnée(s)`); }), "fusion dérush"),
      step(purgeExpiredDeliveries().then((n) => { if (n) log.push(`${n} lien(s) de livraison expiré(s) supprimé(s)`); }), "purge"),
    ]);
    await Promise.race([secondary, new Promise((ok) => setTimeout(() => { log.push("tâches secondaires coupées après 10 s (reprise au prochain passage)"); ok(null); }, 10_000))]);
    return NextResponse.json({ ok: true, log });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
