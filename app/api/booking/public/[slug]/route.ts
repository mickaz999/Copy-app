import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { freeSlots, getBooking } from "@/lib/booking";
import { gapi, sendGmail, TZ } from "@/lib/google";
import { getSettings, mailAccount, sendPush } from "@/lib/notify";

export const dynamic = "force-dynamic";

async function open(slug: string) {
  const b = await getBooking();
  return b.enabled && slug === b.slug ? b : null;
}

// Créneaux libres (lien public, sans connexion)
export async function GET(_: Request, { params }: { params: { slug: string } }) {
  const b = await open(params.slug);
  if (!b) return NextResponse.json({ error: "Lien de prise de RDV invalide ou désactivé." }, { status: 404 });
  return NextResponse.json({ title: b.title, intro: b.intro, duration: b.duration, location: b.location, slots: await freeSlots(b) });
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Réservation d'un créneau : revérifié côté serveur, puis créé dans l'agenda Google choisi
export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const b = await open(params.slug);
  if (!b) return NextResponse.json({ error: "Lien de prise de RDV invalide ou désactivé." }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  if (body.website) return NextResponse.json({ ok: true }); // champ piège anti-robots
  const name = String(body.name ?? "").trim().slice(0, 100);
  const email = String(body.email ?? "").trim().slice(0, 200);
  const note = String(body.note ?? "").trim().slice(0, 2000);
  const mode = body.mode === "whatsapp" ? "whatsapp" : "visio";
  const phone = String(body.phone ?? "").replace(/[^\d+]/g, "").slice(0, 20);
  // Visio : mail obligatoire (invitation) ; WhatsApp : numéro obligatoire, mail facultatif
  if (mode === "whatsapp" && phone.replace(/\D/g, "").length < 8) return NextResponse.json({ error: "Indique ton numéro WhatsApp." }, { status: 400 });
  const day = String(body.day ?? ""), time = String(body.time ?? "");
  if (!name) return NextResponse.json({ error: "Indique ton nom." }, { status: 400 });
  if ((mode === "visio" || email) && !EMAIL.test(email)) return NextResponse.json({ error: "Indique une adresse mail valide." }, { status: 400 });

  const cal = await db.googleCal.findFirst({ where: { id: b.calendar, writable: true } });
  if (!cal) return NextResponse.json({ error: "La prise de RDV n'est pas encore configurée." }, { status: 503 });

  const slots = await freeSlots(b);
  if (!slots[day]?.includes(time)) return NextResponse.json({ error: "Ce créneau vient d'être pris, choisis-en un autre." }, { status: 409 });

  const [h, m] = time.split(":").map(Number);
  const endMin = h * 60 + m + b.duration;
  const end = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
  const how = mode === "visio" ? `Visio${b.visioLink ? ` · ${b.visioLink}` : " (Google Meet)"}` : `Appel WhatsApp · ${phone}`;
  const ev = await gapi(cal.accountId, `/calendars/${encodeURIComponent(cal.calendarId)}/events?sendUpdates=all&conferenceDataVersion=1`, {
    method: "POST",
    body: JSON.stringify({
      summary: `RDV ${mode === "visio" ? "visio" : "WhatsApp"} · ${name}`,
      description: `Pris via le lien de RDV.\n\nNom : ${name}${email ? `\nMail : ${email}` : ""}${phone ? `\nTél : ${phone}` : ""}\nFormat : ${how}${mode === "whatsapp" ? `\nhttps://wa.me/${phone.replace(/\D/g, "")}` : ""}${note ? `\n\n${note}` : ""}`,
      location: mode === "whatsapp" ? how : b.visioLink || b.location,
      ...(mode === "visio" && !b.visioLink ? { conferenceData: { createRequest: { requestId: `rdv-${Date.now()}`, conferenceSolutionKey: { type: "hangoutsMeet" } } } } : {}),
      start: { dateTime: `${day}T${time}:00`, timeZone: TZ },
      end: { dateTime: `${day}T${end}:00`, timeZone: TZ },
      attendees: email ? [{ email, displayName: name }] : [],
    }),
  });

  const s = await getSettings();
  const when = new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const meet = mode === "visio" ? b.visioLink || ev?.hangoutLink || "" : "";

  // Mail de confirmation envoyé par l'app (l'invitation Google peut ne pas arriver)
  const acc = email ? await mailAccount() : null;
  if (acc) {
    const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
    const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:auto;color:#1c1814">
      <h2 style="margin:0 0 12px">Ton RDV est confirmé ✅</h2>
      <p>Bonjour ${esc(name)},</p>
      <p><b style="text-transform:capitalize">${when}</b>, de <b>${time}</b> à <b>${end}</b> (heure de Paris).</p>
      ${mode === "visio"
        ? meet ? `<p>En visio : <a href="${esc(meet)}" style="color:#ff6b00;font-weight:600">${esc(meet.replace(/^https?:\/\//, ""))}</a></p>` : "<p>En visio, le lien est dans l'invitation Google Agenda.</p>"
        : `<p>Appel WhatsApp au <b>${esc(phone)}</b>.</p>`}
      <p style="color:#7a7068;font-size:13px">Un empêchement ? Réponds simplement à ce mail.</p>
    </div>`;
    await sendGmail(acc.id, email, `RDV confirmé · ${when} à ${time}`, html).catch(() => {});
  }

  if (s.pushEnabled) {
    await sendPush({ title: "Nouveau RDV", body: `${name} · ${when} à ${time} · ${mode === "visio" ? "visio" : "WhatsApp"}`, url: "/planning", tag: `rdv-${day}-${time}` }).catch(() => {});
  }
  return NextResponse.json({ ok: true, day, time, end, mode, meet });
}
