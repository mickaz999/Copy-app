import { NextResponse } from "next/server";
import { extraStats } from "@/lib/social";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Stats avancées (YouTube Analytics, Twitch) pour l'agent de reporting
export async function GET(req: Request) {
  const secret = process.env.REPORT_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await extraStats());
}
