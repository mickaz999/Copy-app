"use client";
import { useEffect, useState } from "react";
import { ChevronDown, Mic, Check, ChevronLeft, Clapperboard, Copy, ExternalLink, Folder, Link2, MessageSquare, Plus, Trash2, Film, CheckCircle2, Layers, RefreshCw, Star, ListChecks } from "lucide-react";
import { api } from "@/lib/api";
import FramePicker from "@/components/FramePicker";
import DropLinks from "@/components/DropLinks";
import { PUBLIC_URL, deliveryUrl } from "@/lib/site";
import ClientPick from "@/components/ClientPick";
import VoiceButton from "@/components/VoiceButton";
import VoicePlayer from "@/components/VoicePlayer";

type Project = { accountId: string; account: string; workspace: string; id: string; name: string; rootFolderId: string };
type Info = { configured: boolean; connected: boolean; projects: Project[]; error?: string };
type Item = { id: string; name: string; type: string; mediaType: string; createdAt: string; version: number };
const when = (iso: string) => iso ? new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
type File = { fileId: string; name: string };
type Comment = { audio?: string; fileName?: string; id: string; version: number; author: string; text: string; time: number | null; resolved: boolean };
type Delivery = { id: string; token: string; title: string; client: string; message: string; networks: string; mode: string; linked: { id: string; title: string; status: string; done: number; total: number }[]; accountId: string; files: string; download: boolean; approvedV: number; approvedAt: string | null; comments: Comment[]; kind: string; approved: string; dlMode: string; feedback: string; validation: boolean; createdAt: string; expiresAt: string | null; viewers?: { email: string }[]; space?: string; messages?: { id: string; fromMe: boolean; author: string; text: string; audio: string; createdAt: string }[] };
// Fin de validité du lien : 1 mois après la création, sauf prolongation ; supprimé 7 jours après
const expiry = (d: { createdAt: string; expiresAt: string | null }) => new Date(d.expiresAt ?? Date.parse(d.createdAt) + 30 * 864e5);
// Choix : versions d'une même vidéo ou plusieurs vidéos différentes
function KindPicker({ value, onChange }: { value: string; onChange: (k: string) => void }) {
  return (
    <div className="field-line">Ces fichiers sont…
      <div className="seg liv-mode">
        <button type="button" className={value !== "videos" ? "on" : ""} onClick={() => onChange("versions")}>Des versions (V1, V2…)</button>
        <button type="button" className={value === "videos" ? "on" : ""} onClick={() => onChange("videos")}>Des vidéos / photos différentes</button>
      </div>
    </div>
  );
}

const tc = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const NETS = [["reel", "Instagram"], ["tiktok", "TikTok"], ["short", "Shorts"], ["youtube", "YouTube"]];
// Choix des aperçus réseaux proposés au client (aucun = automatique selon le format)
function NetPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="field-line">Aperçus réseaux
      <div className="net-pick">
        {NETS.map(([k, label]) => <button key={k} type="button" className={value.includes(k) ? "on" : ""} onClick={() => onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k])}>{label}</button>)}
      </div>
      <span className="muted small">{value.length ? "Le lien s'ouvre directement sur le premier choisi." : "Aucun choisi : automatique (Instagram, TikTok, Shorts en vertical ; YouTube en horizontal)."}</span>
    </div>
  );
}
// Lien d'avis Google montré aux clients sur les pages de livraison
function ReviewSetting() {
  const [url, setUrl] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { api<{ reviewUrl: string }>("livraisons?settings=1").then((r) => setUrl(r.reviewUrl)).catch(() => {}); }, []);
  if (url === null) return null;
  return (
    <section className="settings-card">
      <div className="sc-head"><Star size={18} /> <h3>Avis Google</h3></div>
      <p className="muted small">Affiché sur tes pages de livraison, et mis en avant dès que le client valide une vidéo. Laisse vide pour le cacher.</p>
      <label className="field-line">Lien « laisser un avis »
        <input value={url} onChange={(e) => { setUrl(e.target.value); setSaved(false); }} onBlur={async () => { await api("livraisons", "POST", { action: "review-url", url }); setSaved(true); }} />
      </label>
      {saved && <span className="ok-pill small">Enregistré</span>}
    </section>
  );
}
const errorText = (e: unknown) => { const raw = (e as Error).message; try { return JSON.parse(raw).error ?? raw; } catch { return raw; } };




// agency = page « Suivis agence » (suivis Frame) ; sinon Livraisons (liens maderino)
export function LivraisonsView({ agency }: { agency: boolean }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [list, setList] = useState<Delivery[]>([]);
  const [draft, setDraft] = useState<{ title: string; client: string; message: string; networks: string[]; mode: string; kind: string; accountId: string; files: File[]; folderId?: string; folderName?: string } | null>(null);
  const [picking, setPicking] = useState<"new" | string | null>(null);
  const [open, setOpen] = useState("");
  // Liens expirés masqués du menu (supprimés automatiquement 7 jours après)
  const [showOld, setShowOld] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () => api<Delivery[]>("livraisons").then(setList);
  useEffect(() => {
    api<Info>("frameio/projects").then(setInfo).catch((e) => setInfo({ configured: true, connected: true, projects: [], error: errorText(e) }));
    load();
  }, []);

  // Client renseigné : on envoie son espace (tout ce qu'il a en cours) ; sinon (agence) le lien direct
  const direct = (d: Delivery) => deliveryUrl(d);
  const link = (d: Delivery) => d.space || direct(d);
  const filesOf = (d: Delivery): File[] => JSON.parse(d.files || "[]");

  const [notify, setNotify] = useState(true);
  async function tellClient(id: string) {
    try { const r = await api<{ sent: number }>("clients", "POST", { action: "notify", kind: "delivery", id }); setMsg({ ok: true, text: r.sent ? `Client prévenu par mail (${r.sent} adresse${r.sent > 1 ? "s" : ""}).` : "Pas de mail connu pour ce client : ajoute-le dans sa fiche pour le prévenir." }); }
    catch (e) { setMsg({ ok: false, text: errorText(e) }); }
  }
  async function create() {
    try {
      const d = await api<{ id: string }>("livraisons", "POST", draft);
      const withMail = notify && draft?.mode !== "frame" && !!draft?.client.trim();
      setDraft(null); load();
      if (withMail) {
        try { const r = await api<{ sent: number }>("clients", "POST", { action: "notify", kind: "delivery", id: d.id }); setMsg({ ok: true, text: r.sent ? `Livraison créée, client prévenu par mail (${r.sent} adresse${r.sent > 1 ? "s" : ""}). Elle apparaît sur son espace.` : "Livraison créée : elle apparaît sur l'espace du client." }); }
        catch { setMsg({ ok: true, text: "Livraison créée : elle apparaît sur l'espace du client." }); }
      } else setMsg({ ok: true, text: "Livraison créée : copie le lien et envoie-le au client." });
    } catch (e) { setMsg({ ok: false, text: errorText(e) }); }
  }

  async function pick(accountId: string, f: File[]) {
    // Photos ou plusieurs fichiers d'un coup : par défaut, des fichiers différents (pas des versions)
    if (picking === "new") setDraft((d) => d && { ...d, accountId, files: [...d.files, ...f], kind: d.files.length + f.length > 1 && (f.length > 1 || /\.(jpe?g|png|heic|webp|tiff?)$/i.test(f[0]?.name ?? "")) ? "videos" : d.kind });
    else {
      const d = list.find((x) => x.id === picking)!;
      if (d.accountId !== accountId) { setMsg({ ok: false, text: "Choisis une vidéo du même compte Frame.io." }); return; }
      // Fichiers déjà dans la livraison ignorés : « Tout le dossier » ajoute seulement ce qui manque
      const have = new Set(filesOf(d).map((x) => x.fileId));
      f = f.filter((x) => !have.has(x.fileId));
      if (!f.length) { setMsg({ ok: true, text: "Tous ces fichiers sont déjà dans la livraison." }); setPicking(null); return; }
      await api(`livraisons/${d.id}`, "PATCH", { files: [...filesOf(d), ...f] });
      setMsg({ ok: true, text: d.kind === "videos" ? `${f.length} fichier${f.length > 1 ? "s" : ""} ajouté${f.length > 1 ? "s" : ""} à « ${d.title} ». Même lien pour le client.` : `V${filesOf(d).length + f.length} ajoutée à « ${d.title} ». Le client la voit avec le même lien.` }); load();
    }
    setPicking(null);
  }

  return (
    <div className="content narrow">
      <div className="eyebrow">{agency ? "agences" : "livraisons"}</div>
      <h1 className="title">tes <span className="accent">{agency ? "suivis agence." : "livraisons."}</span></h1>
      {agency && <p className="muted">Les commentaires laissés sur Frame.io par l&apos;agence arrivent en tâches « Modifs » dans le Planning.</p>}
      {msg && <div className={`notice ${msg.ok ? "ok" : "err"}`} onClick={() => setMsg(null)}>{msg.text}</div>}

      {info && !info.configured && <section className="settings-card warn"><p>Il manque <b>FRAMEIO_CLIENT_ID</b> et <b>FRAMEIO_CLIENT_SECRET</b> dans les variables Vercel.</p></section>}
      {info?.configured && !info.connected && (
        <section className="settings-card">
          <div className="sc-head"><Clapperboard size={18} /> <h3>Frame.io</h3></div>
          <p className="muted">Connecte ton compte Frame.io (connexion Adobe) pour livrer tes vidéos depuis l&apos;app.</p>
          <div className="row"><a href="/api/connect/frameio"><button className="primary"><Link2 size={16} /> Connecter Frame.io</button></a></div>
        </section>
      )}
      {info?.error && <section className="settings-card warn"><p>{info.error}</p><a href="/api/connect/frameio"><button><Link2 size={16} /> Reconnecter Frame.io</button></a></section>}

      {info?.connected && !draft && <div className="row" style={{ marginBottom: 16 }}>
        <button className="primary" onClick={() => setDraft({ title: "", client: "", message: "", networks: [], mode: agency ? "frame" : "page", kind: "versions", accountId: "", files: [] })}><Plus size={16} /> {agency ? "Nouveau suivi agence" : "Nouvelle livraison"}</button></div>}

      {draft && (
        <section className="settings-card">
          <h3>{agency ? "Nouveau suivi agence" : "Nouvelle livraison"}</h3>
          <p className="muted small">{draft.mode === "page"
            ? "Le client reçoit ta page à tes couleurs. Ses retours créent une tâche « Modifs » dans le Planning."
            : "Tu continues à partager le lien Frame.io de l'agence. L'app lit les commentaires laissés sur Frame (toutes les 5 min) et les ajoute à une tâche « Modifs » dans le Planning."}</p>
          <label className="field-line">Titre du projet<input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Clip « Été 2026 »" /></label>
          {draft.mode !== "frame" && <ClientPick value={draft.client} onChange={(v) => setDraft({ ...draft, client: v })} />}
          {draft.mode === "page" && <>
            <label className="field-line">Message au client (facultatif)<textarea rows={2} value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })} placeholder="Salut ! Voici la V1 du clip, dis-moi ce que tu en penses." /></label>
            <NetPicker value={draft.networks} onChange={(networks) => setDraft({ ...draft, networks })} />
          </>}
          <div className="field-line">Vidéo(s)</div>
          {draft.folderId && <div className="liv-item static"><Folder size={15} /> Dossier « {draft.folderName} » (sous-dossiers compris, à jour en direct)</div>}
          {draft.files.map((f, i) => <div key={i} className="liv-item static"><Film size={15} /> {draft.kind === "videos" ? f.name : `V${i + 1} · ${f.name}`}</div>)}
          {draft.files.length > 1 && <KindPicker value={draft.kind} onChange={(kind) => setDraft({ ...draft, kind })} />}
          <div className="row">
            {!draft.folderId && <button onClick={() => setPicking("new")}><Plus size={15} /> {draft.files.length ? "Ajouter une version" : "Choisir sur Frame.io"}</button>}
            <span style={{ flex: 1 }} />
            <button onClick={() => setDraft(null)}>Annuler</button>
            {draft.mode !== "frame" && <label className="check"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Prévenir le client par mail</label>}
            <button className="primary" disabled={!draft.title.trim() || (!draft.files.length && !draft.folderId)} onClick={create}>{draft.mode === "frame" ? "Suivre" : "Créer le lien"}</button>
          </div>
        </section>
      )}

      {(() => { const n = list.filter((d) => d.mode !== "frame" && expiry(d).getTime() < Date.now()).length; return n > 0 && <div className="row"><button className="ghost small" onClick={() => setShowOld(!showOld)}>{showOld ? "Masquer les liens expirés" : `Voir les liens expirés (${n})`}</button></div>; })()}
      {list.filter((d) => (agency ? d.mode === "frame" : d.mode !== "frame") && (showOld || d.mode === "frame" || expiry(d).getTime() >= Date.now())).map((d) => {
        const files = filesOf(d);
        const todo = d.comments.filter((c) => !c.resolved).length;
        return (
          <section key={d.id} className="settings-card">
            <div className="liv-row" onClick={() => setOpen(open === d.id ? "" : d.id)}>
              <div>
                <b>{d.title}</b>{d.client && <span className="muted"> · {d.client}</span>}
                <div className="muted small">{d.kind === "folder" ? "Dossier Frame (en direct)" : d.kind === "videos" ? `${files.length} vidéos` : `V${files.length}`} · {d.comments.length} retour{d.comments.length > 1 ? "s" : ""}{todo ? ` (${todo} à traiter)` : ""}{d.viewers?.length ? ` · vu par ${d.viewers.map((x) => x.email).join(", ")}` : ""}</div>
              </div>
              {d.mode !== "frame" && expiry(d).getTime() < Date.now() && <span className="late-pill">lien expiré</span>}
              {d.mode !== "frame" && <button className="ghost liv-quick" title="Copier le lien" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(link(d)); setMsg({ ok: true, text: d.space ? `Lien de l'espace ${d.client} copié.` : "Lien copié." }); }}><Copy size={15} /></button>}
              {d.kind === "videos" && JSON.parse(d.approved || "[]").length ? <span className="ok-pill"><CheckCircle2 size={14} /> {JSON.parse(d.approved).length}/{files.length} validées</span> : d.approvedV ? <span className="ok-pill"><CheckCircle2 size={14} /> V{d.approvedV} validée</span> : todo ? <span className="late-pill"><MessageSquare size={12} /> {todo}</span> : null}
              <ChevronDown size={18} className={`liv-chev ${open === d.id ? "on" : ""}`} />
            </div>
            {open === d.id && <>
            {d.linked.map((t) => (
              <a key={t.id} className="liv-task" href="/planning">
                <span className="liv-task-t"><ListChecks size={15} /> {t.title}</span>
                <span className="muted small">{t.status === "done" ? "terminée ✓" : t.total ? `${t.done}/${t.total} retours corrigés` : "à faire"}</span>
              </a>
            ))}
            <div className="row">
              {d.mode === "frame"
                ? <>
                    <span className="ok-pill">Suivi Frame</span>
                    <button onClick={async () => { try { const r = await api<{ added: number }>(`livraisons/${d.id}`, "PATCH", { action: "sync" }); setMsg({ ok: true, text: r.added ? `${r.added} nouveau(x) retour(s) Frame ajouté(s) au Planning.` : "Aucun nouveau commentaire sur Frame." }); load(); } catch (e) { setMsg({ ok: false, text: errorText(e) }); } }}><RefreshCw size={15} /> Vérifier Frame</button>
                  </>
                : <>
                    <button className="primary" onClick={() => { navigator.clipboard.writeText(link(d)); setMsg({ ok: true, text: d.space ? `Lien de l'espace ${d.client} copié : la livraison y est, avec tout ce qu'il a en cours.` : "Lien copié." }); }}><Copy size={15} /> {d.space ? "Copier son espace" : "Copier le lien"}</button>
                    {d.space && <button onClick={() => { navigator.clipboard.writeText(direct(d)); setMsg({ ok: true, text: "Lien direct de la livraison copié." }); }}><Link2 size={15} /> Lien direct</button>}
                    <button onClick={() => window.open(direct(d), "_blank")}><ExternalLink size={15} /> Voir</button>
                    {d.client && <button onClick={() => tellClient(d.id)}>Prévenir le client</button>}
                  </>}
              {d.kind !== "folder" && <button onClick={() => setPicking(d.id)}><Plus size={15} /> Nouvelle version</button>}
              {d.mode !== "frame" && (
                <span className="liv-exp">
                  <span className={`small ${expiry(d).getTime() < Date.now() ? "neg" : "muted"}`}>
                    {expiry(d).getTime() < Date.now()
                      ? `Expiré, supprimé le ${new Date(expiry(d).getTime() + 7 * 864e5).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`
                      : `Valable jusqu'au ${expiry(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`}
                  </span>
                  <button onClick={async () => { await api(`livraisons/${d.id}`, "PATCH", { action: "extend" }); setMsg({ ok: true, text: `Lien « ${d.title} » prolongé d'un mois.` }); load(); }}>Prolonger d&apos;un mois</button>
                </span>
              )}
              {d.mode !== "frame" && (
                <label className="field-line liv-dl">Validation
                  <select value={d.validation === false ? "no" : "yes"} onChange={async (e) => { await api(`livraisons/${d.id}`, "PATCH", { validation: e.target.value === "yes" }); load(); }}>
                    <option value="yes">Requise</option>
                    <option value="no">Pas nécessaire</option>
                  </select>
                </label>
              )}
              {d.mode !== "frame" && (
                <label className="field-line liv-dl">Retours
                  <select value={d.feedback} onChange={async (e) => { await api(`livraisons/${d.id}`, "PATCH", { feedback: e.target.value }); load(); }}>
                    <option value="ask">Sur demande</option>
                    <option value="open">Toujours visibles</option>
                    <option value="off">Désactivés</option>
                  </select>
                </label>
              )}
              {d.mode !== "frame" && (
                <label className="field-line liv-dl">Téléchargement
                  <select value={!d.download ? "never" : d.dlMode} onChange={async (e) => { await api(`livraisons/${d.id}`, "PATCH", { dlMode: e.target.value }); load(); }}>
                    <option value="always">Toujours</option>
                    <option value="approved">Après validation</option>
                    <option value="never">Jamais</option>
                  </select>
                </label>
              )}
            </div>
            {d.mode !== "frame" && (
              <ClientPick value={d.client} onChange={async (v) => { await api(`livraisons/${d.id}`, "PATCH", { client: v }); setMsg({ ok: true, text: v ? `Client « ${v} » ajouté : la livraison apparaît sur son espace.` : "Client retiré." }); load(); }} />
            )}
            {d.mode !== "frame" && <VoiceNote d={d} reload={load} onMsg={setMsg} />}
            </>}
            {open === d.id && (
              <div className="liv-detail">
                <label className="field-line">Titre<input defaultValue={d.title} onBlur={async (e) => { if (e.target.value !== d.title) { await api(`livraisons/${d.id}`, "PATCH", { title: e.target.value }); load(); } }} /></label>
                {files.length > 1 && <KindPicker value={d.kind} onChange={async (kind) => { await api(`livraisons/${d.id}`, "PATCH", { kind }); load(); }} />}
                {d.mode !== "frame" && <NetPicker value={JSON.parse(d.networks || "[]")} onChange={async (networks) => { await api(`livraisons/${d.id}`, "PATCH", { networks }); load(); }} />}
                <label className="field-line">Message au client<textarea rows={2} defaultValue={d.message} onBlur={async (e) => { if (e.target.value !== d.message) { await api(`livraisons/${d.id}`, "PATCH", { message: e.target.value }); load(); } }} /></label>
                {d.kind === "folder" && (
                  <div className="liv-vblock">
                    <b>Retours sur le dossier</b>
                    {d.comments.length === 0 && <p className="muted small">Aucun retour.</p>}
                    {d.comments.map((c) => (
                      <label key={c.id} className={`liv-admin-c ${c.resolved ? "done" : ""}`}>
                        <input type="checkbox" checked={c.resolved} onChange={async (e) => { await api(`livraisons/${d.id}`, "PATCH", { commentId: c.id, resolved: e.target.checked }); load(); }} />
                        <span>{c.fileName && <b>{c.fileName} · </b>}{c.time !== null && <b className="liv-tc">{tc(c.time)}</b>} <b>{c.author}</b> : {c.audio ? <audio controls preload="none" src={`/api/livraison/${d.token}/audio?id=${c.id}`} /> : c.text}</span>
                      </label>
                    ))}
                  </div>
                )}
                {files.map((f, i) => {
                  const cs = d.comments.filter((c) => c.version === i + 1);
                  return (
                    <div key={i} className="liv-vblock">
                      <b>{d.kind === "videos" ? f.name : `V${i + 1} · ${f.name}`}</b>
                      {cs.length === 0 && <p className="muted small">Aucun retour.</p>}
                      {cs.map((c) => (
                        <label key={c.id} className={`liv-admin-c ${c.resolved ? "done" : ""}`}>
                          <input type="checkbox" checked={c.resolved} onChange={async (e) => { await api(`livraisons/${d.id}`, "PATCH", { commentId: c.id, resolved: e.target.checked }); load(); }} />
                          <span>{c.time !== null && <b className="liv-tc">{tc(c.time)}</b>} <b>{c.author}</b> : {c.audio ? <audio controls preload="none" src={`/api/livraison/${d.token}/audio?id=${c.id}`} /> : c.text}</span>
                        </label>
                      ))}
                    </div>
                  );
                })}
                <button className="ghost neg" onClick={async () => { if (confirm(`Supprimer la livraison « ${d.title} » ? Le lien ne marchera plus (les vidéos restent sur Frame.io).`)) { await api(`livraisons/${d.id}`, "DELETE"); load(); } }}><Trash2 size={15} /> Supprimer la livraison</button>
              </div>
            )}
          </section>
        );
      })}
      {info?.connected && !list.some((d) => (agency ? d.mode === "frame" : d.mode !== "frame")) && !draft && <p className="muted">{agency ? "Aucun suivi agence pour l'instant." : "Aucune livraison pour l'instant."}</p>}

      {!agency && info?.connected && <DropLinks projects={info.projects} />}
      {!agency && <ReviewSetting />}

      {picking && info && <FramePicker projects={info.projects} onPick={pick} onClose={() => setPicking(null)}
        onPickFolder={picking === "new" ? (accountId, f) => { setDraft((d) => d && { ...d, accountId, files: [], folderId: f.id, folderName: f.name, kind: "folder", mode: "page", title: d.title || f.name }); setPicking(null); } : undefined} />}
    </div>
  );
}

// Note vocale pour le client (affichée sur sa page de livraison) et ses réponses
function VoiceNote({ d, reload, onMsg }: { d: Delivery; reload: () => void; onMsg: (m: { ok: boolean; text: string }) => void }) {
  const [voice, setVoice] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const msgs = d.messages ?? [];
  const [on, setOn] = useState(false);
  async function send() {
    setBusy(true);
    try { await api(`livraisons/${d.id}/messages`, "POST", { audio: voice || undefined, text }); setVoice(""); setText(""); onMsg({ ok: true, text: "Message envoyé : le client le voit sur sa page, avec un endroit pour te répondre." }); reload(); }
    catch (e) { onMsg({ ok: false, text: errorText(e) }); }
    finally { setBusy(false); }
  }
  // Désactivé par défaut : j'active la note vocale sur la livraison quand j'en ai besoin
  if (!on && !msgs.length) return <div className="row"><button onClick={() => setOn(true)}><Mic size={15} /> Ajouter une note vocale</button></div>;
  return (
    <div className="liv-thread admin">
      {!msgs.length && <div className="row"><b className="small">Note vocale pour le client</b><button className="ghost" onClick={() => { setOn(false); setVoice(""); setText(""); }}>Annuler</button></div>}
      {msgs.map((m) => (
        <div key={m.id} className={`liv-bubble ${m.fromMe ? "me" : "you"}`}>
          <span className="liv-bubble-who">{m.fromMe ? "Toi" : m.author || d.client || "Client"} · {new Date(m.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
            {m.fromMe && <button className="ghost" title="Supprimer" onClick={async () => { await api(`livraisons/${d.id}/messages`, "POST", { delete: m.id }); reload(); }}><Trash2 size={13} /></button>}
          </span>
          {m.audio && <VoicePlayer src={`/api/livraison/${d.token}/msg?id=${m.id}`} />}
          {m.text && <p>{m.text}</p>}
        </div>
      ))}
      <div className="row">
        {voice
          ? <div className="liv-voice-ready"><audio controls src={voice} /><button type="button" className="ghost" onClick={() => setVoice("")}>Supprimer</button></div>
          : <><VoiceButton onDone={setVoice} /><input placeholder={msgs.length ? "Répondre au client…" : "Note vocale ou message pour le client"} value={text} onChange={(e) => setText(e.target.value)} style={{ flex: 1 }} /></>}
        <button className="primary" disabled={busy || (!voice && !text.trim())} onClick={send}>{busy ? "Envoi…" : "Envoyer"}</button>
      </div>
    </div>
  );
}

