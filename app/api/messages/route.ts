import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Messagerie : une conversation par livraison (retours + messages), la plus récente d'abord
export async function GET() {
  const list = await db.delivery.findMany({
    where: { mode: "page", OR: [{ messages: { some: {} } }, { comments: { some: {} } }] },
    include: { messages: { orderBy: { createdAt: "asc" } }, comments: { orderBy: { createdAt: "asc" } } },
  });
  const convs = list.map((d) => {
    const files: { name: string }[] = JSON.parse(d.files || "[]");
    const feed = [
      ...d.comments.map((c) => ({
        id: `c${c.id}`, commentId: c.id, mine: false, author: c.author, text: c.text, time: c.time, resolved: c.resolved, at: c.createdAt,
        audio: c.audio ? `/api/livraison/${d.token}/audio?id=${c.id}` : "",
        label: d.kind === "folder" ? c.fileName : d.kind === "videos" ? files[c.version - 1]?.name ?? `Vidéo ${c.version}` : `V${c.version}`,
      })),
      ...d.messages.map((m) => ({
        id: `m${m.id}`, commentId: "", mine: m.fromMe, author: m.author, text: m.text, time: null as number | null, resolved: false, at: m.createdAt,
        audio: m.audio ? `/api/livraison/${d.token}/msg?id=${m.id}` : "", label: "",
      })),
    ].sort((a, b) => a.at.getTime() - b.at.getTime());
    const last = feed[feed.length - 1];
    return { id: d.id, title: d.title, client: d.client, token: d.token, feed, lastAt: last?.at ?? d.createdAt, toAnswer: !!last && !last.mine, open: d.comments.filter((c) => !c.resolved).length };
  });
  convs.sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
  return NextResponse.json(convs);
}
