import { NextResponse } from "next/server";
import { PROVIDERS } from "@/lib/social";
import { frameConfigured, frameConnected, listProjects } from "@/lib/frameio";

export const dynamic = "force-dynamic";

export async function GET() {
  // Aide au diagnostic sans exposer le secret : longueur et 4 premiers caractères
  const s = PROVIDERS.frameio.clientSecret(), id = PROVIDERS.frameio.clientId();
  const check = { idEnd: id.slice(-4), idLength: id.length, secretStart: s.slice(0, 4), secretLength: s.length };
  if (!frameConfigured()) return NextResponse.json({ configured: false, connected: false, projects: [], check });
  if (!(await frameConnected())) return NextResponse.json({ configured: true, connected: false, projects: [], check });
  try {
    return NextResponse.json({ configured: true, connected: true, projects: await listProjects() });
  } catch (e) {
    return NextResponse.json({ configured: true, connected: true, projects: [], error: (e as Error).message });
  }
}
