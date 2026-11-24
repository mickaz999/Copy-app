// Prospection : modèles, variables et séquence de relances (partagé serveur + navigateur)

export type Template = { name: string; subject: string; body: string; delay: number };
export type ProspectLike = { name: string; company: string; hook: string };

// Séquence proposée au départ : premier contact puis 3 relances (délai = jours après le mail précédent)
export const DEFAULT_TEMPLATES: Template[] = [
  {
    name: "Premier contact",
    delay: 0,
    subject: "petite idée pour {marque}",
    body: "Salut {prénom},\n\n{accroche}\n\nJe fais du montage et de la vidéo chez Maderino Prod. En regardant ton contenu j'ai eu quelques idées, je pense qu'il y a un truc à faire.\n\nOn s'appelle 10 min cette semaine ? Si ça colle pas, pas de souci.",
  },
  {
    name: "Relance 1",
    delay: 4,
    subject: "",
    body: "Hello {prénom},\n\nJe me permets de te relancer, mon message a dû passer à la trappe.\n\nSi tu veux voir ce que je fais, tout est sur le site. Dis-moi si ça te parle.",
  },
  {
    name: "Relance 2",
    delay: 6,
    subject: "",
    body: "Re {prénom},\n\nJe fais court : la vidéo c'est un sujet pour toi en ce moment, ou pas du tout ?\n\nMême un non me va, au moins je sais.",
  },
  {
    name: "Dernier message",
    delay: 10,
    subject: "",
    body: "Salut {prénom},\n\nDernier message, après j'arrête de te saouler.\n\nSi un jour t'as besoin d'un coup de main sur tes vidéos, tu sais où me trouver. Bonne suite pour {marque}.",
  },
];

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

// Remplace les variables ; {accroche} vide → la ligne disparaît proprement
export function fill(text: string, p: ProspectLike) {
  return text
    .replace(/\{pr[ée]nom\}/gi, firstName(p.name))
    .replace(/\{nom\}/gi, p.name.trim())
    .replace(/\{marque\}|\{entreprise\}/gi, p.company.trim() || p.name.trim())
    .replace(/\{accroche\}/gi, p.hook.trim())
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Variables restées entre accolades (faute de frappe, variable inconnue) : on bloque l'envoi
export const leftovers = (text: string) => Array.from(new Set(text.match(/\{[^{}\s]{1,20}\}/g) ?? []));

// Le premier mail utilise {accroche} sans accroche renseignée ? Mail pas assez perso : on bloque
export const needsHook = (t: Template | undefined, p: ProspectLike) => !!t && /\{accroche\}/i.test(t.subject + t.body) && !p.hook.trim();

export function normalizeTemplates(raw: unknown): Template[] {
  return (Array.isArray(raw) ? raw : []).map((t: any) => ({
    name: String(t?.name ?? ""),
    subject: String(t?.subject ?? ""),
    body: String(t?.body ?? ""),
    delay: Math.max(0, Math.min(90, Math.round(Number(t?.delay) || 0))),
  }));
}

// Date de la prochaine étape après l'envoi de l'étape `sent` (0 = premier mail)
export function nextDate(templates: Template[], sent: number, from = new Date()) {
  const next = templates[sent + 1];
  if (!next) return null;
  return new Date(from.getTime() + Math.max(1, next.delay) * 864e5);
}
