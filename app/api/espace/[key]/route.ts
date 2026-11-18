import { NextResponse } from "next/server";
import { COOKIE as SESSION, verifyToken } from "@/lib/auth";
import { db } from "@/lib/db";
import { keyFromSlug, addClientEmail, clientItems, emailsOf } from "@/lib/clients";
import { dropExpiry, expiryOf, fileMedia, pool } from "@/lib/frameio";
import { getSettings, sendPush } from "@/lib/notify";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const cleanEmail = (v: unknown) => {
  const e = String(v ?? "").trim().toLowerCase().slice(0, 200);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : "";
};
const COOKIE = { path: "/", maxAge: 5 * 365 * 864e2, sameSite: "lax" as const, secure: true, httpOnly: true };

// Espace client : toutes ses livraisons et dépôts en cours (les expirés disparaissent)
export async function GET(req: Request, { params }: { params: { key: string } }) {
  const c = await db.client.findUnique({ where: { key: keyFromSlug(params.key) } });
  if (!c) return NextResponse.json({ error: "Lien invalide." }, { status: 404 });
  const cookie = req.headers.get("cookie")?.match(/(?:^|;\s*)liv_viewer=([^;]+)/)?.[1];
  const email = cleanEmail(req.headers.get("x-viewer")) || cleanEmail(cookie ? decodeURIComponent(cookie) : "");
  // Mail demandé une seule fois : déjà donné sur cet appareil, ou déjà connu dans la fiche client
  const admin = await verifyToken(req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${SESSION}=([^;]+)`))?.[1]);
  if (!email && !admin && !emailsOf(c).length) return NextResponse.json({ needEmail: true, name: c.name }, { status: 401 });
  if (email && !admin) await addClientEmail(c.name, email).catch(() => {});
  const { deliveries, drops } = await clientItems(c.nameKey);
  const items = await pool(deliveries, 6, async (d) => {
    const files: { fileId: string }[] = JSON.parse(d.files || "[]");
    let thumb = "";
    // Vignette : 4 s max par livraison, pour que l'espace s'ouvre même si Frame.io est lent
    if (files.length) thumb = await Promise.race([fileMedia(d.accountId, files[files.length - 1].fileId).then((m) => m.thumb), new Promise<string>((r) => setTimeout(() => r(""), 4000))]).catch(() => "");
    const approved = d.kind === "videos" ? (JSON.parse(d.approved || "[]") as number[]).length === files.length && files.length > 0 : !!d.approvedV;
    return { token: d.token, title: d.title, thumb, kind: d.kind, count: files.length, approved, validation: d.validation, expiresAt: expiryOf(d), createdAt: d.createdAt };
  });
  const res = NextResponse.json({
    name: c.name,
    deliveries: items,
    drops: drops.map((l) => ({ token: l.token, title: l.title, expiresAt: dropExpiry(l), createdAt: l.createdAt })),
  });
  if (email && !cookie && !admin) res.cookies.set("liv_viewer", email, COOKIE);
  return res;
}

// { email } : première visite, le mail est gardé dans la fiche et sur l'appareil
export async function POST(req: Request, { params }: { params: { key: string } }) {
  const c = await db.client.findUnique({ where: { key: keyFromSlug(params.key) } });
  if (!c) return NextResponse.json({ error: "Lien invalide." }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const email = cleanEmail(b.email);
  if (!email) return NextResponse.json({ error: "Adresse mail invalide." }, { status: 400 });
  const known = emailsOf(c).includes(email);
  await addClientEmail(c.name, email);
  if (!known) {
    const s = await getSettings();
    if (s.pushEnabled) await sendPush({ title: `Espace ouvert · ${c.name}`, body: `${email} a ouvert son espace client.`, url: "/clients", tag: `esp-${c.id}` }).catch(() => {});
  }
  const res = NextResponse.json({ ok: true, email });
  res.cookies.set("liv_viewer", email, COOKIE);
  return res;
}
