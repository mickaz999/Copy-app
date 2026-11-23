import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoiceSettings } from "@/lib/invoices";

export const dynamic = "force-dynamic";

const UA = { "User-Agent": "copy-app-devis/1.0", "Accept-Language": "fr" };

// Adresse → coordonnées (OpenStreetMap, gratuit)
async function geocode(q: string) {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=fr,ch,be,lu,it,es,de&q=${encodeURIComponent(q)}`, { headers: UA, signal: AbortSignal.timeout(8000) });
  const j = (await r.json()) as { lat: string; lon: string; display_name: string }[];
  if (!j[0]) throw new Error(`Adresse introuvable : ${q}`);
  return j[0];
}

// GET : réglages des déplacements ; GET ?to=adresse : distance en voiture (km, aller simple) depuis l'adresse de départ
export async function GET(req: Request) {
  const s = await invoiceSettings();
  const from = s.kmFrom || [s.address, s.zip, s.city].filter(Boolean).join(" ");
  const to = new URL(req.url).searchParams.get("to")?.trim();
  if (!to) return NextResponse.json({ kmRate: s.kmRate, kmFrom: s.kmFrom, defaultFrom: from });
  try {
    if (!from) throw new Error("Indique l'adresse de départ.");
    const [a, b] = await Promise.all([geocode(from), geocode(to)]);
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`, { headers: UA, signal: AbortSignal.timeout(10000) });
    const j = await r.json();
    const m = j?.routes?.[0]?.distance;
    if (!m) throw new Error("Itinéraire introuvable.");
    return NextResponse.json({ km: Math.round(m / 1000), to: b.display_name });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Calcul impossible, saisis les km à la main." }, { status: 400 });
  }
}

export async function POST(req: Request) {
  const b = await req.json();
  const s = await db.invoiceSettings.upsert({
    where: { id: 1 }, create: {},
    update: { ...(b.kmRate !== undefined ? { kmRate: Math.max(0, Number(b.kmRate) || 0) } : {}), ...(b.kmFrom !== undefined ? { kmFrom: String(b.kmFrom).trim() } : {}) },
  });
  return NextResponse.json({ kmRate: s.kmRate, kmFrom: s.kmFrom });
}
