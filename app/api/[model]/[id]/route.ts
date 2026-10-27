import { NextResponse } from "next/server";
import { clean, delegate, ModelName } from "@/lib/models";
import { db } from "@/lib/db";
import { addDaysISO, daysBetween, nextDate } from "@/lib/repeat";
import { removeTaskBlock, syncTaskBlock } from "@/lib/block";

type P = { params: { model: string; id: string } };

export async function GET(_: Request, { params }: P) {
  const d = delegate(params.model);
  const item = d && (await d.findUnique({ where: { id: params.id } }));
  return item ? NextResponse.json(item) : NextResponse.json({ error: "not found" }, { status: 404 });
}

export async function PATCH(req: Request, { params }: P) {
  const d = delegate(params.model);
  if (!d) return NextResponse.json({ error: "not found" }, { status: 404 });
  const data = clean(params.model as ModelName, await req.json());
  const item = await d.update({ where: { id: params.id }, data });
  if (params.model === "tasks") {
    // Horaire, date ou titre modifiés : le créneau bloqué dans Google suit
    if (["date", "endDate", "startTime", "endTime", "title"].some((k) => k in data) || item.blockEventId) await syncTaskBlock(item.id).catch(() => {});
    return NextResponse.json({ ...item, spawned: await spawnNext(item) });
  }
  return NextResponse.json(item);
}

export async function DELETE(_: Request, { params }: P) {
  const d = delegate(params.model);
  if (!d) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (params.model === "tasks") await removeTaskBlock(params.id).catch(() => {});
  await d.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}

// Tâche répétitive terminée : crée la suivante (une seule fois)
async function spawnNext(t: Awaited<ReturnType<typeof db.task.findUniqueOrThrow>>) {
  if (t.status !== "done" || !t.repeat || t.repeatSpawned || !t.date) return false;
  const start = t.date.toISOString().slice(0, 10);
  const next = nextDate(start, t.repeat);
  if (!next || (t.repeatUntil && next > t.repeatUntil.toISOString().slice(0, 10))) return false;
  const span = t.endDate ? daysBetween(start, t.endDate.toISOString()) : 0;
  const [created] = await db.$transaction([
    db.task.create({
      data: {
        title: t.title, notes: t.notes, category: t.category, props: t.props, status: "todo",
        startTime: t.startTime, endTime: t.endTime,
        repeat: t.repeat, repeatUntil: t.repeatUntil,
        date: new Date(next), endDate: span > 0 ? new Date(addDaysISO(next, span)) : null,
      },
    }),
    db.task.update({ where: { id: t.id }, data: { repeatSpawned: true } }),
  ]);
  if (created.startTime) await syncTaskBlock(created.id).catch(() => {});
  return true;
}
