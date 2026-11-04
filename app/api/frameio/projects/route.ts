import { NextResponse } from "next/server";
import { frameConfigured, frameConnected, listProjects } from "@/lib/frameio";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!frameConfigured()) return NextResponse.json({ configured: false, connected: false, projects: [] });
  if (!(await frameConnected())) return NextResponse.json({ configured: true, connected: false, projects: [] });
  try {
    return NextResponse.json({ configured: true, connected: true, projects: await listProjects() });
  } catch (e) {
    return NextResponse.json({ configured: true, connected: true, projects: [], error: (e as Error).message });
  }
}
