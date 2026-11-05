import { NextResponse } from "next/server";
import { createFolder } from "@/lib/frameio";

export const dynamic = "force-dynamic";

// Nouveau dossier Frame.io : { accountId, parentId, name }
export async function POST(req: Request) {
  const b = await req.json();
  const name = String(b.name ?? "").trim().slice(0, 200);
  if (!b.accountId || !b.parentId || !name) return NextResponse.json({ error: "Nom du dossier requis." }, { status: 400 });
  try { return NextResponse.json(await createFolder(String(b.accountId), String(b.parentId), name)); }
  catch (e) { return NextResponse.json({ error: `Création impossible : ${(e as Error).message}` }, { status: 502 }); }
}
