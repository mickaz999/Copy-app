// Grille tarifaire Maderino (reprise de l'ancien outil Pricing du site)
export type PriceItem = { id: string; name: string; duree: string; prix: number };
export const CATALOGUE: { section: string; items: PriceItem[] }[] = [
  { section: "Tournage", items: [{ id: "t1", name: "Tournage — demi-journée", duree: "4h", prix: 105 }] },
  { section: "Mariage", items: [
    { id: "m1", name: "Montage mariage — formule courte", duree: "12h (3 demi-journées)", prix: 315 },
    { id: "m2", name: "Montage mariage — formule complète", duree: "16h (2 journées)", prix: 420 },
  ] },
  { section: "Montage YouTube", items: [
    { id: "y1", name: "Montage YouTube — demi-journée", duree: "4h", prix: 105 },
    { id: "y2", name: "Montage YouTube — journée", duree: "8h", prix: 210 },
    { id: "y3", name: "Montage YouTube — journée et demie", duree: "12h", prix: 315 },
  ] },
  { section: "Reels & Shorts", items: [
    { id: "r1", name: "Réel ultra simple", duree: "30 min", prix: 15 },
    { id: "r2", name: "Réel simple", duree: "1h", prix: 30 },
    { id: "r3", name: "Réel poussé — motion design", duree: "2h", prix: 55 },
  ] },
  { section: "Podcast", items: [
    { id: "p1", name: "Podcast classic — cut POV", duree: "4h", prix: 105 },
    { id: "p2", name: "Podcast — habillage sonore + inserts libres de droit", duree: "8h", prix: 210 },
    { id: "p3", name: "Intro / Outro motion simple", duree: "4h", prix: 105 },
    { id: "p4", name: "+ Extrait Réel simple (supplément)", duree: "+1h", prix: 30 },
    { id: "p5", name: "+ Extrait Réel poussé motion (supplément)", duree: "+2h", prix: 55 },
  ] },
];
