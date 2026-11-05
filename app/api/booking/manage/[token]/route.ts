import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { BookingError, cancelAppointment, moveAppointment, slotsFor } from "@/lib/appointments";
import { PUBLIC_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

// Lien « gérer mon RDV » de la personne (sans connexion)
const find = (token: string) => db.appointment.findUnique({ where: { token } });
const pub = (a: NonNullable<Awaited<ReturnType<typeof find>>>) => ({ name: a.name, mode: a.mode, day: a.day, time: a.time, end: a.end, meet: a.meet, status: a.status, past: a.start.getTime() < Date.now() });

export async function GET(_: Request, { params }: { params: { token: string } }) {
  const a = await find(params.token);
  if (!a) return NextResponse.json({ error: "Lien invalide." }, { status: 404 });
  return NextResponse.json({ ...pub(a), slots: a.status === "confirmed" ? await slotsFor(a) : {} });
}

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const a = await find(params.token);
  if (!a) return NextResponse.json({ error: "Lien invalide." }, { status: 404 });
  if (a.start.getTime() < Date.now()) return NextResponse.json({ error: "Ce RDV est déjà passé." }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  const appUrl = PUBLIC_URL;
  const message = String(b.message ?? "").slice(0, 2000);
  try {
    if (b.action === "cancel") return NextResponse.json(pub(await cancelAppointment(a, appUrl, { message, byClient: true })));
    if (b.action === "move") return NextResponse.json(pub(await moveAppointment(a, String(b.day), String(b.time), appUrl, { byClient: true })));
  } catch (e) {
    if (e instanceof BookingError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
}
