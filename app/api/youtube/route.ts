import { NextResponse } from "next/server";

// Identifiant et seconde de départ d'un lien YouTube (youtube.com, youtu.be, shorts, music)
function parse(url: string) {
  try {
    const u = new URL(url.trim());
    const id = u.hostname.includes("youtu.be") ? u.pathname.slice(1)
      : u.pathname.startsWith("/shorts/") || u.pathname.startsWith("/embed/") || u.pathname.startsWith("/live/") ? u.pathname.split("/")[2]
      : u.searchParams.get("v");
    const t = u.searchParams.get("t") ?? u.searchParams.get("start") ?? "";
    const m = t.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?/);
    const start = m ? (Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0)) : 0;
    return id && /^[\w-]{6,}$/.test(id) ? { id, start } : null;
  } catch {
    return null;
  }
}

// Titre et chaîne de la vidéo via l'oEmbed public de YouTube
export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url") ?? "";
  const p = parse(url);
  if (!p) return NextResponse.json({ error: "Lien YouTube non reconnu" }, { status: 400 });
  let title = "", author = "";
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${p.id}`)}`);
    if (r.ok) { const j = await r.json(); title = j.title ?? ""; author = j.author_name ?? ""; }
  } catch {}
  return NextResponse.json({ videoId: p.id, start: p.start, title, author });
}
