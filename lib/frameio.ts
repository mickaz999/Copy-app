import { db } from "@/lib/db";
import { userToken } from "@/lib/social";

const API = "https://api.frame.io/v4";

export const frameConfigured = () => !!(process.env.FRAMEIO_CLIENT_ID && process.env.FRAMEIO_CLIENT_SECRET);
export const frameConnected = async () => !!(await db.apiToken.findUnique({ where: { provider: "frameio" } }));

// Appel à l'API Frame.io V4 avec le compte connecté
export async function fio(path: string, init: RequestInit = {}) {
  const token = await userToken("frameio");
  if (!token) throw new Error("Frame.io n'est pas connecté.");
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Frame.io ${res.status} : ${body?.errors?.[0]?.detail ?? body?.message ?? JSON.stringify(body).slice(0, 200)}`);
  return body;
}

// Tous les projets de tous les espaces de travail du compte
export async function listProjects() {
  const { data: accounts = [] } = await fio("/accounts");
  const out: { accountId: string; account: string; workspace: string; id: string; name: string; rootFolderId: string }[] = [];
  for (const a of accounts) {
    const { data: workspaces = [] } = await fio(`/accounts/${a.id}/workspaces`);
    for (const w of workspaces) {
      const { data: projects = [] } = await fio(`/accounts/${a.id}/workspaces/${w.id}/projects`);
      for (const p of projects) out.push({ accountId: a.id, account: a.display_name ?? a.name ?? "", workspace: w.name ?? "", id: p.id, name: p.name, rootFolderId: p.root_folder_id ?? "" });
    }
  }
  return out;
}
