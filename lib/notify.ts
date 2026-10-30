import webpush from "web-push";
import { db } from "@/lib/db";
import { getEvents } from "@/lib/events";
import { GMAIL_SCOPE, sendGmail } from "@/lib/google";
import { sampleTwitch } from "@/lib/social";

export const TZ = "Europe/Paris";

export const pushConfigured = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

export const getSettings = () => db.notifSettings.upsert({ where: { id: 1 }, create: {}, update: {} });

// Date et heure actuelles à Paris
export function parisNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date()).map((p) => [p.type, p.value])
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute) };
}

const time = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

type Push = { title: string; body: string; url?: string; tag?: string };

// Envoie une notification à tous les appareils abonnés ; retire ceux qui ne sont plus valides
export async function sendPush(msg: Push) {
  if (!pushConfigured()) throw new Error("Notifications non configurées (clés VAPID manquantes)");
  webpush.setVapidDetails("mailto:notifications@maderino.app", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  const subs = await db.pushSub.findMany();
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg));
      sent++;
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) await db.pushSub.delete({ where: { id: s.id } }).catch(() => {});
    }
  }));
  return sent;
}

// Compte Google utilisable pour envoyer les mails (connecté avec l'autorisation Gmail)
export const mailAccount = () => db.googleAccount.findFirst({ where: { scopes: { contains: GMAIL_SCOPE } }, orderBy: { createdAt: "asc" } });

// Contenu du récap du jour
export async function buildDigest(day: string) {
  // Fenêtre large autour du jour, puis filtre sur la date à Paris (gère heure d'été / d'hiver)
  const from = new Date(Date.parse(day) - 3 * 36e5);
  const to = new Date(Date.parse(day) + 27 * 36e5);
  const [{ events }, tasks] = await Promise.all([
    getEvents(from, to),
    db.task.findMany({ where: { status: { notIn: ["done", "waiting"] }, date: { not: null } } }),
  ]);
  const dayOf = (d: Date | null) => d?.toISOString().slice(0, 10) ?? "";
  // Échéance aujourd'hui (date de fin, sinon date) : à rendre aujourd'hui
  const dueToday = tasks.filter((t) => (dayOf(t.endDate) || dayOf(t.date)) === day);
  const todays = tasks.filter((t) => dayOf(t.date) <= day && day <= (dayOf(t.endDate) || dayOf(t.date)) && !dueToday.includes(t));
  const late = tasks
    .map((t) => ({ t, days: Math.round((Date.parse(day) - Date.parse(dayOf(t.endDate) || dayOf(t.date))) / 864e5) }))
    .filter((x) => x.days > 0)
    .sort((a, b) => b.days - a.days);
  const evs = events
    .filter((e) => (e.allDay ? e.start <= day && day < e.end : new Date(e.start).toLocaleDateString("sv-SE", { timeZone: TZ }) === day))
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start));
  return { evs, todays, late, dueToday };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export function digestHtml(day: string, d: Awaited<ReturnType<typeof buildDigest>>, appUrl: string) {
  const title = new Date(day + "T12:00:00Z").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const section = (label: string, rows: string[], color = "#1c1a17") =>
    rows.length
      ? `<h3 style="margin:24px 0 8px;font-size:15px;color:${color}">${label}</h3><table style="width:100%;border-collapse:collapse">${rows.join("")}</table>`
      : "";
  const row = (left: string, right: string, accent = "#e3d8cb") =>
    `<tr><td style="padding:10px 12px;border-left:3px solid ${accent};background:#fffdfa;font-size:14px">${right}</td><td style="width:70px;padding:10px 12px;background:#fffdfa;color:#8a8079;font-size:13px;text-align:right">${left}</td></tr><tr><td style="height:6px"></td></tr>`;
  return `<div style="background:#f1e9df;padding:28px 16px;font-family:Inter,Arial,sans-serif;color:#1c1a17">
  <div style="max-width:560px;margin:0 auto">
    <div style="font-weight:800;font-size:16px"><span style="color:#ff6a00">▶</span> maderino <span style="font-family:Georgia,serif;font-style:italic;font-weight:400;color:#ff6a00">production.</span></div>
    <h1 style="font-size:28px;letter-spacing:-0.03em;margin:18px 0 4px">ta journée <span style="font-family:Georgia,serif;font-style:italic;font-weight:400;color:#ff6a00">${esc(title)}.</span></h1>
    ${section(`En retard (${d.late.length})`, d.late.map((x) => row(`${x.days} j`, `<b style="color:#b42318">${esc(x.t.title)}</b>`, "#e5484d")), "#b42318")}
    ${section(`À rendre aujourd'hui (${d.dueToday.length})`, d.dueToday.map((t) => row("Jour J", `<b>${esc(t.title)}</b>`, "#ff6b00")), "#c2410c")}
    ${section(`Rendez-vous (${d.evs.length})`, d.evs.map((e) => row(e.allDay ? "Journée" : time(e.start), `${esc(e.title)}${e.location ? `<br><span style="color:#8a8079;font-size:12px">${esc(e.location)}</span>` : ""}`, e.color)))}
    ${section(`Tâches du jour (${d.todays.length})`, d.todays.map((t) => row(t.status === "doing" ? "En cours" : "À faire", esc(t.title), "#ff6a00")))}
    ${!d.late.length && !d.evs.length && !d.todays.length && !d.dueToday.length ? `<p style="color:#8a8079">Rien de prévu aujourd'hui. Profite.</p>` : ""}
    <p style="margin-top:28px"><a href="${appUrl}/planning" style="background:#ff6a00;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:600;font-size:14px">Ouvrir le planning</a></p>
  </div></div>`;
}

const once = async (key: string) => {
  try { await db.sentReminder.create({ data: { key } }); return true; } catch { return false; }
};

// Tâche lancée régulièrement : récap du matin + rappels de RDV
export async function runCron(appUrl: string) {
  const s = await getSettings();
  const now = parisNow();
  const log: string[] = [];

  // Récap du matin (une fois par jour, à partir de l'heure choisie)
  if (now.hour >= s.digestHour && s.lastDigestDate !== now.day) {
    await db.notifSettings.update({ where: { id: 1 }, data: { lastDigestDate: now.day } });
    const d = await buildDigest(now.day);
    if (s.emailEnabled && s.emailTo) {
      const acc = await mailAccount();
      if (acc) {
        await sendGmail(acc.id, s.emailTo, `Ton planning du jour · ${d.dueToday.length ? `${d.dueToday.length} à rendre, ` : ""}${d.evs.length} RDV, ${d.todays.length} tâches${d.late.length ? `, ${d.late.length} en retard` : ""}`, digestHtml(now.day, d, appUrl))
          .then(() => log.push("mail récap envoyé"))
          .catch((e) => log.push(`mail : ${e.message}`));
      } else log.push("mail : aucun compte Google avec l'autorisation Gmail");
    }
    if (s.pushEnabled && pushConfigured()) {
      const parts = [`${d.evs.length} RDV`, `${d.todays.length} tâche${d.todays.length > 1 ? "s" : ""}`];
      if (d.dueToday.length) parts.unshift(`${d.dueToday.length} à rendre aujourd'hui`);
      if (s.lateAlert && d.late.length) parts.push(`${d.late.length} en retard`);
      await sendPush({ title: "Ta journée", body: parts.join(" · "), url: "/planning", tag: `digest-${now.day}` });
      log.push("notif récap envoyée");
    }
  }

  // Rappel avant chaque RDV
  if (s.pushEnabled && s.eventReminder > 0 && pushConfigured()) {
    const from = new Date();
    const to = new Date(from.getTime() + (s.eventReminder + 6) * 60_000);
    const { events } = await getEvents(from, to);
    for (const e of events) {
      if (e.allDay) continue;
      const mins = Math.round((new Date(e.start).getTime() - Date.now()) / 60_000);
      if (mins < 0 || mins > s.eventReminder) continue;
      if (!(await once(`ev:${e.id}:${e.start}`))) continue;
      const when = mins <= 1 ? "maintenant" : mins >= 60 ? `dans ${Math.floor(mins / 60)} h${mins % 60 ? ` ${mins % 60}` : ""}` : `dans ${mins} min`;
      await sendPush({
        title: `⏰ ${e.title} ${mins <= 1 ? "commence maintenant" : "commence bientôt"}`,
        body: `Rendez-vous à ${time(e.start)} (${when})${e.location ? `, ${e.location}` : ""}`,
        url: "/planning",
        tag: `ev-${e.id}`,
      });
      log.push(`rappel : ${e.title}`);
    }
  }

  // Rappel avant chaque tâche avec horaire (aujourd'hui, heure de Paris)
  if (s.pushEnabled && s.eventReminder > 0 && pushConfigured()) {
    const nowMin = now.hour * 60 + now.minute;
    const todays = await db.task.findMany({ where: { startTime: { not: "" }, endDate: null, status: { not: "done" }, date: new Date(now.day) } });
    for (const t of todays) {
      const [h, m] = t.startTime.split(":").map(Number);
      const mins = h * 60 + m - nowMin;
      if (mins < 0 || mins > s.eventReminder) continue;
      if (!(await once(`task:${t.id}:${now.day}:${t.startTime}`))) continue;
      const when = mins <= 1 ? "maintenant" : mins >= 60 ? `dans ${Math.floor(mins / 60)} h${mins % 60 ? ` ${mins % 60}` : ""}` : `dans ${mins} min`;
      await sendPush({ title: `⏰ ${t.title} ${mins <= 1 ? "commence maintenant" : "commence bientôt"}`, body: `Tâche à ${t.startTime} (${when})`, url: "/planning", tag: `task-${t.id}` });
      log.push(`rappel tâche : ${t.title}`);
    }
  }

  // Spectateurs Twitch pendant les lives, pour le rapport hebdo
  log.push(...(await sampleTwitch().catch((e) => [`twitch : ${(e as Error).message}`])));

  // Lives : crée une tâche pour chaque jour à venir sans live programmé
  log.push(...(await checkLives(now.day)));

  // Ménage des rappels de plus de 30 jours
  await db.sentReminder.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 30 * 864e5) } } });
  return log;
}

export const LIVE_TASK = "Mettre à jour le planning de stream";

// Agenda des lives choisi, sinon celui dont le nom contient « live »
async function liveCalendar(id: string) {
  const [g, i] = await Promise.all([db.googleCal.findMany(), db.calendar.findMany()]);
  const all = [...g.map((c) => ({ id: c.id, name: c.name })), ...i.map((c) => ({ id: c.id, name: c.name }))];
  return all.find((c) => c.id === id) ?? (id ? undefined : all.find((c) => /live|stream/i.test(c.name)));
}

const addDay = (day: string, n: number) => new Date(Date.parse(day) + n * 864e5).toISOString().slice(0, 10);

export async function checkLives(today: string) {
  const s = await getSettings();
  if (!s.liveDays) return [];
  const cal = await liveCalendar(s.liveCalendar);
  if (!cal) return [];
  const days = Array.from({ length: s.liveDays }, (_, i) => addDay(today, i + 1));
  const { events } = await getEvents(new Date(Date.parse(today) - 3 * 36e5), new Date(Date.parse(days[days.length - 1]) + 27 * 36e5));
  // Tout événement de cet agenda compte, y compris « Day off » ou « Pas de stream » : le jour est alors traité
  const lives = events.filter((e) => e.calendar === cal.name);
  const dayOf = (iso: string) => (iso.length === 10 ? iso : new Date(iso).toLocaleDateString("sv-SE", { timeZone: TZ }));
  const covered = new Set(lives.flatMap((e) => {
    if (!e.allDay) return [dayOf(e.start)];
    const out: string[] = [];
    for (let d = e.start; d < e.end && out.length < 60; d = addDay(d, 1)) out.push(d);
    return out;
  }));
  const log: string[] = [];
  const missing = days.filter((d) => !covered.has(d));
  if (!missing.length) return log;
  const label = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
  const notes = `Pas de live prévu dans « ${cal.name} » : ${missing.map(label).join(", ")}`;
  // Une seule tâche ouverte à la fois : on met à jour ses notes plutôt que d'en créer une autre
  const open = await db.task.findFirst({ where: { title: LIVE_TASK, status: { not: "done" } } });
  if (open) await db.task.update({ where: { id: open.id }, data: { notes } });
  else {
    await db.task.create({ data: { title: LIVE_TASK, notes, category: s.liveCategory || "Gaming", status: "todo", date: new Date(today) } });
    log.push("tâche « planning de stream » créée");
  }
  // Une notification par jour au maximum
  if (s.pushEnabled && pushConfigured() && (await once(`live:${today}`)))
    await sendPush({ title: "📺 Mettre à jour le planning de stream", body: `Aucun live prévu ${missing.length > 1 ? "les" : "le"} ${missing.map(label).join(", ")}.`, url: "/planning", tag: `live-${today}` }).catch(() => {});
  return log;
}
