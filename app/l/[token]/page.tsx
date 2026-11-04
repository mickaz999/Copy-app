"use client";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, MessageSquare, Clock } from "lucide-react";
import Logo from "@/components/Logo";

type Version = { v: number; name: string; mediaType: string; play: string; thumb: string; original: string; ready: boolean };
type Comment = { id: string; version: number; author: string; text: string; time: number | null; resolved: boolean; createdAt: string };
type Data = { title: string; client: string; download: boolean; approvedV: number; versions: Version[]; comments: Comment[] };

const tc = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function Livraison({ params }: { params: { token: string } }) {
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [v, setV] = useState(0);
  const [author, setAuthor] = useState("");
  const [text, setText] = useState("");
  const [atTime, setAtTime] = useState(true);
  const [now, setNow] = useState(0);
  const [duration, setDuration] = useState(0);
  const [busy, setBusy] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const url = `/api/livraison/${params.token}`;

  const load = () => fetch(url).then(async (r) => {
    const j = await r.json();
    if (!r.ok) throw new Error(j.error);
    setD(j);
    setV((cur) => cur || j.versions.length);
  }).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    try { setAuthor(localStorage.getItem("liv-author") ?? ""); } catch {}
  }, []);

  async function post(body: object) {
    setBusy(true);
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? "Erreur"); return false; }
    try { localStorage.setItem("liv-author", author); } catch {}
    await load();
    return true;
  }

  async function comment(e: React.FormEvent) {
    e.preventDefault();
    if (await post({ action: "comment", version: v, author, text, time: atTime && isVideo ? now : null })) setText("");
  }

  if (error && !d) return <div className="rdv"><div className="rdv-card"><Logo /><p className="neg">{error}</p></div></div>;
  if (!d) return <div className="rdv"><div className="rdv-card"><Logo /><p className="muted">Chargement…</p></div></div>;

  const cur = d.versions.find((x) => x.v === v) ?? d.versions[d.versions.length - 1];
  const isVideo = !cur?.mediaType || cur.mediaType.startsWith("video");
  const comments = d.comments.filter((c) => c.version === cur?.v).sort((a, b) => (a.time ?? 1e9) - (b.time ?? 1e9));
  const seek = (t: number) => { if (video.current) { video.current.currentTime = t; video.current.play().catch(() => {}); } };
  const approved = d.approvedV === cur?.v;

  return (
    <div className="liv">
      <header className="liv-head">
        <Logo />
        <div className="liv-title">
          <h1>{d.title}</h1>
          {d.client && <span className="muted">pour {d.client}</span>}
        </div>
        {d.versions.length > 1 && (
          <div className="liv-versions">
            {d.versions.map((x) => <button key={x.v} className={x.v === cur.v ? "on" : ""} onClick={() => { setV(x.v); setNow(0); }}>V{x.v}{d.approvedV === x.v && " ✓"}</button>)}
          </div>
        )}
      </header>

      <div className="liv-main">
        <div className="liv-player">
          {!cur?.ready && <div className="liv-wait">Vidéo en cours de préparation sur Frame.io, réessaie dans quelques minutes.</div>}
          <div className="liv-stage">
          {cur?.ready && (isVideo
            ? <video key={cur.v} ref={video} src={cur.play} poster={cur.thumb || undefined} controls playsInline preload="metadata"
                // Téléchargement non autorisé : on retire l'option du menu du lecteur et le clic droit
                controlsList={d.download ? undefined : "nodownload"} disablePictureInPicture={!d.download} onContextMenu={(e) => !d.download && e.preventDefault()}
                onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)} onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)} />
            : <img src={cur.play} alt={cur.name} draggable={d.download} onContextMenu={(e) => !d.download && e.preventDefault()} />)}
          {isVideo && duration > 0 && (
            <div className="liv-marks">
              {comments.filter((c) => c.time !== null).map((c) => (
                <button key={c.id} className={c.resolved ? "done" : ""} style={{ left: `${(c.time! / duration) * 100}%` }} title={`${tc(c.time!)} · ${c.author} : ${c.text}`} onClick={() => seek(c.time!)} />
              ))}
            </div>
          )}
          </div>
          <div className="liv-actions">
            <span className="muted small">{cur?.name}</span>
            <span style={{ flex: 1 }} />
            {cur?.original && <a href={cur.original} target="_blank" rel="noreferrer"><button><Download size={16} /> Télécharger</button></a>}
            {approved
              ? <span className="ok-pill"><CheckCircle2 size={15} /> V{cur.v} validée</span>
              : <button className="primary" disabled={busy} onClick={() => confirm(`Valider la V${cur.v} ? Je serai prévenu que c'est bon pour toi.`) && post({ action: "approve", version: cur.v, author })}><CheckCircle2 size={16} /> Valider la V{cur.v}</button>}
          </div>
        </div>

        <aside className="liv-side">
          <h3><MessageSquare size={16} /> Retours · V{cur?.v}</h3>
          <div className="liv-comments">
            {comments.length === 0 && <p className="muted small">Aucun retour pour l&apos;instant. Mets pause sur un moment précis et écris ton commentaire.</p>}
            {comments.map((c) => (
              <div key={c.id} className={`liv-comment ${c.resolved ? "done" : ""}`}>
                <div className="liv-c-head">
                  {c.time !== null && <button className="liv-tc" onClick={() => seek(c.time!)}>{tc(c.time)}</button>}
                  <b>{c.author}</b>
                  {c.resolved && <span className="ok-pill small">corrigé</span>}
                </div>
                <p>{c.text}</p>
              </div>
            ))}
          </div>
          <form className="liv-form" onSubmit={comment}>
            <input placeholder="Ton prénom" value={author} onChange={(e) => setAuthor(e.target.value)} />
            <textarea required rows={3} placeholder={isVideo && atTime ? `Ton retour à ${tc(now)}…` : "Ton retour…"} value={text} onChange={(e) => setText(e.target.value)} />
            <div className="row">
              {isVideo && <label className="check small"><input type="checkbox" checked={atTime} onChange={(e) => setAtTime(e.target.checked)} /> <Clock size={13} /> à {tc(now)}</label>}
              <span style={{ flex: 1 }} />
              <button className="primary" disabled={busy || !text.trim()}>Envoyer</button>
            </div>
            {error && <p className="neg small">{error}</p>}
          </form>
        </aside>
      </div>
    </div>
  );
}
