import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gapi, toGoogleEvent } from "@/lib/google";

type P = { params: { calId: string; eventId: string } };

async function target(params: P["params"]) {
  const cal = await db.googleCal.findUnique({ where: { id: params.calId } });
  if (!cal?.writable) throw new Error("Cet agenda n'est pas modifiable");
  return { cal, path: `/calendars/${encodeURIComponent(cal.calendarId)}/events/${encodeURIComponent(params.eventId)}` };
}

export async function PATCH(req: Request, { params }: P) {
  try {
    const { cal, path } = await target(params);
    const ev = await gapi(cal.accountId, path, { method: "PATCH", body: JSON.stringify(toGoogleEvent(await req.json())) });
    return NextResponse.json(ev);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

export async function DELETE(_: Request, { params }: P) {
  try {
    const { cal, path } = await target(params);
    await gapi(cal.accountId, path, { method: "DELETE" });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
