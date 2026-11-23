import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { sendGmail } from "@/lib/google";
import { mailAccount } from "@/lib/notify";
import { leftovers, nextDate, normalizeTemplates } from "@/lib/prospects";

export const dynamic = "force-dynamic";

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Envoie un mail de prospection depuis le Gmail connecté.
// `step` (facultatif) = étape de la séquence : 0 = premier mail, 1+ = relance dans le même fil Gmail.
export async function POST(req: Request) {
  const { id, to, subject, body, step } = await req.json();
  const p = await db.prospect.findUnique({ where: { id } });
  if (!p) return NextResponse.json({ error: "Prospect introuvable" }, { status: 404 });
  if (["replied", "won", "lost"].includes(p.status) && typeof step === "number") return NextResponse.json({ error: `${p.name} n'est plus en séquence (statut : ${p.status})` }, { status: 409 });
  const dest = String(to ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dest)) return NextResponse.json({ error: "Adresse mail invalide" }, { status: 400 });
  let subj = String(subject ?? "").trim();
  const text = String(body ?? "").trim();
  if (!text) return NextResponse.json({ error: "Message vide" }, { status: 400 });
  const left = leftovers(subj + " " + text);
  if (left.length) return NextResponse.json({ error: `Variable non remplacée : ${left.join(", ")}` }, { status: 400 });

  // Relance : même fil, objet « Re: » du premier mail
  const isFollowUp = typeof step === "number" && step > 0 && !!p.threadId;
  if (isFollowUp) subj = p.subject ? `Re: ${p.subject.replace(/^re:\s*/i, "")}` : subj;
  if (!subj) return NextResponse.json({ error: "Objet requis" }, { status: 400 });

  const acc = await mailAccount();
  if (!acc) return NextResponse.json({ error: "Aucun compte Google avec l'envoi de mails : connecte-le dans Réglages." }, { status: 400 });
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">${esc(text).replace(/\n/g, "<br>")}</div>`;
  const domain = (acc.email.split("@")[1] || "maderinoprod.com").trim();
  const msgId = `<${randomUUID()}@${domain}>`;
  let sent;
  try {
    sent = await sendGmail(acc.id, dest, subj, html, false, "", [], isFollowUp ? { threadId: p.threadId, msgId, inReplyTo: p.msgId } : { msgId });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Envoi impossible" }, { status: 502 });
  }

  const data: Record<string, any> = { email: p.email || dest, lastMail: new Date(), mails: { increment: 1 }, status: p.status === "todo" ? "contacted" : p.status };
  if (typeof step === "number") {
    const c = await db.prospectConfig.findUnique({ where: { id: 1 } });
    const templates = normalizeTemplates(JSON.parse(c?.templates || "[]"));
    data.step = step + 1;
    data.nextAt = nextDate(templates, step);
    if (step === 0 || !p.threadId) Object.assign(data, { threadId: sent.threadId, msgId, subject: subj });
  }
  const updated = await db.prospect.update({ where: { id }, data });
  return NextResponse.json(updated);
}
