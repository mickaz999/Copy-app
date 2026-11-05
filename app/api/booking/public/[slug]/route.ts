import { NextResponse } from "next/server";
import { freeSlots, getBooking } from "@/lib/booking";
import { BookingError, createAppointment } from "@/lib/appointments";
import { PUBLIC_URL } from "@/lib/site";

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

  try {
    const a = await createAppointment({ name, email, phone, mode, note, day, time }, PUBLIC_URL);
    return NextResponse.json({ ok: true, day: a.day, time: a.time, end: a.end, mode: a.mode, meet: a.meet, manage: `/rdv/gerer/${a.token}` });
  } catch (e) {
    if (e instanceof BookingError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
