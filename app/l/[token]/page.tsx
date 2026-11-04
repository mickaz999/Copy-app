"use client";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, MessageSquare, Clock, Heart, MessageCircle, Send, Bookmark, Music2, ThumbsUp, ThumbsDown, Share2, MoreHorizontal, Play, Pause, SkipForward, Volume2, Settings, Maximize, Subtitles, RectangleHorizontal } from "lucide-react";
import Logo from "@/components/Logo";

type Version = { v: number; name: string; mediaType: string; play: string; thumb: string; original: string; ready: boolean };
type Comment = { id: string; version: number; author: string; text: string; time: number | null; resolved: boolean; createdAt: string };
type Data = { title: string; client: string; kind: string; approved: number[]; networks: Mock[]; message: string; createdAt: string; download: boolean; approvedV: number; versions: Version[]; comments: Comment[] };

// Aperçus : la vidéo mise en situation sur les réseaux, pour que le client se projette
// Vertical : réseaux « courts » ; horizontal : YouTube seulement
const MOCKS = [["player", "Lecteur"], ["reel", "Instagram"], ["tiktok", "TikTok"], ["short", "Shorts"], ["youtube", "YouTube"]] as const;
type Mock = (typeof MOCKS)[number][0];
const VERTICAL: Mock[] = ["player", "reel", "tiktok", "short"];
const HORIZONTAL: Mock[] = ["player", "youtube"];

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
  // Sur ordinateur, vidéo verticale : lecteur + aperçu réseau côte à côte
  const [wide, setWide] = useState(false);
  const [mock2, setMock2] = useState<Mock>("reel");
  useEffect(() => {
    const m = window.matchMedia("(min-width: 1100px)");
    const on = () => setWide(m.matches);
    on(); m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  // Format réel de la vidéo (largeur / hauteur), pour un lecteur à la bonne taille sans bandes noires
  const [ratio, setRatio] = useState(16 / 9);
  const ratioFor = useRef("");
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

  if (error && !d) return <div className="rdv liv-dark-solo"><div className="rdv-card"><Logo /><p className="neg">{error}</p></div></div>;
  if (!d) return <div className="rdv liv-dark-solo"><div className="rdv-card"><Logo /><p className="muted">Chargement…</p></div></div>;

  const cur = d.versions.find((x) => x.v === v) ?? d.versions[d.versions.length - 1];
  const isVideo = !cur?.mediaType || cur.mediaType.startsWith("video");
  const comments = d.comments.filter((c) => c.version === cur?.v).sort((a, b) => (a.time ?? 1e9) - (b.time ?? 1e9));
  const seek = (t: number) => { if (video.current) { video.current.currentTime = t; video.current.play().catch(() => {}); } };
  // Plusieurs vidéos différentes (nom Frame.io) ou versions d'une même vidéo (V1, V2…)
  const multi = d.kind === "videos";
  const lab = (x?: Version) => (x ? (multi ? x.name : `V${x.v}`) : "");
  const isOk = (n: number) => (multi ? d.approved.includes(n) : d.approvedV === n);
  const approved = !!cur && isOk(cur.v);
  // Format connu dès l'image d'aperçu, avant que la vidéo ne se charge (sinon le lecteur change de taille au clic)
  if (cur?.thumb && ratioFor.current !== cur.thumb) {
    ratioFor.current = cur.thumb;
    const img = new Image();
    img.onload = () => img.naturalHeight && setRatio(img.naturalWidth / img.naturalHeight);
    img.src = cur.thumb;
  }
  const vertical = ratio < 1;
  // Réseaux choisis à la création du lien, sinon selon le format de la vidéo
  const mocks = MOCKS.filter(([k]) => k === "player" || (d.networks?.length ? d.networks.includes(k) : (vertical ? VERTICAL : HORIZONTAL).includes(k)));
  if (!mocks.some(([k]) => k === mock)) setTimeout(() => setMock("player"));
  const nets = mocks.filter(([k]) => k !== "player" && k !== "youtube");
  const dual = wide && vertical && isVideo && !!cur?.ready && nets.length > 0;
  if (dual && !nets.some(([k]) => k === mock2)) setTimeout(() => setMock2(nets[0][0]));
  // Lecteur principal : toujours le lecteur de base en mode côte à côte
  const pm: Mock = dual ? "player" : mock;

  return (
    <div className="liv dark">
      {/* Fond : vignette de la vidéo floutée, en fondu vers le noir */}
      <div className="liv-bg" style={cur?.thumb ? { backgroundImage: `url("${cur.thumb}")` } : undefined}>
        {/* Sans vignette Frame.io, on prend une image de la vidéo elle-même */}
        {!cur?.thumb && cur?.play && isVideo && <video key={cur.v} src={`${cur.play}#t=1`} muted playsInline preload="metadata" tabIndex={-1} aria-hidden />}
      </div>
      <div className="liv-top"><Logo /><span className="muted small">Livraison privée</span></div>
      <header className="liv-hero">
        <div className="liv-hero-text">
          <span className="eyebrow">{d.client ? `livraison · ${d.client}` : "livraison"}</span>
          <h1>{d.title}</h1>
          {d.message && <p className="liv-msg">{d.message}</p>}
          <div className="liv-chips">
            <span>{multi ? `${d.versions.length} vidéos` : `Version ${cur.v}${d.versions.length > 1 ? ` sur ${d.versions.length}` : ""}`}</span>
            <span>Envoyé le {new Date(d.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</span>
            {multi
              ? d.approved.length === d.versions.length ? <span className="ok">✓ Toutes les vidéos validées</span> : <span className="wait">{d.approved.length}/{d.versions.length} vidéos validées</span>
              : d.approvedV ? <span className="ok">✓ V{d.approvedV} validée</span> : <span className="wait">En attente de ta validation</span>}
          </div>
        </div>
        <div className="liv-cta">
          {approved
            ? <span className="ok-pill"><CheckCircle2 size={15} /> {multi ? "Vidéo validée" : `V${cur.v} validée`}</span>
            : <button className="primary" disabled={busy || !cur?.ready} onClick={() => confirm(`Valider ${multi ? `« ${cur.name} »` : `la V${cur.v}`} ? Je serai prévenu que c'est bon pour toi.`) && post({ action: "approve", version: cur.v, author })}><CheckCircle2 size={16} /> {multi ? "Valider cette vidéo" : `Valider la V${cur.v}`}</button>}
          {cur?.original && <a href={cur.original} target="_blank" rel="noreferrer"><button><Download size={16} /> Télécharger</button></a>}
        </div>
      </header>

      <div className="liv-main">
        <div className="liv-player">
          <div className="liv-toolbar">
            {d.versions.length > 1
              ? <div className={`seg ${multi ? "seg-videos" : ""}`}>{d.versions.map((x) => <button key={x.v} className={x.v === cur.v ? "on" : ""} title={x.name} onClick={() => { setV(x.v); setNow(0); setRatio(16 / 9); }}>{lab(x)}{isOk(x.v) && " ✓"}</button>)}</div>
              : <span className="liv-file">{cur?.name}</span>}
            {cur?.ready && isVideo && !vertical && (
              <div className="seg">{mocks.map(([k, label]) => <button key={k} className={mock === k ? "on" : ""} onClick={() => setMock(k)}>{label}</button>)}</div>
            )}
          </div>
          <div className={`liv-scene ${vertical && isVideo ? "vertical" : ""} ${dual ? "dual" : ""}`}>
          {!cur?.ready && <div className="liv-wait">Vidéo en cours de préparation sur Frame.io, réessaie dans quelques minutes.</div>}
          <div className={`liv-stage mock-${isVideo ? pm : "player"}`}>
          {cur?.ready && (isVideo
            ? <div className="mock-screen" onClick={() => { if (pm !== "player" && video.current) video.current.paused ? video.current.play() : video.current.pause(); }}>
              <video key={cur.v} ref={video} src={cur.play} poster={cur.thumb || undefined} controls={pm === "player"} playsInline preload="auto" loop={pm !== "player" && pm !== "youtube"}
                onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
                // Téléchargement non autorisé : on retire l'option du menu du lecteur et le clic droit
                controlsList={d.download ? undefined : "nodownload"} disablePictureInPicture={!d.download} onContextMenu={(e) => !d.download && e.preventDefault()}
                onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)} onLoadedMetadata={(e) => { setDuration(e.currentTarget.duration); if (e.currentTarget.videoHeight) setRatio(e.currentTarget.videoWidth / e.currentTarget.videoHeight); }}
                style={pm === "player" ? { aspectRatio: String(ratio), width: `min(100%, calc(var(--liv-h) * ${ratio}))` } : undefined} />
              {pm !== "player" && pm !== "youtube" && !playing && <span className="mock-play"><Play size={30} fill="#fff" /></span>}
              {pm === "youtube" && (
                // Commandes façon lecteur YouTube
                <div className={`yt-ctrl ${playing ? "" : "show"}`} onClick={(e) => e.stopPropagation()}>
                  <div className="yt-bar" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); if (video.current && duration) video.current.currentTime = ((e.clientX - r.left) / r.width) * duration; }}>
                    <i style={{ width: duration ? `${(now / duration) * 100}%` : 0 }} />
                    {comments.filter((c) => c.time !== null && duration).map((c) => <b key={c.id} style={{ left: `${(c.time! / duration) * 100}%` }} />)}
                  </div>
                  <div className="yt-row">
                    <button className="ghost" onClick={() => video.current && (video.current.paused ? video.current.play() : video.current.pause())}>{playing ? <Pause size={22} fill="#fff" /> : <Play size={22} fill="#fff" />}</button>
                    <button className="ghost"><SkipForward size={20} fill="#fff" /></button>
                    <button className="ghost" onClick={() => video.current && (video.current.muted = !video.current.muted)}><Volume2 size={21} /></button>
                    <span className="yt-time">{tc(now)} / {tc(duration || 0)}</span>
                    <span style={{ flex: 1 }} />
                    <button className="ghost"><Subtitles size={20} /></button>
                    <button className="ghost"><Settings size={20} /></button>
                    <button className="ghost"><RectangleHorizontal size={20} /></button>
                    <button className="ghost" onClick={(e) => (e.currentTarget.closest(".mock-screen") as HTMLElement)?.requestFullscreen?.()}><Maximize size={20} /></button>
                  </div>
                </div>
              )}
              {(pm === "reel" || pm === "tiktok" || pm === "short") && (
                <div className="mock-ui">
                  <div className="mock-side">
                    <span><Heart size={26} />{pm === "short" ? "12 k" : "24,3 k"}</span>
                    <span><MessageCircle size={26} />318</span>
                    {pm === "reel" ? <span><Send size={24} /></span> : <span><Share2 size={24} />Partager</span>}
                    {pm !== "short" && <span><Bookmark size={24} /></span>}
                    <span><MoreHorizontal size={22} /></span>
                  </div>
                  <div className="mock-caption">
                    <b><span className="mock-avatar">{(d.client || "M")[0]}</span>{(d.client || "maderino").toLowerCase().replace(/\s+/g, "")} {pm !== "tiktok" && <em>{pm === "short" ? "S'abonner" : "Suivre"}</em>}</b>
                    <span>{d.title} ✨</span>
                    <span className="mock-music"><Music2 size={12} /> Son original · {d.client || "maderino"}</span>
                  </div>
                  <div className="mock-progress"><i style={{ width: duration ? `${(now / duration) * 100}%` : 0 }} /></div>
                </div>
              )}
            </div>
            : <img src={cur.play} alt={cur.name} draggable={d.download} onContextMenu={(e) => !d.download && e.preventDefault()} />)}
          {isVideo && pm === "youtube" && (
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
          {isVideo && pm === "player" && (
            <div className="liv-marks" style={{ width: `min(100% - 12px, calc(var(--liv-h) * ${ratio} - 12px))` }}>
              {duration > 0 && comments.filter((c) => c.time !== null).map((c) => (
                <button key={c.id} className={c.resolved ? "done" : ""} style={{ left: `${(c.time! / duration) * 100}%` }} title={`${tc(c.time!)} · ${c.author} : ${c.text}`} onClick={() => seek(c.time!)} />
              ))}
            </div>
          )}
          </div>
          {dual && <MockPhone key={`${cur.v}-${mock2}`} kind={mock2} src={cur.play} poster={cur.thumb} d={d} />}
          {cur?.ready && isVideo && vertical && (
            <div className="liv-netlist">
              <span className="rdv-group-label">Aperçu</span>
              {dual
                ? nets.map(([k, label]) => <button key={k} className={mock2 === k ? "on" : ""} onClick={() => setMock2(k)}>{label}</button>)
                : mocks.map(([k, label]) => <button key={k} className={mock === k ? "on" : ""} onClick={() => setMock(k)}>{label}</button>)}
            </div>
          )}
          </div>
          {d.versions.length > 1 && <span className="liv-file center">{cur?.name}</span>}
        </div>

        <aside className="liv-side">
          <h3><MessageSquare size={16} /> Retours · {lab(cur)}</h3>
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

// Aperçu réseau affiché à côté du lecteur (vidéo verticale, sur ordinateur)
function MockPhone({ kind, src, poster, d }: { kind: Mock; src: string; poster: string; d: Data }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [now, setNow] = useState(0);
  const [duration, setDuration] = useState(0);
  return (
    <div className={`liv-stage mock-${kind}`}>
      <div className="mock-screen" onClick={() => ref.current && (ref.current.paused ? ref.current.play() : ref.current.pause())}>
        <video ref={ref} src={src} poster={poster || undefined} playsInline preload="metadata" loop
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onContextMenu={(e) => !d.download && e.preventDefault()}
          onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)} onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)} />
        {!playing && <span className="mock-play"><Play size={30} fill="#fff" /></span>}
        <div className="mock-ui">
          <div className="mock-side">
            <span><Heart size={26} />{kind === "short" ? "12 k" : "24,3 k"}</span>
            <span><MessageCircle size={26} />318</span>
            {kind === "reel" ? <span><Send size={24} /></span> : <span><Share2 size={24} />Partager</span>}
            {kind !== "short" && <span><Bookmark size={24} /></span>}
            <span><MoreHorizontal size={22} /></span>
          </div>
          <div className="mock-caption">
            <b><span className="mock-avatar">{(d.client || "M")[0]}</span>{(d.client || "maderino").toLowerCase().replace(/\s+/g, "")} {kind !== "tiktok" && <em>{kind === "short" ? "S'abonner" : "Suivre"}</em>}</b>
            <span>{d.title} ✨</span>
            <span className="mock-music"><Music2 size={12} /> Son original · {d.client || "maderino"}</span>
          </div>
          <div className="mock-progress"><i style={{ width: duration ? `${(now / duration) * 100}%` : 0 }} /></div>
        </div>
      </div>
    </div>
  );
}
