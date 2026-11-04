import type { Delivery, DeliveryComment } from "@prisma/client";
import { db } from "@/lib/db";
import { fio } from "@/lib/frameio";
import { getSettings, parisNow, sendPush } from "@/lib/notify";

type Sub = { id: string; title: string; done: boolean };
const tc = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const addDays = (day: string, n: number) => new Date(Date.parse(day) + n * 864e5).toISOString().slice(0, 10);
const subTitle = (c: DeliveryComment) => `${c.time !== null ? `${tc(c.time)} · ` : ""}${c.text}${c.author ? ` (${c.author})` : ""}`;

type VSub = Sub & { video?: number | string };
const videoName = (d: Delivery, v: number) => {
  const f = (JSON.parse(d.files || "[]") as { name: string }[])[v - 1];
  // Nom exact du fichier sur Frame.io, pour s'y retrouver
  return d.kind === "videos" ? f?.name || `Vidéo ${v}` : `V${v}`;
};
// Titre : « Modifs · projet · 4 vidéos à modifier » (vidéos ayant encore des retours non corrigés)
function modifsTitle(d: Delivery, subs: VSub[]) {
  const n = new Set(subs.filter((s) => !s.done).map((s) => s.video ?? 1)).size;
  return `Modifs · ${d.title}${n ? ` · ${n} vidéo${n > 1 ? "s" : ""} à modifier` : ""}`;
}

// Une seule tâche « Modifs » ouverte par livraison : les tâches en double sont fusionnées dans la plus ancienne
async function openModifsTask(d: Delivery) {
  const open = await db.task.findMany({ where: { deliveryId: d.id, status: { not: "done" }, title: { startsWith: "Modifs" } }, orderBy: { createdAt: "asc" } });
  if (open.length <= 1) return open[0] ?? null;
  const [keep, ...rest] = open;
  const subs: VSub[] = JSON.parse(keep.subtasks || "[]");
  for (const t of rest) for (const s of JSON.parse(t.subtasks || "[]") as VSub[]) if (!subs.some((x) => x.id === s.id)) subs.push(s);
  await db.task.update({ where: { id: keep.id }, data: { subtasks: JSON.stringify(subs), title: modifsTitle(d, subs) } });
  await db.task.deleteMany({ where: { id: { in: rest.map((t) => t.id) } } });
  return db.task.findUnique({ where: { id: keep.id } });
}

// Retour client → sous-tâche de la tâche « Modifs » de la livraison (créée au premier retour)
export async function commentToTask(d: Delivery, c: DeliveryComment) {
  let task = await openModifsTask(d);
  if (!task) {
    const today = parisNow().day;
    task = await db.task.create({
      data: {
        title: `Modifs · ${d.title}`, category: "Clients", status: "todo",
        date: new Date(today), endDate: new Date(addDays(today, 2)), deliveryId: d.id,
        notes: `Retours ${d.client ? `de ${d.client} ` : ""}${d.mode === "frame" ? "(commentaires Frame.io)" : "(lien de livraison)"}.`,
      },
    });
  }
  const subs: VSub[] = JSON.parse(task.subtasks || "[]");
  if (subs.some((s) => s.id === `c:${c.id}`)) return;
  const many = d.kind === "videos" || (JSON.parse(d.files || "[]") as unknown[]).length > 1;
  const label = c.fileName || (many ? videoName(d, c.version) : "");
  subs.push({ id: `c:${c.id}`, title: `${label ? `${label} · ` : ""}${subTitle(c)}`, done: c.resolved, video: c.fileId || c.version });
  await db.task.update({ where: { id: task.id }, data: { subtasks: JSON.stringify(subs), title: modifsTitle(d, subs) } });
}

// Fusion des tâches « Modifs » en double créées avant le regroupement
export async function mergeModifsTasks() {
  const ids = await db.task.groupBy({ by: ["deliveryId"], where: { deliveryId: { not: "" }, status: { not: "done" }, title: { startsWith: "Modifs" } }, _count: true });
  for (const g of ids) if (g._count > 1) {
    const d = await db.delivery.findUnique({ where: { id: g.deliveryId } });
    if (d) await openModifsTask(d);
  }
}

// Retour coché « corrigé » dans Livraisons → sous-tâche cochée
export async function syncCommentResolved(c: DeliveryComment) {
  const tasks = await db.task.findMany({ where: { deliveryId: c.deliveryId } });
  for (const t of tasks) {
    const subs: Sub[] = JSON.parse(t.subtasks || "[]");
    const s = subs.find((x) => x.id === `c:${c.id}`);
    if (s && s.done !== c.resolved) { s.done = c.resolved; await db.task.update({ where: { id: t.id }, data: { subtasks: JSON.stringify(subs) } }); }
  }
}

// Sous-tâche cochée dans le Planning → retour marqué « corrigé »
export async function syncTaskToComments(task: { id: string; title: string; deliveryId: string; subtasks: string }) {
  if (!task.deliveryId) return;
  const d = await db.delivery.findUnique({ where: { id: task.deliveryId } });
  if (d && task.title.startsWith("Modifs")) {
    const t = modifsTitle(d, JSON.parse(task.subtasks || "[]"));
    if (t !== task.title) await db.task.update({ where: { id: task.id }, data: { title: t } });
  }
  for (const s of JSON.parse(task.subtasks || "[]") as Sub[])
    if (s.id.startsWith("c:")) await db.deliveryComment.updateMany({ where: { id: s.id.slice(2), deliveryId: task.deliveryId }, data: { resolved: s.done } });
}

// Récupère les nouveaux commentaires laissés directement sur Frame.io (vidéos liées)
export async function pullFrameComments(only?: string) {
  await mergeModifsTasks().catch(() => {});
  const since = new Date(Date.now() - 90 * 864e5);
  const list = await db.delivery.findMany({ where: only ? { id: only } : { createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 30 });
  let added = 0;
  for (const d of list) {
    const files: { fileId: string }[] = JSON.parse(d.files || "[]");
    for (let i = 0; i < files.length; i++) {
      let items: any[] = [];
      try { items = (await fio(`/accounts/${d.accountId}/files/${files[i].fileId}/comments?page_size=100`)).data ?? []; } catch { continue; }
      for (const fc of items) {
        if (!fc?.id || !fc.text) continue;
        if (await db.deliveryComment.findFirst({ where: { deliveryId: d.id, externalId: String(fc.id) } })) continue;
        const raw = fc.timestamp ?? fc.timestamp_seconds ?? null;
        const c = await db.deliveryComment.create({
          data: {
            deliveryId: d.id, version: i + 1, source: "frame", externalId: String(fc.id),
            author: String(fc.owner?.name ?? fc.author?.name ?? fc.owner?.email ?? "Frame.io").slice(0, 80),
            text: String(fc.text).slice(0, 3000), time: raw !== null && Number.isFinite(Number(raw)) ? Number(raw) : null,
            resolved: !!(fc.completed ?? fc.completed_at),
          },
        });
        await commentToTask(d, c);
        added++;
        const s = await getSettings();
        if (s.pushEnabled) await sendPush({ title: `Retour Frame · ${d.title}`, body: `${c.author} (V${c.version}) : ${c.text.slice(0, 120)}`, url: "/planning", tag: `fio-${c.id}` }).catch(() => {});
      }
    }
  }
  return added;
}
