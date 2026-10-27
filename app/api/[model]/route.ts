import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clean, delegate, orderBy, ModelName } from "@/lib/models";
import { syncTaskBlock } from "@/lib/block";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { model: string } }) {
  if (params.model === "settings")
    return NextResponse.json(await db.settings.upsert({ where: { id: 1 }, create: {}, update: {} }));
  const d = delegate(params.model);
  if (!d) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(await d.findMany({ orderBy: orderBy[params.model as ModelName] }));
}

export async function POST(req: Request, { params }: { params: { model: string } }) {
  const body = await req.json();
  if (params.model === "settings") {
    const data = {
      rate: Number(body.rate) || 0,
      ceiling: Number(body.ceiling) || 0,
      activity: String(body.activity ?? ""),
    };
    return NextResponse.json(
      await db.settings.upsert({ where: { id: 1 }, create: data, update: data })
    );
  }
  const d = delegate(params.model);
  if (!d) return NextResponse.json({ error: "not found" }, { status: 404 });
  const item = await d.create({ data: clean(params.model as ModelName, body) });
  if (params.model === "tasks" && item.startTime) await syncTaskBlock(item.id).catch(() => {});
  return NextResponse.json(item);
}
