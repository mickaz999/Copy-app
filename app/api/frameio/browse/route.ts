import { NextResponse } from "next/server";
import { folderChildren } from "@/lib/frameio";

export const dynamic = "force-dynamic";

// ?accountId=&folderId= : contenu d'un dossier Frame.io
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  try {
    return NextResponse.json(await folderChildren(q.get("accountId") ?? "", q.get("folderId") ?? ""));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
