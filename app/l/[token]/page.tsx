"use client";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, MessageSquare, Clock, Heart, MessageCircle, Send, Bookmark, Music2, ThumbsUp, ThumbsDown, Share2, MoreHorizontal, Play } from "lucide-react";
import Logo from "@/components/Logo";

type Version = { v: number; name: string; mediaType: string; play: string; thumb: string; original: string; ready: boolean };
type Comment = { id: string; version: number; author: string; text: string; time: number | null; resolved: boolean; createdAt: string };
type Data = { title: string; client: string; message: string; createdAt: string; download: boolean; approvedV: number; versions: Version[]; comments: Comment[] };

// Aperçus : la vidéo mise en situation sur les réseaux, pour que le client se projette
const MOCKS = [["player", "Lecteur"], ["reel", "Instagram"], ["tiktok", "TikTok"], ["short", "Shorts"], ["youtube", "YouTube"]] as const;
type Mock = (typeof MOCKS)[number][0];

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
  const [mock, setMock] = useState<Mock>("player");
  const [playing, setPlaying] = useState(false);
  // Format réel de la vidéo (largeur / hauteur), pour un lecteur à la bonne taille sans bandes noires
  const [ratio, setRatio] = useState(16 / 9);
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
      <div className="liv-top"><Logo /><span className="muted small">Livraison privée</span></div>
      <header className="liv-hero">
        <div className="liv-hero-text">
          <span className="eyebrow">{d.client ? `livraison · ${d.client}` : "livraison"}</span>
          <h1>{d.title}</h1>
          {d.message && <p className="liv-msg">{d.message}</p>}
          <div className="liv-chips">
            <span>Version {cur.v}{d.versions.length > 1 ? ` sur ${d.versions.length}` : ""}</span>
            <span>Envoyé le {new Date(d.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</span>
            {d.approvedV ? <span className="ok">✓ V{d.approvedV} validée</span> : <span className="wait">En attente de ta validation</span>}
          </div>
        </div>
        <div className="liv-cta">
          {approved
            ? <span className="ok-pill"><CheckCircle2 size={15} /> V{cur.v} validée</span>
            : <button className="primary" disabled={busy || !cur?.ready} onClick={() => confirm(`Valider la V${cur.v} ? Je serai prévenu que c'est bon pour toi.`) && post({ action: "approve", version: cur.v, author })}><CheckCircle2 size={16} /> Valider la V{cur.v}</button>}
          {cur?.original && <a href={cur.original} target="_blank" rel="noreferrer"><button><Download size={16} /> Télécharger</button></a>}
        </div>
      </header>

      <div className="liv-main">
        <div className="liv-player">
          <div className="liv-toolbar">
            {d.versions.length > 1
              ? <div className="seg">{d.versions.map((x) => <button key={x.v} className={x.v === cur.v ? "on" : ""} onClick={() => { setV(x.v); setNow(0); }}>V{x.v}{d.approvedV === x.v && " ✓"}</button>)}</div>
              : <span className="liv-file">{cur?.name}</span>}
            {cur?.ready && isVideo && (
              <div className="seg">{MOCKS.map(([k, label]) => <button key={k} className={mock === k ? "on" : ""} onClick={() => setMock(k)}>{label}</button>)}</div>
            )}
          </div>
          {!cur?.ready && <div className="liv-wait">Vidéo en cours de préparation sur Frame.io, réessaie dans quelques minutes.</div>}
          <div className={`liv-stage mock-${isVideo ? mock : "player"}`}>
          {cur?.ready && (isVideo
            ? <div className="mock-screen" onClick={() => { if (mock !== "player" && video.current) video.current.paused ? video.current.play() : video.current.pause(); }}>
              <video key={cur.v} ref={video} src={cur.play} poster={cur.thumb || undefined} controls={mock === "player"} playsInline preload="metadata" loop={mock !== "player" && mock !== "youtube"}
                onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
                // Téléchargement non autorisé : on retire l'option du menu du lecteur et le clic droit
                controlsList={d.download ? undefined : "nodownload"} disablePictureInPicture={!d.download} onContextMenu={(e) => !d.download && e.preventDefault()}
                onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)} onLoadedMetadata={(e) => { setDuration(e.currentTarget.duration); if (e.currentTarget.videoHeight) setRatio(e.currentTarget.videoWidth / e.currentTarget.videoHeight); }}
                style={mock === "player" ? { aspectRatio: String(ratio), width: `min(100%, calc(var(--liv-h) * ${ratio}))` } : undefined} />
              {mock !== "player" && !playing && <span className="mock-play"><Play size={30} fill="#fff" /></span>}
              {(mock === "reel" || mock === "tiktok" || mock === "short") && (
                <div className="mock-ui">
                  <div className="mock-side">
                    <span><Heart size={26} />{mock === "short" ? "12 k" : "24,3 k"}</span>
                    <span><MessageCircle size={26} />318</span>
                    {mock === "reel" ? <span><Send size={24} /></span> : <span><Share2 size={24} />Partager</span>}
                    {mock !== "short" && <span><Bookmark size={24} /></span>}
                    <span><MoreHorizontal size={22} /></span>
                  </div>
                  <div className="mock-caption">
                    <b><span className="mock-avatar">{(d.client || "M")[0]}</span>{(d.client || "maderino").toLowerCase().replace(/\s+/g, "")} {mock !== "tiktok" && <em>{mock === "short" ? "S'abonner" : "Suivre"}</em>}</b>
                    <span>{d.title} ✨</span>
                    <span className="mock-music"><Music2 size={12} /> Son original · {d.client || "maderino"}</span>
                  </div>
                  <div className="mock-progress"><i style={{ width: duration ? `${(now / duration) * 100}%` : 0 }} /></div>
                </div>
              )}
            </div>
            : <img src={cur.play} alt={cur.name} draggable={d.download} onContextMenu={(e) => !d.download && e.preventDefault()} />)}
          {isVideo && mock === "youtube" && (
            <div className="mock-yt-info">
              <b>{d.title}</b>
              <div className="mock-yt-row">
                <span className="mock-avatar big">{(d.client || "M")[0]}</span>
                <div><b>{d.client || "maderino"}</b><small>12,4 k abonnés</small></div>
                <em>S&apos;abonner</em>
                <span style={{ flex: 1 }} />
                <span className="mock-pill"><ThumbsUp size={15} /> 1,2 k <ThumbsDown size={15} /></span>
                <span className="mock-pill"><Share2 size={15} /> Partager</span>
              </div>
            </div>
          )}
          {isVideo && mock === "player" && duration > 0 && (
            <div className="liv-marks" style={{ width: `min(100% - 12px, calc(var(--liv-h) * ${ratio} - 12px))` }}>
              {comments.filter((c) => c.time !== null).map((c) => (
                <button key={c.id} className={c.resolved ? "done" : ""} style={{ left: `${(c.time! / duration) * 100}%` }} title={`${tc(c.time!)} · ${c.author} : ${c.text}`} onClick={() => seek(c.time!)} />
              ))}
            </div>
          )}
          </div>
          {d.versions.length > 1 && <span className="liv-file center">{cur?.name}</span>}
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
              {isVideo && (
                // Bascule : retour lié au moment de la vidéo, ou retour général
                <button type="button" className={`liv-when ${atTime ? "on" : ""}`} onClick={() => setAtTime(!atTime)} title="Touche pour changer">
                  <Clock size={13} /> {atTime ? <>Au moment <b>{tc(now)}</b></> : "Retour général"}
                </button>
              )}
              <span style={{ flex: 1 }} />
              <button className="primary" disabled={busy || !text.trim()}>Envoyer</button>
            </div>
            {error && <p className="neg small">{error}</p>}
          </form>
        </aside>
      </div>
      <footer className="liv-foot"><Logo /><span className="muted small">Merci pour ta confiance · maderino production</span></footer>
    </div>
  );
}
