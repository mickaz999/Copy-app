import { NextResponse } from "next/server";
import { sendQuote } from "@/lib/quotes";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  try {
    return NextResponse.json(await sendQuote(params.id, { email: body.email !== false }));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
