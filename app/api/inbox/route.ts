import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Boîte de notifications de l'app : 60 dernières + nombre de non lues
export async function GET() {
  const [items, unread] = await Promise.all([
    db.notice.findMany({ orderBy: { createdAt: "desc" }, take: 60 }),
    db.notice.count({ where: { read: false } }),
  ]);
  // Briefs liés : texte, vocal et projet, pour créer une tâche depuis la notification
  const ids = items.filter((n) => n.ref.startsWith("brief:")).map((n) => n.ref.slice(6));
  const notes = ids.length ? await db.dropNote.findMany({ where: { id: { in: ids } }, include: { link: { select: { title: true, client: true, token: true } } } }) : [];
  const out = items.map((n) => {
    const b = notes.find((x) => `brief:${x.id}` === n.ref);
    return b ? { ...n, brief: { id: b.id, text: b.text, author: b.author, project: b.link.title, client: b.link.client, audio: b.audio ? `/api/drop/${b.link.token}/audio?id=${b.id}` : "" } } : n;
  });
  return NextResponse.json({ items: out, unread });
}

// { all: true } : tout marquer comme lu ; { id } : une seule ; { clear: true } : tout effacer
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  if (b.clear) await db.notice.deleteMany({});
  else if (b.id) await db.notice.update({ where: { id: String(b.id) }, data: { read: true } }).catch(() => {});
  else await db.notice.updateMany({ where: { read: false }, data: { read: true } });
  return NextResponse.json({ ok: true });
}
