// Grille tarifaire Maderino, reprise des tarifs affichés sur maderinoprod.com (tournage-video-lyon et montage-video-lyon).
// « from » = prix de départ (« dès ») : le prix reste modifiable dans le devis.
export type PriceItem = { id: string; name: string; duree: string; prix: number; from?: boolean };
export const CATALOGUE: { section: string; note?: string; items: PriceItem[] }[] = [
  {
    section: "Tournage",
    note: "Montage inclus, déplacement inclus à Lyon et aux alentours. Vidéo découverte déduite si formule 5 ou 10 vidéos prise dans le mois.",
    items: [
      { id: "t1", name: "Vidéo découverte : 1 vidéo courte (jusqu'à 30 s), 1 h de tournage", duree: "1 h", prix: 199 },
      { id: "t2", name: "Formule 2 vidéos courtes, tournage de 2 h 30", duree: "2 h 30", prix: 379 },
      { id: "t3", name: "Formule 5 vidéos courtes, 1/2 journée de tournage (4 h)", duree: "4 h", prix: 699 },
      { id: "t4", name: "Formule 10 vidéos courtes, 2 x 1/2 journée de tournage", duree: "2 x 4 h", prix: 1390 },
      { id: "t5", name: "Shooting photo pendant le tournage (option)", duree: "option", prix: 0, from: true },
    ],
  },
  {
    section: "Reels / TikTok",
    items: [
      { id: "r1", name: "Montage reel basique : coupes simples, sous-titres et musique", duree: "", prix: 20 },
      { id: "r2", name: "Montage reel intermédiaire : basique + habillage sonore et inserts", duree: "", prix: 40 },
      { id: "r3", name: "Montage pub / ads : motion design, format publicitaire", duree: "", prix: 80 },
    ],
  },
  {
    section: "Vidéo YouTube",
    items: [
      { id: "y1", name: "Montage vidéo YouTube : dérush et montage (face caméra simple, 5 min)", duree: "dès", prix: 60, from: true },
      { id: "y2", name: "Option sous-titres", duree: "option", prix: 0, from: true },
      { id: "y3", name: "Option miniature", duree: "option", prix: 0, from: true },
    ],
  },
  {
    section: "Podcast",
    items: [
      { id: "p1", name: "Montage podcast : épisode de 15 min, multi-caméras, nettoyage audio", duree: "dès", prix: 80, from: true },
    ],
  },
  {
    section: "Mariage / événementiel (pour vidéastes)",
    items: [
      { id: "m1", name: "Montage mariage / événementiel : film de 10 min, 1 h de rushs", duree: "dès", prix: 230, from: true },
    ],
  },
];
