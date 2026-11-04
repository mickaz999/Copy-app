import type { Delivery, DeliveryComment } from "@prisma/client";
import { db } from "@/lib/db";
import { fio } from "@/lib/frameio";
import { getSettings, parisNow, sendPush } from "@/lib/notify";

type Sub = { id: string; title: string; done: boolean };
const tc = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const addDays = (day: string, n: number) => new Date(Date.parse(day) + n * 864e5).toISOString().slice(0, 10);
const subTitle = (c: DeliveryComment) => `${c.time !== null ? `${tc(c.time)} · ` : ""}${c.text}${c.author ? ` (${c.author})` : ""}`;

// Retour client → sous-tâche de la tâche « Modifs V(n+1) » liée à la livraison (créée au premier retour)
export async function commentToTask(d: Delivery, c: DeliveryComment) {
  const map: Record<string, string> = JSON.parse(d.tasks || "{}");
  let task = map[c.version] ? await db.task.findUnique({ where: { id: map[c.version] } }) : null;
  if (!task) {
    const today = parisNow().day;
    task = await db.task.create({
      data: {
        title: `Modifs V${c.version + 1} · ${d.title}`, category: "Clients", status: "todo",
        date: new Date(today), endDate: new Date(addDays(today, 2)), deliveryId: d.id,
        notes: `Retours ${d.client ? `de ${d.client} ` : ""}sur la V${c.version}${d.mode === "frame" ? " (commentaires Frame.io)" : ""}.`,
      },
    });
    map[c.version] = task.id;
    await db.delivery.update({ where: { id: d.id }, data: { tasks: JSON.stringify(map) } });
  }
  const subs: Sub[] = JSON.parse(task.subtasks || "[]");
  if (subs.some((s) => s.id === `c:${c.id}`)) return;
  subs.push({ id: `c:${c.id}`, title: subTitle(c), done: c.resolved });
  // Nouveau retour sur une tâche déjà terminée : elle repart en « à faire »
  await db.task.update({ where: { id: task.id }, data: { subtasks: JSON.stringify(subs), ...(task.status === "done" ? { status: "todo" } : {}) } });
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
export async function syncTaskToComments(task: { deliveryId: string; subtasks: string }) {
  if (!task.deliveryId) return;
  for (const s of JSON.parse(task.subtasks || "[]") as Sub[])
    if (s.id.startsWith("c:")) await db.deliveryComment.updateMany({ where: { id: s.id.slice(2), deliveryId: task.deliveryId }, data: { resolved: s.done } });
}

// Récupère les nouveaux commentaires laissés directement sur Frame.io (vidéos liées)
export async function pullFrameComments(only?: string) {
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
