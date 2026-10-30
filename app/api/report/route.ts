import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pushConfigured, sendPush } from "@/lib/notify";

export const dynamic = "force-dynamic";

const PARENT = "Rapports Mickaz9";
const uid = () => Math.random().toString(36).slice(2, 10);

// Markdown simple (envoyé par l'agent de reporting) → blocs de l'éditeur
function toBlocks(md: string) {
  return md.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const text = (s: string) => s.replace(/\*\*|__/g, "").trim();
    const link = l.match(/^(?:[-*•]\s+)?(?:\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)|<?(https?:\/\/[^\s>]+)>?)$/);
    if (link) return { id: uid(), type: "link", url: link[2] || link[3], text: text(link[1] || "") };
    if (/^#{3,}\s/.test(l) || /^##\s/.test(l)) return { id: uid(), type: "h2", text: text(l.replace(/^#+\s/, "")) };
    if (/^#\s/.test(l)) return { id: uid(), type: "h1", text: text(l.slice(2)) };
    if (/^([-*•]|\d+[.)])\s/.test(l)) return { id: uid(), type: "bullet", text: text(l.replace(/^([-*•]|\d+[.)])\s/, "")) };
    if (/^>\s?/.test(l)) return { id: uid(), type: "quote", text: text(l.replace(/^>\s?/, "")) };
    return { id: uid(), type: "p", text: text(l) };
  });
}

// Reçoit le rapport hebdo (dépôt mickaz999/reporting) : crée une page et envoie une notification
export async function POST(req: Request) {
  const secret = process.env.REPORT_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { title, markdown, pdf } = await req.json();
  if (!title || !markdown) return NextResponse.json({ error: "title et markdown requis" }, { status: 400 });

  // Avec un PDF : la page contient juste le lien vers le document, plus lisible que le texte brut
  const file = pdf ? await db.media.create({ data: { mime: "application/pdf", data: Buffer.from(String(pdf), "base64") } }) : null;
  const blocks = file
    ? [{ id: uid(), type: "link", url: `/api/media/${file.id}`, text: `📄 ${title} (PDF)` }]
    : toBlocks(String(markdown));

  const parent = (await db.page.findFirst({ where: { title: PARENT, parentId: null } }))
    ?? (await db.page.create({ data: { title: PARENT, icon: "📊" } }));
  const page = await db.page.create({
    data: { title: String(title), icon: "📈", parentId: parent.id, content: JSON.stringify(blocks) },
  });

  if (pushConfigured())
    await sendPush({ title: "📊 Rapport de la semaine prêt", body: String(title), url: file ? `/api/media/${file.id}` : `/p/${page.id}`, tag: `report-${page.id}` }).catch(() => {});
  return NextResponse.json({ ok: true, id: page.id });
}
