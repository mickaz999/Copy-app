// Lecture d'une réponse JSON robuste : si le serveur renvoie autre chose (délai dépassé, erreur Vercel),
// on réessaie une fois puis on affiche un message clair au lieu de « The string did not match the expected pattern »
export async function fetchJson(url: string, init?: RequestInit, retry = 1): Promise<{ ok: boolean; status: number; j: any }> {
  try {
    const r = await fetch(url, init);
    const raw = await r.text();
    try { return { ok: r.ok, status: r.status, j: JSON.parse(raw) }; }
    catch { if (retry > 0) return fetchJson(url, init, retry - 1); return { ok: false, status: r.status, j: { error: "Le serveur met trop de temps à répondre. Recharge la page dans quelques secondes." } }; }
  } catch {
    if (retry > 0) return fetchJson(url, init, retry - 1);
    return { ok: false, status: 0, j: { error: "Connexion impossible. Vérifie ta connexion internet puis recharge la page." } };
  }
}
