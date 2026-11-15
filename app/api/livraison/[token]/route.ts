import { NextResponse } from "next/server";
import { COOKIE as SESSION, verifyToken } from "@/lib/auth";
import { db } from "@/lib/db";
import { canDownload, expiryOf, fileMedia, isExpired, pool } from "@/lib/frameio";
import { getSettings, sendPush } from "@/lib/notify";
import { commentToTask } from "@/lib/deliveryTasks";
import { publicMessages, saveAudio } from "@/lib/deliveryMessages";
import { addClientEmail, emailsOf, nameKey, spaceFor, spacePath } from "@/lib/clients";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type F = { fileId: string; name: string };
const find = (token: string) => db.delivery.findUnique({ where: { token }, include: { comments: { orderBy: { createdAt: "asc" } }, messages: { orderBy: { createdAt: "asc" } } } });

// Page client (sans connexion) : versions avec leurs liens de lecture Frame.io, commentaires
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const d = await find(params.token);
  if (!d) return NextResponse.json({ error: "Lien de livraison invalide." }, { status: 404 });
  if (isExpired(d)) return NextResponse.json({ error: "Ce lien de livraison a expiré. Demande-moi un nouveau lien si besoin.", expired: true }, { status: 410 });
  // Mail demandé avant de visionner (pour la relance avant la fin de validité)
  // Une seule fois : le mail déjà donné (sur n'importe quel lien) est repris automatiquement
  const cookie = req.headers.get("cookie")?.match(/(?:^|;\s*)liv_viewer=([^;]+)/)?.[1];
  let email = cleanEmail(req.headers.get("x-viewer")) || cleanEmail(cookie ? decodeURIComponent(cookie) : "");
  // Client récurrent (mail déjà dans sa fiche) : rien à demander, y compris sur les liens déjà envoyés
  let fromClient = false;
  if (!email && d.client) {
    const c = await db.client.findUnique({ where: { nameKey: nameKey(d.client) } });
    if (c && emailsOf(c)[0]) { email = emailsOf(c)[0]; fromClient = true; }
  }
  // Moi (connecté à l'app) : je vois le lien sans mail, sans être compté comme visiteur
  const admin = await verifyToken(req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${SESSION}=([^;]+)`))?.[1]);
  if (!email && !admin) return NextResponse.json({ needEmail: true, title: d.title, client: d.client, expiresAt: expiryOf(d) }, { status: 401 });
  if (email && !admin && !(await db.deliveryViewer.findUnique({ where: { deliveryId_email: { deliveryId: d.id, email } } }))) await addViewer(d, email);
  const files: F[] = JSON.parse(d.files);
  const versions = await pool(files, 6, async (f, i) => {
    try {
      const m = await fileMedia(d.accountId, f.fileId);
      const dl = canDownload(d, i + 1);
      // Choix de qualité : proxies HD / léger, et l'original quand le téléchargement est débloqué
      const qualities = [
        ...(m.hq && dl ? [{ key: "hq", label: "HD", url: m.hq }] : []),
        ...(m.efficient ? [{ key: "light", label: "Léger", url: m.efficient }] : []),
        ...(dl && m.originalPlay && m.originalPlay !== m.hq ? [{ key: "original", label: "Original", url: m.originalPlay }] : []),
      ];
      return { qualities, v: i + 1, name: f.name || m.name, mediaType: m.mediaType, play: canDownload(d, i + 1) ? m.play : m.light, thumb: m.thumb, original: canDownload(d, i + 1) ? m.original : "", locked: d.download && !canDownload(d, i + 1), old: d.kind !== "videos" && i + 1 < files.length, ready: !!m.play };
    } catch {
      return { v: i + 1, name: f.name, mediaType: "", play: "", thumb: "", original: "", ready: false };
    }
  });
  const res = NextResponse.json({
    messages: publicMessages(params.token, d.messages),
    space: spacePath(await spaceFor(d.client)),
    expiresAt: expiryOf(d), folderId: d.folderId, feedback: d.feedback, reviewUrl: (await getSettings()).reviewUrl,
    title: d.title, client: d.client, kind: d.kind, approved: JSON.parse(d.approved || "[]"), networks: JSON.parse(d.networks || "[]"), message: d.message, createdAt: d.createdAt, download: d.download, dlMode: d.dlMode, validation: d.validation, approvedV: d.approvedV, approvedAt: d.approvedAt, versions,
    comments: d.comments.map((c) => ({ audio: c.audio ? `/api/livraison/${params.token}/audio?id=${c.id}` : "", fileId: c.fileId, fileName: c.fileName, id: c.id, version: c.version, author: c.author, text: c.text, time: c.time, resolved: c.resolved, createdAt: c.createdAt })),
  });
  if (fromClient && !admin) res.cookies.set("liv_viewer", email, { path: "/", maxAge: 5 * 365 * 864e2, sameSite: "lax", secure: true, httpOnly: true });
  return res;
}

const cleanEmail = (v: unknown) => {
  const e = String(v ?? "").trim().toLowerCase().slice(0, 200);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : "";
};

async function addViewer(d: { id: string; title: string; client: string }, email: string) {
  if (d.client) await addClientEmail(d.client, email).catch(() => {});
  try { await db.deliveryViewer.create({ data: { deliveryId: d.id, email } }); } catch { return; } // déjà enregistré
  await notify(`Lien ouvert · ${d.title}`, `${email} a ouvert la livraison.`);
}

async function notify(title: string, body: string) {
  const s = await getSettings();
  if (s.pushEnabled) await sendPush({ title, body, url: "/livraisons", tag: `liv-${Date.now()}` }).catch(() => {});
}

// { action: "comment", version, author, text, time } | { action: "approve", version, author }
export async function POST(req: Request, { params }: { params: { token: string } }) {
  const d = await find(params.token);
  if (!d) return NextResponse.json({ error: "Lien de livraison invalide." }, { status: 404 });
  if (isExpired(d)) return NextResponse.json({ error: "Ce lien de livraison a expiré." }, { status: 410 });
  const b = await req.json().catch(() => ({}));
  if (b.action === "viewer") {
    const email = cleanEmail(b.email);
    if (!email) return NextResponse.json({ error: "Adresse mail invalide." }, { status: 400 });
    await addViewer(d, email);
    const res = NextResponse.json({ ok: true, email });
    res.cookies.set("liv_viewer", email, { path: "/", maxAge: 5 * 365 * 864e2, sameSite: "lax", secure: true, httpOnly: true });
    return res;
  }
  const count = (JSON.parse(d.files) as F[]).length;
  const version = Math.min(count, Math.max(1, Number(b.version) || count));
  const author = String(b.author ?? "").trim().slice(0, 80) || d.client || "Client";
  // Réponse du client à mon message (texte ou vocal), indépendante des retours sur la vidéo
  if (b.action === "reply") {
    if (!d.messages.some((m) => m.fromMe)) return NextResponse.json({ error: "Rien à répondre." }, { status: 400 });
    try {
      const audio = await saveAudio(b.audio);
      const text = String(b.text ?? "").trim().slice(0, 3000);
      if (!audio && !text) return NextResponse.json({ error: "Écris ou enregistre ta réponse." }, { status: 400 });
      const m = await db.deliveryMessage.create({ data: { deliveryId: d.id, fromMe: false, author, text, audio } });
      await notify(`Réponse · ${d.title}`, `${author} : ${audio && !text ? "message vocal" : text.slice(0, 140)}`);
      return NextResponse.json(m);
    } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  }
  if (b.action === "comment") {
    if (d.feedback === "off") return NextResponse.json({ error: "Les retours sont fermés pour cette livraison." }, { status: 403 });
    // Message vocal : envoyé en base64 (3 min max), gardé dans Media
    let audio = "";
    if (b.audio) {
      const m = String(b.audio).match(/^data:(audio\/[\w.+-]+)(?:;[^,]*)?;base64,(.+)$/);
      if (!m || m[2].length > 4_000_000) return NextResponse.json({ error: "Message vocal trop long (3 min max)." }, { status: 400 });
      audio = (await db.media.create({ data: { mime: m[1], data: Buffer.from(m[2], "base64") } })).id;
    }
    const text = String(b.text ?? "").trim().slice(0, 3000) || (audio ? "Message vocal" : "");
    if (!text) return NextResponse.json({ error: "Écris ton commentaire." }, { status: 400 });
    const time = Number.isFinite(Number(b.time)) && b.time !== null && b.time !== "" ? Math.max(0, Number(b.time)) : null;
    const c = await db.deliveryComment.create({ data: { deliveryId: d.id, version: d.kind === "folder" ? 1 : version, author, text, time, audio, fileId: String(b.fileId ?? "").slice(0, 100), fileName: String(b.fileName ?? "").slice(0, 300) } });
    await commentToTask(d, c).catch(() => {});
    await notify(`Retour sur « ${d.title} »`, `${author} (V${version}) : ${text.slice(0, 120)}`);
    return NextResponse.json(c);
  }
  if (b.action === "approve") {
    if (d.kind === "videos") {
      // Plusieurs vidéos : chacune se valide séparément
      const list = Array.from(new Set([...(JSON.parse(d.approved || "[]") as number[]), version])).sort((a, b) => a - b);
      await db.delivery.update({ where: { id: d.id }, data: { approved: JSON.stringify(list), ...(list.length === count ? { approvedAt: new Date() } : {}) } });
      const name = (JSON.parse(d.files) as F[])[version - 1]?.name ?? `vidéo ${version}`;
      await notify(`« ${name} » validée`, `${author} · ${list.length}/${count} vidéos validées (${d.title}).`);
      return NextResponse.json({ ok: true, approved: list });
    }
    await db.delivery.update({ where: { id: d.id }, data: { approvedAt: new Date(), approvedV: version } });
    await notify(`« ${d.title} » validé`, `${author} a validé la V${version}.`);
    return NextResponse.json({ ok: true, approvedV: version });
  }
  return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
}
