import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { PUBLIC_URL, slugify } from "@/lib/site";

export type Item = { label: string; qty: number; price: number };

export const itemsOf = (raw: string): Item[] => {
  try { return (JSON.parse(raw || "[]") as Item[]).map((i) => ({ label: String(i.label ?? ""), qty: Number(i.qty) || 0, price: Number(i.price) || 0 })); } catch { return []; }
};
export const totalOf = (items: Item[]) => Math.round(items.reduce((s, i) => s + i.qty * i.price, 0) * 100) / 100;
export const euro = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
export const invoiceUrl = (i: { token: string; client: string; number: string }) => `${PUBLIC_URL}/f/${slugify(`${i.number}-${i.client}`) || "facture"}-${i.token}`;
export const newToken = () => randomBytes(12).toString("base64url").slice(0, 16);
export const getConfig = () => db.invoiceConfig.upsert({ where: { id: 1 }, create: {}, update: {} });

// Numéro suivant de l'année : F-2026-001, F-2026-002…
export async function nextNumber(d = new Date()) {
  const y = d.getFullYear();
  const last = await db.invoice.findMany({ where: { number: { startsWith: `F-${y}-` } }, select: { number: true } });
  const n = last.reduce((m, i) => Math.max(m, Number(i.number.split("-")[2]) || 0), 0) + 1;
  return `F-${y}-${String(n).padStart(3, "0")}`;
}
