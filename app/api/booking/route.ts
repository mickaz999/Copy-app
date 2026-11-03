import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { getBooking } from "@/lib/booking";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getBooking());
}

const clamp = (v: unknown, min: number, max: number, def: number) => Math.min(max, Math.max(min, Number.isFinite(Number(v)) ? Number(v) : def));
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function POST(req: Request) {
  const b = await req.json();
  // Nouveau lien : l'ancien cesse de fonctionner
  if (b.regenerate) {
    await getBooking();
    return NextResponse.json(await db.bookingSettings.update({ where: { id: 1 }, data: { slug: randomBytes(9).toString("base64url") } }));
  }
  const hours: Record<string, [string, string][]> = {};
  for (const [d, ranges] of Object.entries(b.hours ?? {}))
    if (/^[0-6]$/.test(d) && Array.isArray(ranges))
      hours[d] = (ranges as any[]).filter((r) => HM.test(r?.[0]) && HM.test(r?.[1]) && r[0] < r[1]).map((r) => [r[0], r[1]]);
  const data = {
    enabled: !!b.enabled,
    title: String(b.title ?? "").trim().slice(0, 120) || "Prendre rendez-vous",
    intro: String(b.intro ?? "").slice(0, 1000),
    duration: clamp(b.duration, 10, 480, 30),
    step: clamp(b.step, 5, 240, 30),
    buffer: clamp(b.buffer, 0, 120, 0),
    minNotice: clamp(b.minNotice, 0, 336, 12),
    maxDays: clamp(b.maxDays, 1, 90, 30),
    hours: JSON.stringify(hours),
    blocked: JSON.stringify((Array.isArray(b.blocked) ? b.blocked : []).filter((d: unknown) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()),
    calendar: String(b.calendar ?? ""),
    location: String(b.location ?? "").slice(0, 300),
    visioLink: /^https?:\/\//.test(String(b.visioLink ?? "").trim()) ? String(b.visioLink).trim().slice(0, 300) : "",
  };
  return NextResponse.json(await db.bookingSettings.upsert({ where: { id: 1 }, create: data, update: data }));
}
