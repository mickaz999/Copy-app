import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Déconnecte un compte Google (ne supprime rien chez Google)
export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const acc = await db.googleAccount.delete({ where: { id: params.id } });
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(acc.refreshToken)}`, { method: "POST" }).catch(() => {});
  return NextResponse.json({ ok: true });
}
