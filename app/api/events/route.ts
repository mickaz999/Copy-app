import { NextResponse } from "next/server";
import { getEvents } from "@/lib/events";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const from = new Date(q.get("from") ?? Date.now());
  const to = new Date(q.get("to") ?? Date.now() + 31 * 864e5);
  return NextResponse.json(await getEvents(from, to, q.has("refresh")));
}
