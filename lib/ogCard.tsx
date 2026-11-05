import { ImageResponse } from "next/og";

// Polices de la marque (Inter gras, Playfair italique), chargées une fois depuis Google Fonts
let fonts: Promise<{ name: string; data: ArrayBuffer; weight: 400 | 800; style: "normal" | "italic" }[]> | null = null;
async function font(family: string) {
  // Ancien navigateur : Google renvoie un fichier .ttf, lisible par le générateur d'image
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family}`, { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8)" } })).text();
  const url = css.match(/src: url\((.+?)\)/)?.[1];
  if (!url) throw new Error("police introuvable");
  return (await fetch(url)).arrayBuffer();
}
const loadFonts = () => (fonts ??= Promise.all([
  font("Inter:wght@800").then((data) => ({ name: "Inter", data, weight: 800 as const, style: "normal" as const })),
  font("Inter:wght@400").then((data) => ({ name: "Inter", data, weight: 400 as const, style: "normal" as const })),
  font("Playfair+Display:ital@1").then((data) => ({ name: "Playfair", data, weight: 400 as const, style: "italic" as const })),
]).catch(() => { fonts = null; return []; }));

// Carte d'aperçu des liens (Instagram, WhatsApp, iMessage…) : image de fond, titre, logo maderino
export async function ogCard({ title, kicker, sub, bg }: { title: string; kicker: string; sub: string; bg?: string }) {
  const f = await loadFonts();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "#0b0a09", color: "#f4efe9", fontFamily: "Inter" }}>
        {bg && <img src={bg} width={1200} height={630} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
        <div style={{ position: "absolute", inset: 0, display: "flex", background: bg ? "linear-gradient(180deg, rgba(11,10,9,.15) 0%, rgba(11,10,9,.55) 55%, rgba(11,10,9,.95) 100%)" : "linear-gradient(160deg, rgba(255,107,0,.32) 0%, rgba(11,10,9,0) 55%)" }} />
        <div style={{ position: "absolute", left: 64, right: 64, bottom: 56, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", fontSize: 34, color: "#ff8a3d", fontFamily: "Playfair", fontStyle: "italic" }}>{kicker}</div>
          <div style={{ display: "flex", fontSize: 76, fontWeight: 800, letterSpacing: -3, lineHeight: 1 }}>{title.slice(0, 60)}</div>
          <div style={{ display: "flex", fontSize: 28, color: "#cfc6bd", fontWeight: 400 }}>{sub}</div>
        </div>
        <div style={{ position: "absolute", left: 64, top: 52, display: "flex", alignItems: "center", gap: 12 }}>
          <svg width="30" height="36" viewBox="0 0 30 36"><path d="M0 0 L30 18 L0 36 Z" fill="#ff6b00" /></svg>
          <div style={{ width: 12, height: 12, borderRadius: 6, background: "#f4efe9" }} />
          <div style={{ display: "flex", fontSize: 34, fontWeight: 800, marginLeft: 6 }}>maderino</div>
          <div style={{ display: "flex", fontSize: 36, color: "#ff6b00", fontFamily: "Playfair", fontStyle: "italic" }}>production.</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts: f },
  );
}
