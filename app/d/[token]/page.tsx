"use client";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, CloudUpload, FileVideo, X, AlertTriangle } from "lucide-react";
import Logo from "@/components/Logo";
import LivLoader from "@/components/LivLoader";
import ContactBlock from "@/components/ContactBlock";
import VoiceButton from "@/components/VoiceButton";

type Info = { notes?: { text: string; audio: boolean; author: string }[]; expiresAt?: string; title: string; client: string; message: string; files: { name: string; size: number; author: string; createdAt: string }[] };
type Job = { dir: string; key: string; file: File; sent: number; status: "wait" | "up" | "ok" | "err"; error?: string };

const size = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} Go` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} Mo` : `${Math.ceil(n / 1e3)} Ko`);

// Page de dépôt de rushs : les fichiers partent directement du navigateur vers Frame.io, morceau par morceau
export default function Drop({ params }: { params: { token: string } }) {
  const url = `/api/drop/${params.token}`;
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState("");
  const [author, setAuthor] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [running, setRunning] = useState(false);
  const [over, setOver] = useState(false);
  const [done, setDone] = useState<{ n: number; total: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  // Brief du client (texte et/ou vocal)
  const [brief, setBrief] = useState("");
  const [voice, setVoice] = useState("");
  const [briefState, setBriefState] = useState<"" | "busy" | "ok">("");
  async function sendBrief() {
    if (!author.trim()) return setError("Indique ton prénom avant d'envoyer le brief.");
    setBriefState("busy"); setError("");
    const r = await post({ action: "brief", text: brief, audio: voice || undefined });
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? "Erreur"); setBriefState(""); return; }
    setBrief(""); setVoice(""); setBriefState("ok"); load();
  }
  // iPhone / iPad : les navigateurs intégrés (WhatsApp, Instagram…) bloquent souvent la sélection de vidéos.
  // WhatsApp ne se signale pas : sur iOS on propose toujours d'ouvrir dans Safari (« x-safari-https » ouvre Safari, iOS 17+)
  const [ios, setIos] = useState<{ inApp: boolean } | null>(null);
  useEffect(() => {
    const ua = navigator.userAgent;
    if (!/iPhone|iPad|iPod/.test(ua)) return;
    const inApp = /WhatsApp|Instagram|FBAN|FBAV|FB_IAB|Snapchat|Line\/|TikTok|musical_ly|LinkedInApp/i.test(ua) || !/Safari\//.test(ua);
    try { if (!inApp && sessionStorage.getItem("drop-safari-ok")) return; } catch {}
    setIos({ inApp });
  }, []);

  const load = () => fetch(url).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setInfo(j); }).catch((e) => setError(e.message));
  useEffect(() => { load(); try { setAuthor(localStorage.getItem("drop-author") ?? ""); } catch {} }, []);
  // Prévenir avant de fermer la page pendant un envoi
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (running) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  // Fichiers (avec leur dossier d'origine : « Rushs/Jour 1 ») ; fichiers cachés du système ignorés
  const addFiles = (list: { file: File; dir: string }[]) => {
    const ok = list.filter(({ file }) => !/^\.|^(thumbs\.db|desktop\.ini)$/i.test(file.name));
    if (!ok.length) return;
    setDone(null);
    setJobs((j) => [...j, ...ok.map(({ file, dir }) => ({ key: `${dir}/${file.name}-${file.size}-${Math.random()}`, file, dir, sent: 0, status: "wait" as const }))]);
  };
  const add = (list: FileList | null) => {
    if (!list) return;
    addFiles(Array.from(list).map((file) => {
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || "";
      return { file, dir: rel.split("/").slice(0, -1).join("/") };
    }));
  };
  // Glisser-déposer : parcourt les dossiers déposés, sous-dossiers compris
  async function dropItems(dt: DataTransfer) {
    const entries = Array.from(dt.items).map((i) => (i as DataTransferItem & { webkitGetAsEntry?: () => any }).webkitGetAsEntry?.()).filter(Boolean);
    if (!entries.length) return add(dt.files);
    const out: { file: File; dir: string }[] = [];
    const walk = async (e: any, dir: string): Promise<void> => {
      if (e.isFile) { out.push({ file: await new Promise<File>((ok, ko) => e.file(ok, ko)), dir }); return; }
      if (!e.isDirectory) return;
      const reader = e.createReader();
      const sub = dir ? `${dir}/${e.name}` : e.name;
      for (;;) {
        const batch: any[] = await new Promise((ok, ko) => reader.readEntries(ok, ko));
        if (!batch.length) break;
        for (const c of batch) await walk(c, sub);
      }
    };
    for (const e of entries) await walk(e, "");
    addFiles(out);
  }
  const folderInput = useRef<HTMLInputElement>(null);
  const patch = (key: string, p: Partial<Job>) => setJobs((all) => all.map((j) => (j.key === key ? { ...j, ...p } : j)));
  const post = (body: object) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ author, ...body }) });

  // Page cachée (appli quittée, écran verrouillé) : le navigateur met l'envoi en pause ; on attend le retour
  const waitVisible = () => new Promise<void>((ok) => {
    if (document.visibilityState === "visible") return ok();
    const on = () => { if (document.visibilityState === "visible") { document.removeEventListener("visibilitychange", on); ok(); } };
    document.addEventListener("visibilitychange", on);
  });
  // Envoi en cours par fichier : on reprend au morceau où on s'était arrêté (pas de renvoi depuis le début)
  const progress = useRef<Record<string, { fileId: string; type: string; urls: { url: string; size: number }[]; next: number; offset: number }>>({});

  async function sendOne(job: Job) {
    patch(job.key, { status: "up", error: undefined });
    let st = progress.current[job.key];
    if (!st) {
      const r = await post({ action: "start", name: job.file.name, size: job.file.size, dir: job.dir });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Envoi refusé");
      st = progress.current[job.key] = { fileId: j.fileId, type: j.mediaType || job.file.type || "application/octet-stream", urls: j.urls, next: 0, offset: 0 };
    }
    for (; st.next < st.urls.length; st.next++) {
      const part = st.urls[st.next];
      const chunk = job.file.slice(st.offset, st.offset + part.size);
      // Coupure ou page mise en pause : on réessaie (en attendant que la page revienne au premier plan)
      for (let attempt = 1; ; attempt++) {
        await waitVisible();
        const res = await fetch(part.url, { method: "PUT", body: chunk, headers: { "Content-Type": st.type, "x-amz-acl": "private" } }).catch(() => null);
        if (res?.ok) break;
        if (attempt >= 8) throw new Error("Connexion trop instable : appuie sur Envoyer pour reprendre");
        await new Promise((ok) => setTimeout(ok, Math.min(1500 * attempt, 8000)));
      }
      st.offset += part.size;
      patch(job.key, { sent: Math.min(st.offset, job.file.size) });
    }
    const j = st;
    await post({ action: "done", name: job.file.name, size: job.file.size, fileId: j.fileId });
    delete progress.current[job.key];
    patch(job.key, { status: "ok", sent: job.file.size });
  }

  async function start() {
    if (!author.trim()) return setError("Indique ton prénom avant d'envoyer.");
    setError(""); setRunning(true);
    try { localStorage.setItem("drop-author", author); } catch {}
    // Empêche l'écran de se mettre en veille pendant l'envoi (si le navigateur le permet)
    let lock: { release: () => Promise<void> } | null = null;
    const getLock = async () => { try { lock = await (navigator as any).wakeLock?.request("screen"); } catch {} };
    await getLock();
    const relock = () => { if (document.visibilityState === "visible") getLock(); };
    document.addEventListener("visibilitychange", relock);
    const ok: Job[] = [];
    for (const job of jobs.filter((x) => x.status === "wait" || x.status === "err")) {
      try { await sendOne(job); ok.push(job); }
      catch (e) { patch(job.key, { status: "err", error: (e as Error).message }); }
    }
    if (ok.length) {
      const total = ok.reduce((n, x) => n + x.file.size, 0);
      await post({ action: "finish", names: ok.map((x) => x.file.name), total });
      setDone({ n: ok.length, total });
      load();
    }
    document.removeEventListener("visibilitychange", relock);
    (lock as { release: () => Promise<void> } | null)?.release().catch(() => {});
    setRunning(false);
  }

  if (!info && !error) return <LivLoader steps={["Ouverture de l'espace de dépôt", "Presque prêt"]} />;
  if (!info) return <div className="rdv liv-dark-solo"><div className="rdv-card"><a className="logo-link" href="https://maderinoprod.com" target="_blank" rel="noreferrer" aria-label="maderinoprod.com"><Logo /></a><p className="neg">{error}</p><ContactBlock /></div></div>;
  const pending = jobs.filter((j) => j.status !== "ok");
  const totalSize = jobs.reduce((n, j) => n + j.file.size, 0);
  const sentSize = jobs.reduce((n, j) => n + j.sent, 0);

  return (
    <div className="liv dark drop">
      <div className="liv-bg drop-bg" />
      <div className="liv-top"><a className="logo-link" href="https://maderinoprod.com" target="_blank" rel="noreferrer" aria-label="maderinoprod.com"><Logo /></a><span className="muted small">Dépôt privé</span></div>
      <header className="liv-hero">
        <div className="liv-hero-text">
          <span className="eyebrow">{info.client ? `dépôt de rushs · ${info.client}` : "dépôt de rushs"}</span>
          <h1>{info.title}</h1>
          <p className="liv-msg">{info.message || "Glisse tes rushs ici, ils m'arrivent directement. Aucun compte à créer."}</p>
          {info.expiresAt && <div className="liv-chips"><span className="liv-days">{(() => { const n = Math.ceil((Date.parse(info.expiresAt) - Date.now()) / 864e5); return n <= 1 ? "Lien valable encore 1 jour" : `Lien valable encore ${n} jours`; })()}</span><span>jusqu&apos;au {new Date(info.expiresAt).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</span></div>}
        </div>
      </header>

      {ios && (
        <div className={`drop-safari ${ios.inApp ? "strong" : ""}`}>
          <b>{ios.inApp ? "Ouvre cette page dans Safari pour envoyer tes vidéos" : "Tu as ouvert ce lien depuis WhatsApp ?"}</b>
          <span>Le navigateur de WhatsApp (ou Instagram) bloque souvent la sélection des vidéos. Dans Safari, ça marche directement.</span>
          <div className="drop-safari-actions">
            <a className="drop-safari-btn" href={`x-safari-${typeof window !== "undefined" ? window.location.href : ""}`}>Ouvrir dans Safari</a>
            {!ios.inApp && <button className="ghost" onClick={() => { try { sessionStorage.setItem("drop-safari-ok", "1"); } catch {} setIos(null); }}>Je suis déjà dans Safari</button>}
          </div>
          <small>Sinon : touche ••• ou la boussole en bas à droite, puis « Ouvrir dans Safari ».</small>
        </div>
      )}

      <section className="drop-card">
        <input className="drop-name" placeholder="Ton prénom" value={author} onChange={(e) => setAuthor(e.target.value)} disabled={running} />
        <div className={`drop-zone ${over ? "over" : ""}`} onClick={() => !running && input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); if (!running) dropItems(e.dataTransfer); }}>
          <CloudUpload size={30} strokeWidth={1.5} />
          <b>Dépose tes fichiers</b>
          <span className="muted">Fichiers ou dossiers entiers · vidéos, photos, sons · aucune limite de taille</span><span className="drop-picks">
            <span className="drop-pick">Choisir des fichiers</span>
            <span className="drop-pick" onClick={(e) => { e.stopPropagation(); if (!running) folderInput.current?.click(); }}>Choisir un dossier</span>
          </span>
          <input ref={input} type="file" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
          <input ref={folderInput} type="file" multiple hidden {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
        </div>

        {jobs.length > 0 && (
          <div className="drop-list">
            {jobs.map((j) => (
              <div key={j.key} className={`drop-row ${j.status}`}>
                <FileVideo size={18} />
                <div className="drop-row-main">
                  <div className="drop-row-top"><b>{j.dir ? <span className="muted">{j.dir}/</span> : null}{j.file.name}</b><span className="muted small">{j.status === "up" ? `${size(j.sent)} / ` : ""}{size(j.file.size)}</span></div>
                  <div className="drop-bar"><i style={{ width: `${(j.sent / j.file.size) * 100}%` }} /></div>
                  {j.error && <span className="neg small"><AlertTriangle size={12} /> {j.error}</span>}
                </div>
                {j.status === "ok" ? <CheckCircle2 size={18} className="ok" /> : !running && <button className="ghost" aria-label="Retirer" onClick={() => setJobs((all) => all.filter((x) => x.key !== j.key))}><X size={16} /></button>}
              </div>
            ))}
          </div>
        )}

        {error && <p className="neg">{error}</p>}
        {done && !running && <div className="drop-done"><CheckCircle2 size={20} /> C&apos;est bien reçu : {done.n} fichier{done.n > 1 ? "s" : ""} ({size(done.total)}). Merci !</div>}
        {pending.length > 0 && (
          <button className="primary drop-send" disabled={running} onClick={start}>
            {running ? `Envoi en cours… ${Math.round((sentSize / totalSize) * 100)} %` : `Envoyer ${pending.length} fichier${pending.length > 1 ? "s" : ""} (${size(pending.reduce((n, j) => n + j.file.size, 0))})`}
          </button>
        )}
        {running && (
          <div className="drop-keep">
            <b>Garde cette page ouverte jusqu&apos;à la fin</b>
            <span>L&apos;écran reste allumé pendant l&apos;envoi. Si tu quittes l&apos;appli ou verrouilles ton téléphone, l&apos;envoi se met en pause et <b>reprend tout seul</b> là où il s&apos;était arrêté quand tu reviens sur cette page.</span>
          </div>
        )}
      </section>

      <section className="drop-card drop-brief">
        <span className="rdv-group-label">Ton brief (facultatif)</span>
        <p className="muted small">Explique ce que tu veux : idée, style, durée, musique… À l&apos;écrit ou en vocal.</p>
        {voice
          ? <div className="liv-voice-ready"><audio controls src={voice} /><button type="button" className="ghost" onClick={() => setVoice("")}>Supprimer</button></div>
          : <textarea rows={4} placeholder="Ex : vidéo de 30 s pour Instagram, ambiance douce, mettre en avant le soin visage…" value={brief} onChange={(e) => setBrief(e.target.value)} />}
        <div className="row">
          {!voice && <VoiceButton onDone={setVoice} />}
          <span style={{ flex: 1 }} />
          <button className="primary" disabled={briefState === "busy" || (!brief.trim() && !voice)} onClick={sendBrief}>{briefState === "busy" ? "Envoi…" : "Envoyer le brief"}</button>
        </div>
        {briefState === "ok" && <div className="drop-done">Brief bien reçu, merci !</div>}
        {(info.notes?.length ?? 0) > 0 && <span className="muted small">{info.notes!.length} brief{info.notes!.length > 1 ? "s" : ""} déjà envoyé{info.notes!.length > 1 ? "s" : ""}.</span>}
      </section>

      {info.files.length > 0 && (
        <section className="drop-card">
          <span className="rdv-group-label">Déjà déposés ({info.files.length})</span>
          {info.files.slice(0, 50).map((f, i) => (
            <div key={i} className="drop-row ok"><CheckCircle2 size={16} className="ok" /><div className="drop-row-main"><div className="drop-row-top"><span>{f.name}</span><span className="muted small">{size(f.size)}{f.author ? ` · ${f.author}` : ""}</span></div></div></div>
          ))}
        </section>
      )}
      <footer className="liv-foot"><a className="logo-link" href="https://maderinoprod.com" target="_blank" rel="noreferrer" aria-label="maderinoprod.com"><Logo /></a></footer>
    </div>
  );
}
