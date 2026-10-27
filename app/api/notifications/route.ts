import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSettings, mailAccount, pushConfigured } from "@/lib/notify";

export const dynamic = "force-dynamic";

export async function GET() {
  const [settings, acc, devices, anyGoogle, gcals, icals] = await Promise.all([
    getSettings(), mailAccount(), db.pushSub.count(), db.googleAccount.count(),
    db.googleCal.findMany({ orderBy: { name: "asc" } }), db.calendar.findMany(),
  ]);
  return NextResponse.json({
    settings,
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? "",
    pushReady: pushConfigured(),
    cronReady: !!process.env.CRON_SECRET,
    mailFrom: acc?.email ?? "",
    googleConnected: anyGoogle > 0,
    devices,
    calendars: [...gcals.map((c) => ({ id: c.id, name: c.name })), ...icals.map((c) => ({ id: c.id, name: c.name }))],
    writableCalendars: gcals.filter((c) => c.writable).map((c) => ({ id: c.id, name: c.name })),
  });
}

export async function POST(req: Request) {
  const b = await req.json();
  const data = {
    pushEnabled: !!b.pushEnabled,
    emailEnabled: !!b.emailEnabled,
    emailTo: String(b.emailTo ?? "").trim(),
    digestHour: Math.min(23, Math.max(0, Number(b.digestHour) || 0)),
    eventReminder: Math.min(240, Math.max(0, Number(b.eventReminder) || 0)),
    lateAlert: !!b.lateAlert,
    liveCalendar: String(b.liveCalendar ?? ""),
    liveDays: Math.min(14, Math.max(0, Number(b.liveDays) || 0)),
    liveCategory: String(b.liveCategory ?? "Gaming"),
    blockCalendar: String(b.blockCalendar ?? ""),
  };
  return NextResponse.json(await db.notifSettings.upsert({ where: { id: 1 }, create: data, update: data }));
}
