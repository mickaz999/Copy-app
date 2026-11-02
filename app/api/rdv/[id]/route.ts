import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { BookingError, cancelAppointment, moveAppointment, slotsFor } from "@/lib/appointments";

export const dynamic = "force-dynamic";

// Créneaux libres pour déplacer ce RDV
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const a = await db.appointment.findUnique({ where: { id: params.id } });
  if (!a) return NextResponse.json({ error: "RDV introuvable" }, { status: 404 });
  return NextResponse.json({ slots: await slotsFor(a) });
}

// { action: "cancel", message } | { action: "move", day, time, message, force }
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const a = await db.appointment.findUnique({ where: { id: params.id } });
  if (!a) return NextResponse.json({ error: "RDV introuvable" }, { status: 404 });
  const b = await req.json();
  const appUrl = new URL(req.url).origin;
  const message = String(b.message ?? "").slice(0, 2000);
  try {
    if (b.action === "cancel") return NextResponse.json(await cancelAppointment(a, appUrl, { message }));
    if (b.action === "move") return NextResponse.json(await moveAppointment(a, String(b.day), String(b.time), appUrl, { message, force: !!b.force }));
    if (b.action === "delete" && a.status === "cancelled") return NextResponse.json(await db.appointment.delete({ where: { id: a.id } }));
  } catch (e) {
    if (e instanceof BookingError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
}
