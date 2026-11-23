import { NextResponse } from "next/server";
import { acceptQuote } from "@/lib/quotes";

export const dynamic = "force-dynamic";

// Devis validé : fichier signé facultatif (multipart « file »), puis facture brouillon
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    let file: { name: string; type: string; data: Buffer } | undefined;
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const f = (await req.formData()).get("file");
      if (f && typeof f !== "string") {
        if (f.size > 4 * 1024 * 1024) return NextResponse.json({ error: "Fichier trop lourd (4 Mo maximum)." }, { status: 400 });
        file = { name: f.name, type: f.type || "application/octet-stream", data: Buffer.from(await f.arrayBuffer()) };
      }
    }
    return NextResponse.json(await acceptQuote(params.id, file));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
