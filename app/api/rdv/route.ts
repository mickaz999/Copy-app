import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// RDV à venir (et ceux des 30 derniers jours)
export async function GET() {
  const since = new Date(Date.now() - 30 * 864e5);
  return NextResponse.json(await db.appointment.findMany({ where: { start: { gte: since } }, orderBy: { start: "asc" } }));
}
