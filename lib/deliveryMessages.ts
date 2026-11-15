import { db } from "@/lib/db";

// Message vocal envoyé en data URL (3 min max) → Media
export async function saveAudio(dataUrl: unknown) {
  if (!dataUrl) return "";
  const m = String(dataUrl).match(/^data:(audio\/[\w.+-]+)(?:;[^,]*)?;base64,(.+)$/);
  if (!m || m[2].length > 4_000_000) throw new Error("Message vocal trop long (3 min max).");
  return (await db.media.create({ data: { mime: m[1], data: Buffer.from(m[2], "base64") } })).id;
}

export const publicMessages = (token: string, list: { id: string; fromMe: boolean; author: string; text: string; audio: string; createdAt: Date }[]) =>
  list.map((m) => ({ id: m.id, fromMe: m.fromMe, author: m.author, text: m.text, audio: m.audio ? `/api/livraison/${token}/msg?id=${m.id}` : "", createdAt: m.createdAt }));
