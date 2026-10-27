import { NextResponse } from "next/server";

// Récupère le titre d'une page web pour afficher un joli lien
export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url") ?? "";
  if (!/^https?:\/\//.test(url)) return NextResponse.json({ title: "" });
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(5000) });
    const html = (await res.text()).slice(0, 200_000);
    const pick = (re: RegExp) => html.match(re)?.[1]?.trim() ?? "";
    const title =
      pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) ||
      pick(/<title[^>]*>([^<]+)<\/title>/i);
    const decoded = title.replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    return NextResponse.json({ title: decoded.slice(0, 200) });
  } catch {
    return NextResponse.json({ title: "" });
  }
}
