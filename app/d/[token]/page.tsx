"use client";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, CloudUpload, FileVideo, X, AlertTriangle } from "lucide-react";
import Logo from "@/components/Logo";
import LivLoader from "@/components/LivLoader";

type Info = { expiresAt?: string; title: string; client: string; message: string; files: { name: string; size: number; author: string; createdAt: string }[] };
type Job = { key: string; file: File; sent: number; status: "wait" | "up" | "ok" | "err"; error?: string };

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

  const load = () => fetch(url).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setInfo(j); }).catch((e) => setError(e.message));
  useEffect(() => { load(); try { setAuthor(localStorage.getItem("drop-author") ?? ""); } catch {} }, []);
  // Prévenir avant de fermer la page pendant un envoi
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (running) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  const add = (list: FileList | null) => {
    if (!list) return;
    setDone(null);
    setJobs((j) => [...j, ...Array.from(list).map((file) => ({ key: `${file.name}-${file.size}-${Math.random()}`, file, sent: 0, status: "wait" as const }))]);
  };
  const patch = (key: string, p: Partial<Job>) => setJobs((all) => all.map((j) => (j.key === key ? { ...j, ...p } : j)));
  const post = (body: object) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ author, ...body }) });

  async function sendOne(job: Job) {
    patch(job.key, { status: "up", sent: 0, error: undefined });
    const r = await post({ action: "start", name: job.file.name, size: job.file.size });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? "Envoi refusé");
    const type = j.mediaType || job.file.type || "application/octet-stream";
    let offset = 0;
    for (const part of j.urls as { url: string; size: number }[]) {
      const chunk = job.file.slice(offset, offset + part.size);
      // 3 essais par morceau (coupure réseau)
      for (let attempt = 1; ; attempt++) {
        const res = await fetch(part.url, { method: "PUT", body: chunk, headers: { "Content-Type": type, "x-amz-acl": "private" } }).catch(() => null);
        if (res?.ok) break;
        if (attempt >= 3) throw new Error("Coupure pendant l'envoi, réessaie");
        await new Promise((ok) => setTimeout(ok, 1500 * attempt));
      }
      offset += part.size;
      patch(job.key, { sent: Math.min(offset, job.file.size) });
    }
    await post({ action: "done", name: job.file.name, size: job.file.size, fileId: j.fileId });
    patch(job.key, { status: "ok", sent: job.file.size });
  }

  async function start() {
    if (!author.trim()) return setError("Indique ton prénom avant d'envoyer.");
    setError(""); setRunning(true);
    try { localStorage.setItem("drop-author", author); } catch {}
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
    setRunning(false);
  }

  if (!info && !error) return <LivLoader steps={["Ouverture de l'espace de dépôt", "Presque prêt"]} />;
  if (!info) return <div className="rdv liv-dark-solo"><div className="rdv-card"><Logo /><p className="neg">{error}</p></div></div>;
  const pending = jobs.filter((j) => j.status !== "ok");
  const totalSize = jobs.reduce((n, j) => n + j.file.size, 0);
  const sentSize = jobs.reduce((n, j) => n + j.sent, 0);

  return (
    <div className="liv dark drop">
      <div className="liv-bg drop-bg" />
      <div className="liv-top"><Logo /><span className="muted small">Dépôt privé</span></div>
      <header className="liv-hero">
        <div className="liv-hero-text">
          <span className="eyebrow">{info.client ? `dépôt de rushs · ${info.client}` : "dépôt de rushs"}</span>
          <h1>{info.title}</h1>
          <p className="liv-msg">{info.message || "Glisse tes rushs ici, ils m'arrivent directement. Aucun compte à créer."}</p>
          {info.expiresAt && <div className="liv-chips"><span>Lien valable jusqu&apos;au {new Date(info.expiresAt).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</span></div>}
        </div>
      </header>

      <section className="drop-card">
        <input className="drop-name" placeholder="Ton prénom" value={author} onChange={(e) => setAuthor(e.target.value)} disabled={running} />
        <div className={`drop-zone ${over ? "over" : ""}`} onClick={() => !running && input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); if (!running) add(e.dataTransfer.files); }}>
          <CloudUpload size={40} />
          <b>Glisse tes fichiers ici</b>
          <span className="muted">ou clique pour les choisir · vidéos, photos, audio, sans limite de taille</span>
          <input ref={input} type="file" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
        </div>

        {jobs.length > 0 && (
          <div className="drop-list">
            {jobs.map((j) => (
              <div key={j.key} className={`drop-row ${j.status}`}>
                <FileVideo size={18} />
                <div className="drop-row-main">
                  <div className="drop-row-top"><b>{j.file.name}</b><span className="muted small">{j.status === "up" ? `${size(j.sent)} / ` : ""}{size(j.file.size)}</span></div>
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
        {running && <p className="muted small">Garde cette page ouverte jusqu&apos;à la fin de l&apos;envoi.</p>}
      </section>

      {info.files.length > 0 && (
        <section className="drop-card">
          <span className="rdv-group-label">Déjà déposés ({info.files.length})</span>
          {info.files.slice(0, 50).map((f, i) => (
            <div key={i} className="drop-row ok"><CheckCircle2 size={16} className="ok" /><div className="drop-row-main"><div className="drop-row-top"><span>{f.name}</span><span className="muted small">{size(f.size)}{f.author ? ` · ${f.author}` : ""}</span></div></div></div>
          ))}
        </section>
      )}
      <footer className="liv-foot"><Logo /><span className="muted small">maderino production</span></footer>
    </div>
  );
}
