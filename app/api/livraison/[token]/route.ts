import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fileMedia } from "@/lib/frameio";
import { getSettings, sendPush } from "@/lib/notify";

export const dynamic = "force-dynamic";

type F = { fileId: string; name: string };
const find = (token: string) => db.delivery.findUnique({ where: { token }, include: { comments: { orderBy: { createdAt: "asc" } } } });

// Page client (sans connexion) : versions avec leurs liens de lecture Frame.io, commentaires
export async function GET(_: Request, { params }: { params: { token: string } }) {
  const d = await find(params.token);
  if (!d) return NextResponse.json({ error: "Lien de livraison invalide." }, { status: 404 });
  const files: F[] = JSON.parse(d.files);
  const versions = await Promise.all(files.map(async (f, i) => {
    try {
      const m = await fileMedia(d.accountId, f.fileId);
      return { v: i + 1, name: f.name || m.name, mediaType: m.mediaType, play: m.play, thumb: m.thumb, original: d.download ? m.original : "", ready: !!m.play };
    } catch {
      return { v: i + 1, name: f.name, mediaType: "", play: "", thumb: "", original: "", ready: false };
    }
  }));
  return NextResponse.json({
    title: d.title, client: d.client, networks: JSON.parse(d.networks || "[]"), message: d.message, createdAt: d.createdAt, download: d.download, approvedV: d.approvedV, approvedAt: d.approvedAt, versions,
    comments: d.comments.map((c) => ({ id: c.id, version: c.version, author: c.author, text: c.text, time: c.time, resolved: c.resolved, createdAt: c.createdAt })),
  });
}

async function notify(title: string, body: string) {
  const s = await getSettings();
  if (s.pushEnabled) await sendPush({ title, body, url: "/livraisons", tag: `liv-${Date.now()}` }).catch(() => {});
}

// { action: "comment", version, author, text, time } | { action: "approve", version, author }
export async function POST(req: Request, { params }: { params: { token: string } }) {
  const d = await find(params.token);
  if (!d) return NextResponse.json({ error: "Lien de livraison invalide." }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const count = (JSON.parse(d.files) as F[]).length;
  const version = Math.min(count, Math.max(1, Number(b.version) || count));
  const author = String(b.author ?? "").trim().slice(0, 80) || d.client || "Client";
  if (b.action === "comment") {
    const text = String(b.text ?? "").trim().slice(0, 3000);
    if (!text) return NextResponse.json({ error: "Écris ton commentaire." }, { status: 400 });
    const time = Number.isFinite(Number(b.time)) && b.time !== null && b.time !== "" ? Math.max(0, Number(b.time)) : null;
    const c = await db.deliveryComment.create({ data: { deliveryId: d.id, version, author, text, time } });
    await notify(`Retour sur « ${d.title} »`, `${author} (V${version}) : ${text.slice(0, 120)}`);
    return NextResponse.json(c);
  }
  if (b.action === "approve") {
    await db.delivery.update({ where: { id: d.id }, data: { approvedAt: new Date(), approvedV: version } });
    await notify(`« ${d.title} » validé ✅`, `${author} a validé la V${version}.`);
    return NextResponse.json({ ok: true, approvedV: version });
  }
  return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
}
