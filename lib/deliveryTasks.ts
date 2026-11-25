import type { Delivery, DeliveryComment } from "@prisma/client";
import { db } from "@/lib/db";
import { dropExpiry, expiryOf, fio } from "@/lib/frameio";
import { sendGmail } from "@/lib/google";
import { emailsOf, mailHtml, nameKey, spaceUrl } from "@/lib/clients";
import { deliveryUrl, dropUrl } from "@/lib/site";
import { getSettings, mailAccount, parisNow, sendPush } from "@/lib/notify";

type Sub = { id: string; title: string; done: boolean };
const tc = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const addDays = (day: string, n: number) => new Date(Date.parse(day) + n * 864e5).toISOString().slice(0, 10);
const subTitle = (c: DeliveryComment) => `${c.time !== null ? `${tc(c.time)} · ` : ""}${c.audio ? "Message vocal, à écouter dans Livraisons" : c.text}${c.author ? ` (${c.author})` : ""}`;

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

// Liens de livraison expirés depuis plus de 7 jours : supprimés (les fichiers restent sur Frame.io)
export async function purgeExpiredDeliveries() {
  const list = await db.delivery.findMany({ where: { mode: "page" }, select: { id: true, createdAt: true, expiresAt: true } });
  const old = list.filter((d) => (d.expiresAt ?? new Date(d.createdAt.getTime() + 30 * 864e5)).getTime() + 7 * 864e5 < Date.now()).map((d) => d.id);
  if (old.length) await db.delivery.deleteMany({ where: { id: { in: old } } });
  return old.length;
}

// Notification « le client télécharge » : une seule toutes les 30 min par livraison (« Tout télécharger » = 1 notif)
export async function notifyDownload(d: { id: string; title: string; client: string }, what: string) {
  const key = `dl-${d.id}-${Math.floor(Date.now() / (30 * 60_000))}`;
  try { await db.sentReminder.create({ data: { key } }); } catch { return; }
  const s = await getSettings();
  if (s.pushEnabled) await sendPush({ title: `Téléchargement · ${d.title}`, body: `${d.client || "Le client"} télécharge ${what}.`, url: "/livraisons", tag: key }).catch(() => {});
}

// Tâche « Dérusher » d'un lien de dépôt : une seule (non terminée) par lien, les fichiers reçus en sous-tâches
const gbOf = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} Go` : `${Math.max(1, Math.round(n / 1e6))} Mo`);
export async function dropTask(l: { id: string; title: string; folderName: string }, names: string[], who: string, total: number) {
  const title = `Dérusher · ${l.title}`;
  const existing = await db.task.findMany({ where: { title, status: { not: "done" } }, orderBy: { createdAt: "asc" } });
  const line = `${who} a déposé ${names.length} fichier(s) (${gbOf(total)}) dans le dossier Frame.io « ${l.folderName} ».`;
  const add = names.map((n, i) => ({ id: `r${Date.now()}${i}`, title: n, done: false }));
  if (!existing.length) {
    await db.task.create({ data: { title, category: "Clients", status: "todo", date: new Date(parisNow().day), notes: line, subtasks: JSON.stringify(add) } });
    return;
  }
  const [keep, ...dups] = existing;
  const subs: Sub[] = JSON.parse(keep.subtasks || "[]");
  const notes = [keep.notes];
  for (const t of dups) { subs.push(...(JSON.parse(t.subtasks || "[]") as Sub[])); if (t.notes) notes.push(t.notes); }
  for (const x of add) if (!subs.some((s) => s.title === x.title)) subs.push(x);
  notes.push(line);
  await db.task.update({ where: { id: keep.id }, data: { subtasks: JSON.stringify(subs), notes: notes.filter(Boolean).join("\n") } });
  if (dups.length) await db.task.deleteMany({ where: { id: { in: dups.map((t) => t.id) } } });
}

// Nettoyage : les tâches « Dérusher » en double (une par envoi) sont fusionnées en une seule par projet
export async function mergeDropTasks() {
  const all = await db.task.findMany({ where: { title: { startsWith: "Dérusher · " } }, orderBy: { createdAt: "asc" } });
  const groups = new Map<string, typeof all>();
  for (const t of all) groups.set(t.title, [...(groups.get(t.title) ?? []), t]);
  let removed = 0;
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const [keep, ...dups] = list;
    const subs: Sub[] = JSON.parse(keep.subtasks || "[]");
    for (const t of dups) for (const x of JSON.parse(t.subtasks || "[]") as Sub[]) if (!subs.some((s) => s.title === x.title)) subs.push(x);
    const done = list.every((t) => t.status === "done");
    await db.task.update({ where: { id: keep.id }, data: { subtasks: JSON.stringify(subs), status: done ? "done" : keep.status === "done" ? "todo" : keep.status } });
    await db.task.deleteMany({ where: { id: { in: dups.map((t) => t.id) } } });
    removed += dups.length;
  }
  return removed;
}

// Relance par mail avant la fin de validité : 7 jours puis la veille
// Destinataires : personnes qui ont ouvert le lien + mails connus du client (fiche client)
export async function remindExpiringDeliveries(_appUrl?: string) {
  const acc = await mailAccount();
  if (!acc) return 0;
  const [list, clients] = await Promise.all([
    db.delivery.findMany({ where: { mode: "page" }, include: { viewers: true } }),
    db.client.findMany(),
  ]);
  let sent = 0;
  for (const d of list) {
    const left = expiryOf(d).getTime() - Date.now();
    if (left <= 0) continue;
    const stage = left <= 864e5 ? 1 : left <= 7 * 864e5 ? 7 : 0;
    if (!stage) continue;
    const c = clients.find((x) => x.nameKey === nameKey(d.client));
    const to = Array.from(new Set([...d.viewers.map((v) => v.email), ...(c ? emailsOf(c) : [])]));
    if (!to.length) continue;
    const end = expiryOf(d).toLocaleString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
    const link = c ? spaceUrl(c) : deliveryUrl(d);
    const fresh = Date.now() - d.createdAt.getTime() < 864e5; // livraison toute neuve : pas de rappel « 7 jours » dès sa création
    for (const email of to) {
      if (stage === 7 && fresh) continue;
      const key = `livexp-${d.id}-${email}-${stage}`;
      try { await db.sentReminder.create({ data: { key } }); } catch { continue; }
      const subject = stage === 1 ? `Dernier jour pour télécharger « ${d.title} »` : `Pense à télécharger « ${d.title} » (encore 7 jours)`;
      const html = mailHtml(stage === 1 ? "Ton lien expire demain" : "Ton lien expire dans 7 jours",
        [`La livraison <b>${escHtml(d.title)}</b> ne sera plus accessible après le <b>${end}</b> (heure de Paris).`, "Pense à télécharger tes fichiers avant cette date."],
        "Télécharger mes fichiers", link);
      await sendGmail(acc.id, email, subject, html).then(() => sent++).catch(() => db.sentReminder.delete({ where: { key } }).catch(() => {}));
    }
  }
  return sent;
}
const escHtml = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

// Lien de dépôt ouvert, aucun fichier reçu, moins de 24 h avant la fin : un rappel par mail (une fois)
export async function remindEmptyDrops() {
  const acc = await mailAccount();
  const [list, clients] = await Promise.all([
    db.dropLink.findMany({ where: { active: true }, include: { _count: { select: { files: true } } } }),
    db.client.findMany(),
  ]);
  let sent = 0;
  for (const l of list) {
    if (l._count.files > 0) continue;
    const left = dropExpiry(l).getTime() - Date.now();
    if (left <= 0 || left > 864e5) continue;
    const c = clients.find((x) => x.nameKey === nameKey(l.client));
    const to = c ? emailsOf(c) : [];
    if (!to.length) {
      // Pas de mail client connu : on te prévient (une fois) pour que tu relances toi-même
      const key = `dropempty-nomail-${l.id}`;
      try { await db.sentReminder.create({ data: { key } }); } catch { continue; }
      await sendPush({ title: `Dépôt vide · ${l.title}`, body: `${l.client || "Lien sans client"} : aucun rush déposé, le lien ferme dans moins de 24 h. Pas de mail client enregistré, relance-le toi-même.`, url: "/clients", tag: key }).catch(() => db.sentReminder.delete({ where: { key } }).catch(() => {}));
      continue;
    }
    const end = dropExpiry(l).toLocaleString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
    if (!acc) continue;
    for (const email of to) {
      const key = `dropempty-${l.id}-${email}`;
      try { await db.sentReminder.create({ data: { key } }); } catch { continue; }
      const html = mailHtml("N'oublie pas de déposer tes rushs",
        [`Le lien de dépôt <b>${escHtml(l.title)}</b> est encore vide, et il ferme le <b>${end}</b> (heure de Paris).`, "Il te reste 24 h pour y déposer tes fichiers."],
        "Déposer mes rushs", c ? spaceUrl(c) : dropUrl(l));
      await sendGmail(acc.id, email, `Il te reste 24 h pour déposer tes rushs · ${l.title}`, html).then(() => sent++).catch(() => db.sentReminder.delete({ where: { key } }).catch(() => {}));
    }
  }
  return sent;
}
