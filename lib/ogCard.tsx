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

// Image d'aperçu des liens (Instagram, WhatsApp, iMessage…) : uniquement le logo maderino, centré
// (WhatsApp recadre en carré au centre : tout tient dans le carré du milieu)
export async function ogCard(_: { title?: string; kicker?: string; sub?: string; bg?: string } = {}) {
  const f = await loadFonts();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 34, background: "#0b0a09", color: "#f4efe9", fontFamily: "Inter" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
          <svg width="150" height="180" viewBox="0 0 30 36"><path d="M0 0 L30 18 L0 36 Z" fill="#ff6b00" /></svg>
          <div style={{ width: 46, height: 46, borderRadius: 23, background: "#f4efe9" }} />
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <div style={{ display: "flex", fontSize: 54, fontWeight: 800, letterSpacing: -2 }}>maderino</div>
          <div style={{ display: "flex", fontSize: 58, color: "#ff6b00", fontFamily: "Playfair", fontStyle: "italic" }}>production.</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts: f },
  );
}
