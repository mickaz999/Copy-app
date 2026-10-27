import { NextResponse } from "next/server";
import { runCron } from "@/lib/notify";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Appelé par Vercel (tous les jours) et par cron-job.org (toutes les 5 min)
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url);
  const ok = secret && (req.headers.get("authorization") === `Bearer ${secret}` || url.searchParams.get("key") === secret);
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, log: await runCron(url.origin) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
