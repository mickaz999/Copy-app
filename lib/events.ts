import IcalExpander from "ical-expander";
import { db } from "@/lib/db";
import { gapi } from "@/lib/google";


export type Event = {
  id: string; title: string; start: string; end: string; allDay: boolean; location: string; description?: string;
  calendar: string; color: string;
  // Renseignés pour les événements Google modifiables depuis l'app
  calId?: string; eventId?: string; editable?: boolean;
};

// Cache des flux iCal pour ne pas re-télécharger à chaque changement de mois
const cache = new Map<string, { at: number; ics: string }>();
const TTL = 5 * 60 * 1000;

async function fetchIcs(url: string, fresh: boolean) {
  const hit = cache.get(url);
  if (!fresh && hit && Date.now() - hit.at < TTL) return hit.ics;
  const res = await fetch(url.replace(/^webcal:/, "https:"), { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ics = await res.text();
  cache.set(url, { at: Date.now(), ics });
  return ics;
}

// Les journées entières restent en "YYYY-MM-DD" pour éviter les décalages de fuseau
const toOut = (t: any) => (t.isDate ? t.toString().slice(0, 10) : t.toJSDate().toISOString());

// Événements de tous les agendas (iCal + Google) entre deux dates
export async function getEvents(from: Date, to: Date, fresh = false) {
  const events: Event[] = [];
  const errors: string[] = [];

  // Tous les agendas sont chargés en parallèle
  const [icals, gcals] = await Promise.all([
    db.calendar.findMany(),
    db.googleCal.findMany({ where: { visible: true } }),
  ]);

  const icalJobs = icals.map(async (cal) => {
    try {
      const ics = await fetchIcs(cal.url, fresh);
      const { events: single, occurrences } = new IcalExpander({ ics, maxIterations: 2000 }).between(from, to);
      const push = (uid: string, e: any, start: any, end: any) =>
        events.push({
          id: `${cal.id}:${uid}:${start.toString()}`,
          title: e.summary || "(Sans titre)",
          start: toOut(start),
          end: toOut(end ?? start),
          allDay: !!start.isDate,
          location: e.location || "",
          calendar: cal.name,
          color: cal.color,
        });
      single.forEach((e: any) => push(e.uid, e, e.startDate, e.endDate));
      occurrences.forEach((o: any) => push(o.item.uid, o.item, o.startDate, o.endDate));
    } catch (e) {
      errors.push(`${cal.name} : ${(e as Error).message}`);
    }
  });

  // Agendas Google connectés via l'API (lecture + écriture)
  const googleJobs = gcals.map(async (cal) => {
    try {
      let pageToken = "";
      do {
        const q = new URLSearchParams({
          timeMin: from.toISOString(), timeMax: to.toISOString(),
          singleEvents: "true", orderBy: "startTime", maxResults: "250",
          fields: "nextPageToken,items(id,status,summary,location,description,start,end,extendedProperties)",
          ...(pageToken ? { pageToken } : {}),
        });
        const r = await gapi(cal.accountId, `/calendars/${encodeURIComponent(cal.calendarId)}/events?${q}`);
        for (const e of r.items ?? []) {
          // Créneaux bloqués par les tâches de l'app : déjà affichés en tant que tâches
          if (e.status === "cancelled" || e.extendedProperties?.private?.maderinoTask) continue;
          const allDay = !!e.start?.date;
          events.push({
            id: `g:${cal.id}:${e.id}`,
            title: e.summary || "(Sans titre)",
            start: allDay ? e.start.date : new Date(e.start.dateTime).toISOString(),
            end: allDay ? e.end.date : new Date(e.end.dateTime).toISOString(),
            allDay,
            location: e.location || "",
            description: e.description || "",
            calendar: cal.name,
            color: cal.color,
            calId: cal.id,
            eventId: e.id,
            editable: cal.writable,
          });
        }
        pageToken = r.nextPageToken ?? "";
      } while (pageToken);
    } catch (e) {
      errors.push(`${cal.name} : ${(e as Error).message}`);
    }
  });

  await Promise.all([...icalJobs, ...googleJobs]);
  return { events, errors };
}
