// Transforme un lien de réseau social en lecteur intégrable
export type Embed = { kind: "youtube" | "short" | "instagram" | "tiktok" | "vimeo" | "spotify" | "link"; src: string; vertical: boolean; label: string; w?: number; h?: number };

export function toEmbed(raw: string): Embed {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return { kind: "link", src: raw, vertical: false, label: "Lien" }; }
  const h = u.hostname.replace(/^www\.|^m\./, "");
  const seg = u.pathname.split("/").filter(Boolean);

  if (h === "youtu.be" || h.endsWith("youtube.com")) {
    const id = h === "youtu.be" ? seg[0] : ["shorts", "embed", "live"].includes(seg[0]) ? seg[1] : u.searchParams.get("v");
    const t = u.searchParams.get("t")?.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?/);
    const start = t ? Number(t[1] || 0) * 3600 + Number(t[2] || 0) * 60 + Number(t[3] || 0) : 0;
    if (id) return { kind: seg[0] === "shorts" ? "short" : "youtube", src: `https://www.youtube-nocookie.com/embed/${id}?start=${start}`, vertical: seg[0] === "shorts", label: seg[0] === "shorts" ? "YouTube Short" : "YouTube" };
  }
  if (h.endsWith("instagram.com") && ["reel", "reels", "p", "tv"].includes(seg[0]) && seg[1])
    return { kind: "instagram", src: `https://www.instagram.com/${seg[0] === "reels" ? "reel" : seg[0]}/${seg[1]}/embed`, vertical: true, label: "Instagram" };
  if (h.endsWith("tiktok.com")) {
    const i = seg.indexOf("video");
    if (i >= 0 && seg[i + 1]) return { kind: "tiktok", src: `https://www.tiktok.com/embed/v2/${seg[i + 1]}`, vertical: true, label: "TikTok" };
  }
  if (h.endsWith("vimeo.com") && /^\d+$/.test(seg[seg.length - 1] ?? ""))
    return { kind: "vimeo", src: `https://player.vimeo.com/video/${seg[seg.length - 1]}`, vertical: false, label: "Vimeo" };
  if (h === "open.spotify.com" || h === "spotify.link") {
    // Ignore le préfixe de langue (/intl-fr/) et accepte titres, albums, playlists, artistes, podcasts
    const p = seg[0]?.startsWith("intl-") ? seg.slice(1) : seg;
    if (["track", "album", "playlist", "artist", "episode", "show"].includes(p[0]) && p[1]) {
      const small = p[0] === "track" || p[0] === "episode";
      return { kind: "spotify", src: `https://open.spotify.com/embed/${p[0]}/${p[1]}`, vertical: false, label: "Spotify", w: 340, h: small ? 210 : 440 };
    }
  }
  return { kind: "link", src: u.toString(), vertical: false, label: h };
}
