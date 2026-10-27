import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gapi, toGoogleEvent } from "@/lib/google";

// Crée un événement dans un agenda Google
export async function POST(req: Request) {
  const body = await req.json();
  const cal = await db.googleCal.findUnique({ where: { id: body.calId ?? "" } });
  if (!cal?.writable) return NextResponse.json({ error: "Choisis un agenda modifiable" }, { status: 400 });
  if (!body.title?.trim()) return NextResponse.json({ error: "Titre manquant" }, { status: 400 });
  try {
    const ev = await gapi(cal.accountId, `/calendars/${encodeURIComponent(cal.calendarId)}/events`, {
      method: "POST",
      body: JSON.stringify(toGoogleEvent(body)),
    });
    return NextResponse.json(ev);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
