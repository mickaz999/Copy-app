import { db } from "@/lib/db";

// Stats avancées pour le rapport hebdo (dépôt mickaz999/reporting), servies par /api/report/extra

const form = (o: Record<string, string>) => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(o),
});

export const PROVIDERS = {
  youtube: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    clientId: () => process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET ?? "",
    scope: "https://www.googleapis.com/auth/yt-analytics.readonly https://www.googleapis.com/auth/youtube.readonly",
    extra: { access_type: "offline", prompt: "consent" } as Record<string, string>,
  },
  twitch: {
    authorize: "https://id.twitch.tv/oauth2/authorize",
    token: "https://id.twitch.tv/oauth2/token",
    clientId: () => process.env.TWITCH_CLIENT_ID ?? "",
    clientSecret: () => process.env.TWITCH_CLIENT_SECRET ?? "",
    scope: "channel:read:subscriptions moderator:read:followers bits:read",
    extra: { force_verify: "true" } as Record<string, string>,
  },
};
export type Provider = keyof typeof PROVIDERS;

export const callbackUrl = (req: Request, p: Provider) => `${new URL(req.url).origin}/api/connect/${p}/callback`;

export async function saveCode(p: Provider, code: string, redirect: string) {
  const c = PROVIDERS[p];
  const t = await (await fetch(c.token, form({
    client_id: c.clientId(), client_secret: c.clientSecret(), code, grant_type: "authorization_code", redirect_uri: redirect,
  }))).json();
  if (!t.refresh_token) throw new Error(JSON.stringify(t).slice(0, 300));
  const data = { refreshToken: t.refresh_token, accessToken: t.access_token, expiresAt: new Date(Date.now() + t.expires_in * 1000) };
  await db.apiToken.upsert({ where: { provider: p }, create: { provider: p, ...data }, update: data });
}

async function userToken(p: Provider) {
  const row = await db.apiToken.findUnique({ where: { provider: p } });
  if (!row) return null;
  if (row.accessToken && row.expiresAt.getTime() > Date.now() + 60_000) return row.accessToken;
  const c = PROVIDERS[p];
  const t = await (await fetch(c.token, form({
    client_id: c.clientId(), client_secret: c.clientSecret(), refresh_token: row.refreshToken, grant_type: "refresh_token",
  }))).json();
  if (!t.access_token) throw new Error(`connexion ${p} expirée, reconnecte-la : ${JSON.stringify(t).slice(0, 200)}`);
  // Twitch renvoie un nouveau refresh token à chaque fois
  await db.apiToken.update({ where: { provider: p }, data: {
    accessToken: t.access_token, expiresAt: new Date(Date.now() + t.expires_in * 1000), refreshToken: t.refresh_token ?? row.refreshToken,
  } });
  return t.access_token as string;
}

// --- Twitch ---

let appToken: { token: string; exp: number } | null = null;
async function twitchApp() {
  if (appToken && appToken.exp > Date.now() + 60_000) return appToken.token;
  const t = await (await fetch("https://id.twitch.tv/oauth2/token", form({
    client_id: PROVIDERS.twitch.clientId(), client_secret: PROVIDERS.twitch.clientSecret(), grant_type: "client_credentials",
  }))).json();
  appToken = { token: t.access_token, exp: Date.now() + t.expires_in * 1000 };
  return appToken.token;
}

async function helix(path: string, token: string) {
  const res = await fetch(`https://api.twitch.tv/helix${path}`, {
    headers: { "Client-Id": PROVIDERS.twitch.clientId(), Authorization: `Bearer ${token}` },
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`Twitch ${path.split("?")[0]} : ${j.message ?? res.status}`);
  return j;
}

let broadcasterId = "";
async function twitchUserId(token: string) {
  if (!broadcasterId) broadcasterId = (await helix(`/users?login=${encodeURIComponent(process.env.TWITCH_LOGIN ?? "")}`, token)).data[0]?.id ?? "";
  return broadcasterId;
}

// Appelé par le cron toutes les 5 min : relève les spectateurs si un live est en cours
export async function sampleTwitch() {
  if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_LOGIN) return [];
  const token = await twitchApp();
  const s = (await helix(`/streams?user_login=${encodeURIComponent(process.env.TWITCH_LOGIN)}`, token)).data[0];
  if (!s) return [];
  await db.twitchSample.create({ data: { streamId: s.id, viewers: s.viewer_count, title: s.title, game: s.game_name } });
  await db.twitchSample.deleteMany({ where: { at: { lt: new Date(Date.now() - 60 * 864e5) } } });
  return [`twitch : ${s.viewer_count} spectateurs`];
}

async function twitchExtra(since: Date) {
  const out: Record<string, unknown> = {};
  // Spectateurs mesurés par nos relevés
  const samples = await db.twitchSample.findMany({ where: { at: { gte: since } }, orderBy: { at: "asc" } });
  const byStream = new Map<string, typeof samples>();
  for (const s of samples) byStream.set(s.streamId, [...(byStream.get(s.streamId) ?? []), s]);
  out.lives_mesures = [...byStream.values()].map((ss) => ({
    titre: ss[ss.length - 1].title,
    jeu: ss[ss.length - 1].game,
    date: ss[0].at.toISOString(),
    spectateurs_moyens: Math.round(ss.reduce((a, s) => a + s.viewers, 0) / ss.length),
    pic_spectateurs: Math.max(...ss.map((s) => s.viewers)),
  }));
  if (samples.length) {
    out.spectateurs_moyens = Math.round(samples.reduce((a, s) => a + s.viewers, 0) / samples.length);
    out.pic_spectateurs = Math.max(...samples.map((s) => s.viewers));
  }

  const app = await twitchApp();
  const id = await twitchUserId(app);
  const clips = (await helix(`/clips?broadcaster_id=${id}&started_at=${since.toISOString()}&first=100`, app)).data;
  out.clips = clips.sort((a: any, b: any) => b.view_count - a.view_count).slice(0, 5)
    .map((c: any) => ({ titre: c.title, vues: c.view_count, lien: c.url }));
  out.nb_clips = clips.length;

  const user = await userToken("twitch").catch((e) => { out.erreur_connexion = (e as Error).message; return null; });
  if (user) {
    const subs: any[] = [];
    let cursor = "";
    for (let i = 0; i < 20; i++) {
      const r = await helix(`/subscriptions?broadcaster_id=${id}&first=100${cursor ? `&after=${cursor}` : ""}`, user);
      subs.push(...r.data);
      cursor = r.pagination?.cursor;
      if (!cursor) break;
    }
    const others = subs.filter((s) => s.user_id !== id); // sans ton propre sub de streamer
    out.subs = others.length;
    out.subs_par_tier = { "1": others.filter((s) => s.tier === "1000").length, "2": others.filter((s) => s.tier === "2000").length, "3": others.filter((s) => s.tier === "3000").length };
    out.subs_offerts = others.filter((s) => s.is_gift).length;

    const fresh: string[] = [];
    cursor = "";
    for (let i = 0; i < 10; i++) {
      const r = await helix(`/channels/followers?broadcaster_id=${id}&first=100${cursor ? `&after=${cursor}` : ""}`, user);
      const recent = r.data.filter((f: any) => new Date(f.followed_at) >= since);
      fresh.push(...recent.map((f: any) => f.user_name));
      cursor = r.pagination?.cursor;
      if (!cursor || recent.length < r.data.length) break;
    }
    out.nouveaux_followers = fresh.length;
    out.noms_nouveaux_followers = fresh.slice(0, 30);

    out.top_bits = (await helix(`/bits/leaderboard?period=week&count=5`, user)).data
      .map((b: any) => ({ pseudo: b.user_name, bits: b.score }));
  }
  return out;
}

// --- YouTube Analytics ---

async function ytReport(token: string, params: Record<string, string>) {
  const url = new URL("https://youtubeanalytics.googleapis.com/v2/reports");
  url.search = new URLSearchParams({ ids: "channel==MINE", ...params }).toString();
  const j = await (await fetch(url, { headers: { Authorization: `Bearer ${token}` } })).json();
  if (j.error) throw new Error(`YouTube Analytics : ${j.error.message}`);
  return j as { columnHeaders: { name: string }[]; rows?: (string | number)[][] };
}

async function youtubeExtra(since: Date) {
  const token = await userToken("youtube");
  if (!token) return null;
  // Les données YouTube Analytics ont 2 à 3 jours de retard : on prend les 7 jours complets disponibles
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const end = new Date(Date.now() - 2 * 864e5);
  const start = new Date(end.getTime() - 6 * 864e5);
  const p = { startDate: day(start), endDate: day(end) };
  const main = await ytReport(token, { ...p, metrics: "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost,likes,shares,comments" });
  const row = main.rows?.[0] ?? [];
  const out: Record<string, unknown> = { periode: `${p.startDate} → ${p.endDate}` };
  main.columnHeaders.forEach((h, i) => (out[h.name] = row[i] ?? 0));

  const list = async (dimension: string, metric = "views", max = 5) => {
    const r = await ytReport(token, { ...p, dimensions: dimension, metrics: metric, sort: `-${metric}`, maxResults: String(max) });
    return (r.rows ?? []).map(([k, v]) => ({ [dimension]: k, [metric]: v }));
  };
  out.sources_trafic = await list("insightTrafficSourceType");
  out.pays = await list("country");
  out.appareils = await list("deviceType");
  out.formats = await list("creatorContentType").catch(() => []); // Shorts / vidéos / lives
  const demo = await ytReport(token, { ...p, dimensions: "ageGroup,gender", metrics: "viewerPercentage" });
  out.audience = (demo.rows ?? []).map(([age, genre, pct]) => ({ age, genre, pourcentage: pct }));
  void since;
  return out;
}

export async function extraStats() {
  const since = new Date(Date.now() - 7 * 864e5);
  const [twitch, youtube] = await Promise.all([
    process.env.TWITCH_CLIENT_ID ? twitchExtra(since).catch((e) => ({ erreur: (e as Error).message })) : null,
    youtubeExtra(since).catch((e) => ({ erreur: (e as Error).message })),
  ]);
  return { twitch, youtube };
}
