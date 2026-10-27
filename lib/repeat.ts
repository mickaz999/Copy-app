// Règles de répétition des tâches, partagées entre le serveur et l'app
export const REPEATS: Record<string, string> = {
  "": "Jamais",
  daily: "Tous les jours",
  every2days: "Tous les 2 jours",
  every3days: "Tous les 3 jours",
  weekdays: "En semaine (lun-ven)",
  weekly: "Chaque semaine",
  biweekly: "Toutes les 2 semaines",
  monthly: "Chaque mois",
};

const addDaysISO = (iso: string, n: number) => {
  const d = new Date(iso.slice(0, 10) + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Prochaine date (YYYY-MM-DD) après `iso` selon la règle
export function nextDate(iso: string, rule: string): string | null {
  switch (rule) {
    case "daily": return addDaysISO(iso, 1);
    case "every2days": return addDaysISO(iso, 2);
    case "every3days": return addDaysISO(iso, 3);
    case "weekly": return addDaysISO(iso, 7);
    case "biweekly": return addDaysISO(iso, 14);
    case "weekdays": {
      let d = addDaysISO(iso, 1);
      while ([0, 6].includes(new Date(d + "T12:00:00Z").getUTCDay())) d = addDaysISO(d, 1);
      return d;
    }
    case "monthly": {
      const [y, m, day] = iso.slice(0, 10).split("-").map(Number);
      // Garde le même jour du mois, ou le dernier jour si le mois est plus court
      const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      return new Date(Date.UTC(y, m, Math.min(day, last))).toISOString().slice(0, 10);
    }
    default: return null;
  }
}

export const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 864e5);
export { addDaysISO };
