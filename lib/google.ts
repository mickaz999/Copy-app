import { db } from "@/lib/db";

export const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/gmail.send",
].join(" ");

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.send";

export const TZ = "Europe/Paris";
const API = "https://www.googleapis.com/calendar/v3";

export const googleConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export const redirectUri = (req: Request) => `${new URL(req.url).origin}/api/google/callback`;

export async function exchangeCode(code: string, redirect: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirect,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token: ${await res.text()}`);
  return res.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number; id_token?: string; scope?: string }>;
}

// Jetons gardés en mémoire pour éviter une lecture en base à chaque appel,
// et un seul rafraîchissement à la fois par compte
const tokenCache = new Map<string, { token: string; exp: number }>();
const inflight = new Map<string, Promise<string>>();
export const forgetToken = (accountId: string) => tokenCache.delete(accountId);

export async function accessToken(accountId: string) {
  const hit = tokenCache.get(accountId);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;
  if (!inflight.has(accountId))
    inflight.set(accountId, loadToken(accountId).finally(() => inflight.delete(accountId)));
  return inflight.get(accountId)!;
}

// Renvoie un jeton d'accès valide, en le rafraîchissant si besoin
async function loadToken(accountId: string) {
  const acc = await db.googleAccount.findUniqueOrThrow({ where: { id: accountId } });
  if (acc.accessToken && acc.expiresAt.getTime() > Date.now() + 60_000) {
    tokenCache.set(accountId, { token: acc.accessToken, exp: acc.expiresAt.getTime() });
    return acc.accessToken;
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: acc.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Connexion Google expirée pour ${acc.email}, reconnecte le compte.`);
  const t = await res.json();
  await db.googleAccount.update({
    where: { id: accountId },
    data: { accessToken: t.access_token, expiresAt: new Date(Date.now() + t.expires_in * 1000) },
  });
  tokenCache.set(accountId, { token: t.access_token, exp: Date.now() + t.expires_in * 1000 });
  return t.access_token as string;
}

export async function gapi(accountId: string, path: string, init: RequestInit = {}, retried = false): Promise<any> {
  const token = await accessToken(accountId);
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });
  // Jeton refusé (révoqué ou remplacé après une reconnexion) : on en redemande un et on réessaie une fois
  if (res.status === 401 && !retried) {
    tokenCache.delete(accountId);
    await db.googleAccount.update({ where: { id: accountId }, data: { accessToken: "", expiresAt: new Date(0) } });
    return gapi(accountId, path, init, true);
  }
  if (res.status === 401) throw new Error("Connexion Google expirée, reconnecte ton compte dans Agendas.");
  if (res.status === 204) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message ?? `Google Agenda : erreur ${res.status}`);
  return body;
}

// Récupère la liste des agendas du compte et la synchronise en base
export async function syncCalendars(accountId: string) {
  const list = await gapi(accountId, "/users/me/calendarList?minAccessRole=reader");
  const seen: string[] = [];
  for (const c of list.items ?? []) {
    seen.push(c.id);
    const writable = c.accessRole === "owner" || c.accessRole === "writer";
    await db.googleCal.upsert({
      where: { accountId_calendarId: { accountId, calendarId: c.id } },
      create: { accountId, calendarId: c.id, name: c.summaryOverride || c.summary, color: c.backgroundColor || "#2383e2", writable, visible: !!c.selected },
      update: { name: c.summaryOverride || c.summary, writable },
    });
  }
  await db.googleCal.deleteMany({ where: { accountId, calendarId: { notIn: seen } } });
}

// Corps d'événement Google à partir du formulaire de l'app
export function toGoogleEvent(b: { title: string; allDay: boolean; start: string; end: string; location?: string; description?: string }) {
  const nextDay = (d: string) => {
    const x = new Date(d + "T12:00:00Z");
    x.setUTCDate(x.getUTCDate() + 1);
    return x.toISOString().slice(0, 10);
  };
  const withSeconds = (s: string) => (s.length === 16 ? s + ":00" : s);
  return {
    summary: b.title,
    location: b.location ?? "",
    description: b.description ?? "",
    start: b.allDay ? { date: b.start.slice(0, 10) } : { dateTime: withSeconds(b.start), timeZone: TZ },
    // En journée entière, Google attend une date de fin exclusive
    end: b.allDay ? { date: nextDay(b.end.slice(0, 10)) } : { dateTime: withSeconds(b.end), timeZone: TZ },
  };
}

// Envoie un mail depuis le compte Gmail connecté
export async function sendGmail(accountId: string, to: string, subject: string, html: string, retried = false): Promise<void> {
  const token = await accessToken(accountId);
  const b64 = (t: string) => Buffer.from(t, "utf8").toString("base64");
  const mime = [
    `To: ${to}`,
    `Subject: =?UTF-8?B?${b64(subject)}?=`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64(html),
  ].join("\r\n");
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: Buffer.from(mime).toString("base64url") }),
  });
  if (res.status === 401 && !retried) {
    tokenCache.delete(accountId);
    await db.googleAccount.update({ where: { id: accountId }, data: { accessToken: "", expiresAt: new Date(0) } });
    return sendGmail(accountId, to, subject, html, true);
  }
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error?.message ?? `Gmail : erreur ${res.status}`);
  }
}
