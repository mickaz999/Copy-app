import { db } from "@/lib/db";
import { getEvents } from "@/lib/events";
import { TZ } from "@/lib/google";

export type Hours = Record<string, [string, string][]>;

export const getBooking = () => db.bookingSettings.upsert({ where: { id: 1 }, create: {}, update: {} });

// Décalage (min) de Paris par rapport à UTC à un instant donné (gère heure d'été / d'hiver)
function parisOffset(at: number) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(at)).map((x) => [x.type, x.value])
  );
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(at / 6e4) * 6e4) / 6e4;
}

// "YYYY-MM-DD" + "HH:MM" à l'heure de Paris → timestamp UTC
export function parisTime(day: string, hm: string) {
  const [y, m, d] = day.split("-").map(Number);
  const [h, mi] = hm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  return guess - parisOffset(guess - parisOffset(guess) * 6e4) * 6e4;
}

const parisDay = (at: number) => new Date(at + parisOffset(at) * 6e4).toISOString().slice(0, 10);
const addDays = (day: string, n: number) => new Date(Date.parse(day) + n * 864e5).toISOString().slice(0, 10);
const hm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const toMin = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };

// Périodes occupées : événements avec horaire de tous les agendas visibles + tâches avec horaire
async function busyPeriods(from: number, to: number, ignoreEvent = "") {
  const [{ events }, tasks] = await Promise.all([
    getEvents(new Date(from), new Date(to), true),
    db.task.findMany({ where: { status: { not: "done" }, startTime: { not: "" }, endDate: null, date: { gte: new Date(from - 864e5), lte: new Date(to) } } }),
  ]);
  const busy = events.filter((e) => !e.allDay && (!ignoreEvent || e.eventId !== ignoreEvent)).map((e) => [Date.parse(e.start), Date.parse(e.end)] as [number, number]);
  for (const t of tasks) {
    const day = t.date!.toISOString().slice(0, 10);
    const s = parisTime(day, t.startTime);
    busy.push([s, t.endTime && t.endTime > t.startTime ? parisTime(day, t.endTime) : s + 36e5]);
  }
  return busy;
}

// Créneaux libres, groupés par jour (heure de Paris) : { "2026-11-03": ["09:00", "09:30", …] }
// ignoreEvent : RDV en cours de report, dont le créneau actuel ne compte pas comme occupé
export async function freeSlots(b: Awaited<ReturnType<typeof getBooking>>, ignoreEvent = "") {
  const hours: Hours = JSON.parse(b.hours || "{}");
  const now = Date.now();
  const first = now + b.minNotice * 36e5;
  const today = parisDay(now);
  const last = addDays(today, b.maxDays);
  const busy = await busyPeriods(now, parisTime(last, "23:59"), ignoreEvent);
  const pad = b.buffer * 6e4;
  const out: Record<string, string[]> = {};

  for (let day = today; day <= last; day = addDays(day, 1)) {
    const ranges = hours[String(new Date(day).getUTCDay())] ?? [];
    for (const [a, z] of ranges) {
      for (let m = toMin(a); m + b.duration <= toMin(z); m += Math.max(5, b.step)) {
        const s = parisTime(day, hm(m)), e = s + b.duration * 6e4;
        if (s < first) continue;
        if (busy.some(([bs, be]) => s < be + pad && e > bs - pad)) continue;
        (out[day] ??= []).push(hm(m));
      }
    }
  }
  return out;
}
