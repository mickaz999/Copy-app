import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gapi, googleConfigured, syncCalendars, TZ } from "@/lib/google";

export const dynamic = "force-dynamic";

// Comptes connectés et leurs agendas ; ?refresh=1 relit la liste chez Google
export async function GET(req: Request) {
  const errors: string[] = [];
  if (new URL(req.url).searchParams.has("refresh"))
    for (const a of await db.googleAccount.findMany())
      await syncCalendars(a.id).catch((e) => errors.push((e as Error).message));
  const accounts = await db.googleAccount.findMany({
    select: { id: true, email: true, calendars: { orderBy: { name: "asc" } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ configured: googleConfigured(), accounts, errors });
}

// Crée un nouvel agenda dans le compte Google
export async function POST(req: Request) {
  const { accountId, name } = await req.json();
  if (!accountId || !name?.trim()) return NextResponse.json({ error: "Nom manquant" }, { status: 400 });
  try {
    await gapi(accountId, "/calendars", { method: "POST", body: JSON.stringify({ summary: name.trim(), timeZone: TZ }) });
    await syncCalendars(accountId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
