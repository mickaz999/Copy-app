import { randomBytes } from "crypto";
import type { Appointment } from "@prisma/client";
import { db } from "@/lib/db";
import { freeSlots, getBooking, parisTime } from "@/lib/booking";
import { gapi, sendGmail, TZ } from "@/lib/google";
import { getSettings, mailAccount, sendPush } from "@/lib/notify";

type Booking = Awaited<ReturnType<typeof getBooking>>;

export class BookingError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const endOf = (time: string, duration: number) => {
  const [h, m] = time.split(":").map(Number);
  const e = h * 60 + m + duration;
  return `${String(Math.floor(e / 60)).padStart(2, "0")}:${String(e % 60).padStart(2, "0")}`;
};
export const whenLabel = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const eventPath = (calendarId: string, eventId = "") => `/calendars/${encodeURIComponent(calendarId)}/events${eventId ? `/${encodeURIComponent(eventId)}` : ""}`;

function eventBody(a: { name: string; email: string; phone: string; mode: string; note: string; day: string; time: string; end: string }, b: Booking, appUrl: string, token: string) {
  const how = a.mode === "visio" ? `Visio${b.visioLink ? ` · ${b.visioLink}` : " (Google Meet)"}` : `Appel WhatsApp · ${a.phone}`;
  return {
    summary: `RDV ${a.mode === "visio" ? "visio" : "WhatsApp"} · ${a.name}`,
    description: `Pris via le lien de RDV.\n\nNom : ${a.name}${a.email ? `\nMail : ${a.email}` : ""}${a.phone ? `\nTél : ${a.phone}` : ""}\nFormat : ${how}${a.mode === "whatsapp" ? `\nhttps://wa.me/${a.phone.replace(/\D/g, "")}` : ""}${a.note ? `\n\n${a.note}` : ""}\n\nGérer : ${appUrl}/rendez-vous`,
    location: a.mode === "whatsapp" ? how : b.visioLink || b.location,
    start: { dateTime: `${a.day}T${a.time}:00`, timeZone: TZ },
    end: { dateTime: `${a.day}T${a.end}:00`, timeZone: TZ },
    attendees: a.email ? [{ email: a.email, displayName: a.name }] : [],
    extendedProperties: { private: { maderinoRdv: token } },
  };
}

// Mail à la personne (confirmation, report, annulation)
async function mailClient(a: Appointment, kind: "confirm" | "move" | "cancel", appUrl: string, message = "") {
  if (!a.email) return;
  const acc = await mailAccount();
  if (!acc) return;
  const when = whenLabel(a.day);
  const head = { confirm: "Ton RDV est confirmé", move: "Ton RDV a été déplacé", cancel: "Ton RDV est annulé" }[kind];
  const subject = { confirm: `RDV confirmé · ${when} à ${a.time}`, move: `RDV déplacé · ${when} à ${a.time}`, cancel: `RDV annulé · ${when} à ${a.time}` }[kind];
  const manage = `${appUrl}/rdv/gerer/${a.token}`;
  const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:auto;color:#1c1814">
    <h2 style="margin:0 0 12px">${head}</h2>
    <p>Bonjour ${esc(a.name)},</p>
    ${message ? `<p style="white-space:pre-line;background:#f6efe6;border-radius:10px;padding:10px 12px">${esc(message)}</p>` : ""}
    ${kind === "cancel"
      ? `<p>Le RDV du <b>${when}</b> à <b>${a.time}</b> n'aura pas lieu.</p>`
      : `<p>${kind === "move" ? "Nouveau créneau : " : ""}<b style="text-transform:capitalize">${when}</b>, de <b>${a.time}</b> à <b>${a.end}</b> (heure de Paris).</p>
         ${a.mode === "visio"
           ? a.meet ? `<p>En visio : <a href="${esc(a.meet)}" style="color:#ff6b00;font-weight:600">${esc(a.meet.replace(/^https?:\/\//, ""))}</a></p>` : "<p>En visio, le lien est dans l'invitation Google Agenda.</p>"
           : `<p>Appel WhatsApp au <b>${esc(a.phone)}</b>.</p>`}
         <p><a href="${manage}" style="color:#ff6b00">Déplacer ou annuler ce RDV</a></p>`}
  </div>`;
  await sendGmail(acc.id, a.email, subject, html).catch(() => {});
}

async function notifyMe(title: string, a: Appointment) {
  const s = await getSettings();
  if (s.pushEnabled) await sendPush({ title, body: `${a.name} · ${whenLabel(a.day)} à ${a.time} · ${a.mode === "visio" ? "visio" : "WhatsApp"}`, url: "/rendez-vous", tag: `rdv-${a.id}` }).catch(() => {});
}

export async function createAppointment(input: { name: string; email: string; phone: string; mode: string; note: string; day: string; time: string }, appUrl: string) {
  const b = await getBooking();
  const cal = await db.googleCal.findFirst({ where: { id: b.calendar, writable: true } });
  if (!cal) throw new BookingError("La prise de RDV n'est pas encore configurée.", 503);
  const slots = await freeSlots(b);
  if (!slots[input.day]?.includes(input.time)) throw new BookingError("Ce créneau vient d'être pris, choisis-en un autre.", 409);

  const token = randomBytes(12).toString("base64url");
  const a = { ...input, end: endOf(input.time, b.duration) };
  const ev = await gapi(cal.accountId, `${eventPath(cal.calendarId)}?sendUpdates=all&conferenceDataVersion=1`, {
    method: "POST",
    body: JSON.stringify({
      ...eventBody(a, b, appUrl, token),
      ...(a.mode === "visio" && !b.visioLink ? { conferenceData: { createRequest: { requestId: `rdv-${token}`, conferenceSolutionKey: { type: "hangoutsMeet" } } } } : {}),
    }),
  });
  const appt = await db.appointment.create({
    data: { ...a, token, start: new Date(parisTime(a.day, a.time)), meet: a.mode === "visio" ? b.visioLink || ev?.hangoutLink || "" : "", calId: cal.id, eventId: ev.id },
  });
  await mailClient(appt, "confirm", appUrl);
  await notifyMe("Nouveau RDV", appt);
  return appt;
}

// Créneaux proposés pour déplacer un RDV (son créneau actuel reste libre)
export async function slotsFor(a: Appointment) {
  return freeSlots(await getBooking(), a.eventId);
}

export async function moveAppointment(a: Appointment, day: string, time: string, appUrl: string, opts: { message?: string; byClient?: boolean; force?: boolean; end?: string; skipGoogle?: boolean; silent?: boolean } = {}) {
  if (a.status !== "confirmed") throw new BookingError("Ce RDV est annulé.");
  const b = await getBooking();
  // Toi : tu peux forcer n'importe quel horaire ; la personne : seulement un créneau libre
  if (!opts.force && !(await freeSlots(b, a.eventId))[day]?.includes(time)) throw new BookingError("Ce créneau n'est plus libre, choisis-en un autre.", 409);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time)) throw new BookingError("Date ou heure invalide.");
  const cal = await db.googleCal.findUnique({ where: { id: a.calId } });
  // end / skipGoogle : déplacé depuis la fenêtre d'événement du Planning, qui a déjà mis Google à jour
  const end = opts.end && opts.end > time ? opts.end : endOf(time, b.duration);
  if (cal && !opts.skipGoogle) await gapi(cal.accountId, `${eventPath(cal.calendarId, a.eventId)}?sendUpdates=all`, {
    method: "PATCH",
    body: JSON.stringify({ start: { dateTime: `${day}T${time}:00`, timeZone: TZ }, end: { dateTime: `${day}T${end}:00`, timeZone: TZ } }),
  });
  const next = await db.appointment.update({ where: { id: a.id }, data: { day, time, end, start: new Date(parisTime(day, time)) } });
  if (!opts.silent) await mailClient(next, "move", appUrl, opts.message);
  if (opts.byClient) await notifyMe("RDV déplacé", next);
  return next;
}

export async function cancelAppointment(a: Appointment, appUrl: string, opts: { message?: string; byClient?: boolean; silent?: boolean } = {}) {
  if (a.status !== "confirmed") return a;
  const cal = await db.googleCal.findUnique({ where: { id: a.calId } });
  if (cal) await gapi(cal.accountId, `${eventPath(cal.calendarId, a.eventId)}?sendUpdates=all`, { method: "DELETE" }).catch(() => {});
  const next = await db.appointment.update({ where: { id: a.id }, data: { status: "cancelled" } });
  if (!opts.silent) await mailClient(next, "cancel", appUrl, opts.message);
  if (opts.byClient) await notifyMe("RDV annulé", next);
  return next;
}
