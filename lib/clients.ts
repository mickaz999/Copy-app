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
