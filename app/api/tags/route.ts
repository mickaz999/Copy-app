import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Compta : renommer ({ from, to }) ou supprimer ({ from }) un tag sur toutes les lignes
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const from = String(b.from ?? "").trim();
  const to = String(b.to ?? "").trim().replace(/,/g, "");
  if (!from) return NextResponse.json({ error: "Tag manquant." }, { status: 400 });
  const list = await db.transaction.findMany({ where: { category: { contains: from } } });
  let n = 0;
  for (const t of list) {
    const tags = t.category.split(",").map((x) => x.trim()).filter(Boolean);
    if (!tags.includes(from)) continue;
    const next = Array.from(new Set(tags.flatMap((x) => (x === from ? (to ? [to] : []) : [x]))));
    await db.transaction.update({ where: { id: t.id }, data: { category: next.join(", ") } });
    n++;
  }
  return NextResponse.json({ updated: n });
}
