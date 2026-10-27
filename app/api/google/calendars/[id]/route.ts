import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gapi } from "@/lib/google";

type P = { params: { id: string } };

// Affichage et couleur dans l'app (ne change rien côté Google), ou renommage
export async function PATCH(req: Request, { params }: P) {
  const body = await req.json();
  const cal = await db.googleCal.findUniqueOrThrow({ where: { id: params.id } });
  try {
    if (typeof body.name === "string" && body.name.trim() && body.name !== cal.name)
      await gapi(cal.accountId, `/calendars/${encodeURIComponent(cal.calendarId)}`, { method: "PATCH", body: JSON.stringify({ summary: body.name.trim() }) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
  const data: Record<string, unknown> = {};
  if (typeof body.visible === "boolean") data.visible = body.visible;
  if (typeof body.color === "string") data.color = body.color;
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  return NextResponse.json(await db.googleCal.update({ where: { id: params.id }, data }));
}
