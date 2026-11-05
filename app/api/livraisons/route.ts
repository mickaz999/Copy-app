import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { nets } from "@/lib/frameio";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("settings")) {
    const s = await db.notifSettings.upsert({ where: { id: 1 }, create: {}, update: {} });
    return NextResponse.json({ reviewUrl: s.reviewUrl });
  }
  const list = await db.delivery.findMany({ orderBy: { createdAt: "desc" }, include: { comments: { orderBy: { createdAt: "asc" } } } });
  // Tâches « Modifs » liées, avec leur avancement
  const tasks = await db.task.findMany({ where: { deliveryId: { in: list.map((d) => d.id) } } });
  return NextResponse.json(list.map((d) => ({
    ...d,
    linked: tasks.filter((t) => t.deliveryId === d.id).map((t) => {
      const subs: { done: boolean }[] = JSON.parse(t.subtasks || "[]");
      return { id: t.id, title: t.title, status: t.status, done: subs.filter((s) => s.done).length, total: subs.length };
    }),
  })));
}

export async function POST(req: Request) {
  const b = await req.json();
  // Lien « laisser un avis Google » montré sur les pages de livraison
  if (b.action === "review-url") {
    const url = String(b.url ?? "").trim();
    if (url && !/^https:\/\//.test(url)) return NextResponse.json({ error: "Lien invalide." }, { status: 400 });
    return NextResponse.json(await db.notifSettings.upsert({ where: { id: 1 }, create: { reviewUrl: url }, update: { reviewUrl: url } }));
  }
  const files = Array.isArray(b.files) ? b.files.map((f: any) => ({ fileId: String(f.fileId), name: String(f.name ?? "") })) : [];
  if (!b.title || !b.accountId || (!files.length && !b.folderId)) return NextResponse.json({ error: "Titre, compte et au moins une vidéo requis." }, { status: 400 });
  return NextResponse.json(await db.delivery.create({
    data: { token: randomBytes(12).toString("base64url"), title: String(b.title).slice(0, 200), client: String(b.client ?? "").slice(0, 200), message: String(b.message ?? "").slice(0, 2000), accountId: String(b.accountId), files: JSON.stringify(files), download: b.download !== false, mode: b.mode === "frame" ? "frame" : "page", kind: b.folderId ? "folder" : b.kind === "videos" ? "videos" : "versions", folderId: String(b.folderId ?? ""), networks: JSON.stringify(nets(b.networks)) },
  }));
}
