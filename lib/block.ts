import { db } from "@/lib/db";
import { gapi, TZ } from "@/lib/google";

// Agenda où bloquer les créneaux : celui choisi, sinon un agenda modifiable dont le nom contient « maderino »
export async function blockCalendar() {
  const s = await db.notifSettings.upsert({ where: { id: 1 }, create: {}, update: {} });
  const cals = await db.googleCal.findMany({ where: { writable: true } });
  if (s.blockCalendar === "none") return null;
  return cals.find((c) => c.id === s.blockCalendar) ?? (s.blockCalendar ? null : cals.find((c) => /maderino/i.test(c.name)) ?? null);
}

// Crée, met à jour ou retire le créneau Google qui bloque l'horaire d'une tâche
export async function syncTaskBlock(taskId: string) {
  const t = await db.task.findUnique({ where: { id: taskId } });
  if (!t) return;
  const cal = await blockCalendar();
  const wanted = !!(cal && t.date && !t.endDate && t.startTime);
  const path = (calId: string) => `/calendars/${encodeURIComponent(calId)}/events`;

  // Ancien créneau dans un autre agenda, ou plus besoin de bloquer : on le retire
  if (t.blockEventId && (!wanted || t.blockCalId !== cal!.id)) {
    const old = await db.googleCal.findUnique({ where: { id: t.blockCalId } });
    if (old) await gapi(old.accountId, `${path(old.calendarId)}/${encodeURIComponent(t.blockEventId)}`, { method: "DELETE" }).catch(() => {});
    await db.task.update({ where: { id: t.id }, data: { blockEventId: "", blockCalId: "" } });
    t.blockEventId = "";
  }
  if (!wanted) return;

  const day = t.date!.toISOString().slice(0, 10);
  const end = t.endTime && t.endTime > t.startTime ? t.endTime : addHour(t.startTime);
  const body = {
    summary: t.title,
    description: "Créneau bloqué par une tâche de l'app maderino.",
    start: { dateTime: `${day}T${t.startTime}:00`, timeZone: TZ },
    end: { dateTime: `${day}T${end}:00`, timeZone: TZ },
    transparency: "opaque",
    visibility: "private",
    extendedProperties: { private: { maderinoTask: t.id } },
  };
  if (t.blockEventId) {
    const ok = await gapi(cal!.accountId, `${path(cal!.calendarId)}/${encodeURIComponent(t.blockEventId)}`, { method: "PATCH", body: JSON.stringify(body) }).then(() => true).catch(() => false);
    if (ok) return;
  }
  const ev = await gapi(cal!.accountId, path(cal!.calendarId), { method: "POST", body: JSON.stringify(body) });
  await db.task.update({ where: { id: t.id }, data: { blockEventId: ev.id, blockCalId: cal!.id } });
}

// Avant suppression d'une tâche : libère son créneau
export async function removeTaskBlock(taskId: string) {
  const t = await db.task.findUnique({ where: { id: taskId } });
  if (!t?.blockEventId) return;
  const cal = await db.googleCal.findUnique({ where: { id: t.blockCalId } });
  if (cal) await gapi(cal.accountId, `/calendars/${encodeURIComponent(cal.calendarId)}/events/${encodeURIComponent(t.blockEventId)}`, { method: "DELETE" }).catch(() => {});
}

function addHour(hm: string) {
  const [h, m] = hm.split(":").map(Number);
  return `${String(Math.min(23, h + 1)).padStart(2, "0")}:${String(h >= 23 ? 59 : m).padStart(2, "0")}`;
}
