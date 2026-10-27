import { db } from "@/lib/db";

// Champs modifiables par modèle (le reste est ignoré)
const fields = {
  pages: ["title", "icon", "content", "parentId"],
  tasks: ["title", "notes", "status", "category", "date", "endDate", "props", "repeat", "repeatUntil", "startTime", "endTime"],
  properties: ["name", "type", "options", "order"],
  tracks: ["url", "videoId", "start", "title", "author", "mood", "notes"],
  boards: ["name", "data"],
  calendars: ["name", "url", "color"],
  transactions: ["date", "label", "kind", "amount", "category", "client", "payment", "reference"],
} as const;

export type ModelName = keyof typeof fields;

export function delegate(name: string) {
  const map = { pages: db.page, tasks: db.task, transactions: db.transaction, calendars: db.calendar, properties: db.taskProperty, tracks: db.track, boards: db.board } as const;
  return (map as Record<string, any>)[name] as any | undefined;
}

export function clean(name: ModelName, body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const f of fields[name]) {
    if (!(f in body)) continue;
    let v = body[f];
    if (f === "date" || f === "endDate" || f === "repeatUntil") v = v ? new Date(v as string) : null;
    if (f === "amount") v = Number(v) || 0;
    if (f === "order" || f === "start") v = Number(v) || 0;
    if ((f === "props" || f === "options" || f === "data") && typeof v !== "string") v = JSON.stringify(v ?? {});
    out[f] = v;
  }
  return out;
}

export const orderBy: Record<ModelName, object> = {
  pages: { createdAt: "asc" },
  tasks: { date: "asc" },
  transactions: { date: "desc" },
  calendars: { createdAt: "asc" },
  properties: [{ order: "asc" }, { createdAt: "asc" }],
  tracks: { createdAt: "desc" },
  boards: { updatedAt: "desc" },
};
