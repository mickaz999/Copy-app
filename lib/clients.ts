import { dropExpiry, expiryOf } from "@/lib/frameio";
import { sendGmail } from "@/lib/google";
import { mailAccount } from "@/lib/notify";
import { PUBLIC_URL } from "@/lib/site";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";

export const nameKey = (n: string) => n.trim().toLowerCase();
export const emailsOf = (c: { emails: string }) => { try { return JSON.parse(c.emails || "[]") as string[]; } catch { return []; } };

// Fiche client (créée au besoin) pour un nom de client de livraison
export async function clientFor(name: string) {
  const k = nameKey(name);
  if (!k) return null;
  const found = await db.client.findUnique({ where: { nameKey: k } });
  if (found) return found;
  try { return await db.client.create({ data: { nameKey: k, name: name.trim(), key: randomBytes(9).toString("base64url") } }); }
  catch { return db.client.findUnique({ where: { nameKey: k } }); }
}

export async function addClientEmail(name: string, email: string) {
  const c = await clientFor(name);
  if (!c) return;
  const list = emailsOf(c);
  if (!list.includes(email)) await db.client.update({ where: { id: c.id }, data: { emails: JSON.stringify([...list, email]) } });
}

// ——— Espace client et mails au client ———

export const spaceUrl = (c: { key: string }) => `${PUBLIC_URL}/c/${c.key}`;
const esc = (t: string) => t.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]!));

// Ce qui est en cours pour un client : livraisons (page) et dépôts actifs, non expirés
export async function clientItems(nk: string) {
  const [ds, drops] = await Promise.all([
    db.delivery.findMany({ where: { mode: "page" }, orderBy: { createdAt: "desc" } }),
    db.dropLink.findMany({ where: { active: true }, orderBy: { createdAt: "desc" } }),
  ]);
  const now = Date.now();
  return {
    deliveries: ds.filter((d) => nameKey(d.client) === nk && expiryOf(d).getTime() > now),
    drops: drops.filter((d) => nameKey(d.client) === nk && dropExpiry(d).getTime() > now),
  };
}

export function mailHtml(title: string, lines: string[], button: string, href: string) {
  return `<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:auto;color:#1c1814">
    <h2 style="margin:0 0 12px">${title}</h2>
    <p>Bonjour,</p>
    ${lines.map((l) => `<p>${l}</p>`).join("")}
    <p style="margin-top:24px"><a href="${href}" style="background:#ff6a00;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:600;font-size:14px">${button}</a></p>
  </div>`;
}

// « Nouvelle livraison » / « Nouveau lien de dépôt » : mail à tous les mails connus du client
export async function notifyClient(kind: "delivery" | "drop", id: string) {
  const acc = await mailAccount();
  if (!acc) throw new Error("Aucun compte Google avec l'autorisation Gmail.");
  const item = kind === "delivery" ? await db.delivery.findUnique({ where: { id } }) : await db.dropLink.findUnique({ where: { id } });
  if (!item || !item.client.trim()) throw new Error("Indique d'abord le client.");
  const c = await clientFor(item.client);
  const to = c ? emailsOf(c) : [];
  if (!c || !to.length) throw new Error(`Aucun mail pour « ${item.client} » : ajoute-le dans sa fiche (page Clients).`);
  const t = esc(item.title);
  const [subject, html] = kind === "delivery"
    ? [`Nouvelle livraison · ${item.title}`, mailHtml("Ta livraison est en ligne", [`<b>${t}</b> t'attend sur ton espace.`, "Tu peux la regarder, laisser tes retours et la valider."], "Voir ma livraison", spaceUrl(c))]
    : [`Envoie-moi tes fichiers · ${item.title}`, mailHtml("Tu peux déposer tes fichiers", [`Un espace de dépôt <b>${t}</b> est ouvert pour toi.`, "Dépose tes rushs directement depuis ton espace, ils m'arrivent tout de suite."], "Déposer mes fichiers", spaceUrl(c))];
  for (const e of to) await sendGmail(acc.id, e, subject, html);
  return to.length;
}
