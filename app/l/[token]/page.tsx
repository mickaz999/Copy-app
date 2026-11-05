"use client";
import { useEffect, useRef, useState } from "react";
import { X, ArrowUpRight, ChevronLeft, Mic, Square, Star, CheckCircle2, Download, MessageSquare, Clock, Folder, FileImage, Film, ChevronRight, Layers, Heart, MessageCircle, Send, Bookmark, Music2, ThumbsUp, ThumbsDown, Share2, MoreHorizontal, Play, Pause, SkipForward, Volume2, Settings, Maximize, Subtitles, RectangleHorizontal } from "lucide-react";
import Logo from "@/components/Logo";

type Version = { locked?: boolean; old?: boolean; v: number; name: string; mediaType: string; play: string; thumb: string; original: string; ready: boolean };
type Comment = { audio?: string; fileId?: string; fileName?: string; id: string; version: number; author: string; text: string; time: number | null; resolved: boolean; createdAt: string };
type Data = { feedback?: string; reviewUrl?: string; folderId?: string; title: string; client: string; kind: string; approved: number[]; networks: Mock[]; message: string; createdAt: string; download: boolean; approvedV: number; versions: Version[]; comments: Comment[] };

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
  // Retours « sur demande » : le formulaire s'ouvre seulement si le client le souhaite
  const [askOpen, setAskOpen] = useState(false);
  const [voice, setVoice] = useState("");
  // Galerie : la vidéo / photo choisie s'ouvre en grand dans une fenêtre
  const [lb, setLb] = useState(false);
  // Format réel de chaque vignette (largeur / hauteur), pour une galerie qui respecte vertical / horizontal
  const [ratios, setRatios] = useState<Record<number, number>>({});
  const setR = (v: number, w: number, h: number) => w && h && setRatios((r) => (r[v] ? r : { ...r, [v]: Math.min(2.4, Math.max(.45, w / h)) }));
  const [playing, setPlaying] = useState(false);
  // Sur ordinateur, vidéo verticale : lecteur + aperçu réseau côte à côte
  const [wide, setWide] = useState(false);
  const [mock2, setMock2] = useState<Mock>("reel");
  // Aperçu réseau désactivé par défaut : vue normale d'abord, interrupteur pour l'afficher
  const [preview, setPreview] = useState(false);
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
    // Versions : la dernière d'abord ; vidéos / photos différentes : la première
    setV((cur) => cur || (j.kind === "videos" ? j.versions[0]?.v ?? 1 : j.versions.length));
  }).catch((e) => setError(e.message));
  // Clavier dans la fenêtre galerie : Échap ferme, flèches = précédent / suivant
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!lb || (e.target as HTMLElement)?.closest("input, textarea")) return;
      if (e.key === "Escape") setLb(false);
      if (e.key === "ArrowRight") document.querySelector<HTMLButtonElement>(".liv-gnav button:last-child")?.click();
      if (e.key === "ArrowLeft") document.querySelector<HTMLButtonElement>(".liv-gnav button:first-child")?.click();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lb]);
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
    if (await post({ action: "comment", version: v, author, text, audio: voice || undefined, time: atTime && isVideo ? now : null })) { setText(""); setVoice(""); }
  }

  if (error && !d) return <div className="rdv liv-dark-solo"><div className="rdv-card"><Logo /><p className="neg">{error}</p></div></div>;
  if (!d) return <div className="rdv liv-dark-solo"><div className="rdv-card"><Logo /><p className="muted">Chargement…</p></div></div>;
  if (d.kind === "folder") return <FolderDelivery d={d} token={params.token} reload={load} />;

  const cur = d.versions.find((x) => x.v === v) ?? d.versions[d.versions.length - 1];
  const isVideo = !cur?.mediaType || cur.mediaType.startsWith("video");
  const comments = d.comments.filter((c) => c.version === cur?.v).sort((a, b) => (a.time ?? 1e9) - (b.time ?? 1e9));
  const seek = (t: number) => { if (video.current) { video.current.currentTime = t; video.current.play().catch(() => {}); } };
  // Plusieurs vidéos différentes (nom Frame.io) ou versions d'une même vidéo (V1, V2…)
  const multi = d.kind === "videos";
  // Le nom du fichier n'est jamais montré au client (il le découvre au téléchargement)
  const lab = (x?: Version) => (x ? (multi ? `${x.mediaType.startsWith("image") ? "Photo" : "Vidéo"} ${d.versions.findIndex((y) => y.v === x.v) + 1}` : `V${x.v}`) : "");
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
  // Aperçus réseaux : seulement ceux choisis dans la livraison (aucun par défaut)
  const mocks = MOCKS.filter(([k]) => k === "player" || !!d.networks?.includes(k));
  if (!mocks.some(([k]) => k === mock)) setTimeout(() => setMock("player"));
  // Livraison de photos (ou mixte) : galerie de vignettes ; téléchargement de tout d'un coup
  const isImg = (x: Version) => x.mediaType.startsWith("image");
  // Plusieurs vidéos / photos différentes : galerie de vignettes
  const gallery = d.versions.length > 1 && (multi || d.versions.some(isImg));
  const idx = d.versions.findIndex((x) => x.v === cur.v);
  const go = (n: number) => { const x = d.versions[(idx + n + d.versions.length) % d.versions.length]; setV(x.v); setNow(0); setRatio(16 / 9); };
  const wall = gallery && multi;
  const noun = d.versions.every(isImg) ? "photos" : d.versions.some(isImg) ? "fichiers" : "vidéos";
  const files = multi ? d.versions.filter((x) => x.original) : [];
  // Téléchargement via l'app : lien Frame.io recréé au clic ; cadre invisible = pas d'onglet ouvert
  const dl = (n: number) => `${url}/download?v=${n}`;
  const fetchFile = (n: number) => {
    const f = document.createElement("iframe");
    f.style.display = "none"; f.src = dl(n);
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 120_000);
  };
  async function downloadAll() {
    for (const x of files) { fetchFile(x.v); await new Promise((ok) => setTimeout(ok, 1200)); }
  }
  const nets = mocks.filter(([k]) => k !== "player");
  const sel: Mock = nets.some(([k]) => k === mock2) ? mock2 : nets[0]?.[0] ?? "player";
  const phone = sel === "reel" || sel === "tiktok" || sel === "short";
  const showPreview = preview && isVideo && !!cur?.ready && nets.length > 0;
  const dual = showPreview && wide && vertical && phone;
  // Lecteur principal : toujours le lecteur de base en mode côte à côte
  const pm: Mock = dual ? "player" : showPreview ? sel : "player";

  return (
    <div className="liv dark" onContextMenu={(e) => { if ((e.target as HTMLElement).closest("video, img, .liv-wcard, .mock-screen")) e.preventDefault(); }} onDragStart={(e) => { if ((e.target as HTMLElement).closest("video, img")) e.preventDefault(); }}>
      {/* Fond : vignette de la vidéo floutée, en fondu vers le noir */}
      <div className="liv-bg" style={cur?.thumb || (cur && !isVideo) ? { backgroundImage: `url("${cur.thumb || cur.play}")` } : undefined}>
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
            <span>{multi ? `${d.versions.length} ${d.versions.every(isImg) ? "photos" : d.versions.some(isImg) ? "fichiers" : "vidéos"}` : `Version ${cur.v}${d.versions.length > 1 ? ` sur ${d.versions.length}` : ""}`}</span>
            <span>Envoyé le {new Date(d.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</span>
            {multi
              ? d.approved.length === d.versions.length ? <span className="ok">✓ Toutes les {noun} validées</span> : <span className="wait">{d.approved.length}/{d.versions.length} {noun} validé{noun === "fichiers" ? "s" : "es"}</span>
              : d.approvedV ? <span className="ok">✓ V{d.approvedV} validée</span> : <span className="wait">En attente de ta validation</span>}
          </div>
        </div>
        <div className="liv-cta">
          {!wall && <>
          {cur?.old
            ? <span className="liv-locked">Ancienne version · voir la V{d.versions.length}</span>
            : approved
            ? <span className="ok-pill"><CheckCircle2 size={15} /> {multi ? "Vidéo validée" : `V${cur.v} validée`}</span>
            : <button className="primary" disabled={busy || !cur?.ready} onClick={() => confirm(`Valider ${multi ? `« ${lab(cur)} »` : `la V${cur.v}`} ? Je serai prévenu que c'est bon pour toi.`) && post({ action: "approve", version: cur.v, author })}><CheckCircle2 size={16} /> {multi ? (isImg(cur) ? "Valider cette photo" : "Valider cette vidéo") : `Valider la V${cur.v}`}</button>}
          {cur?.original && <SaveButton href={dl(cur.v)} label={files.length > 1 ? (isImg(cur) ? "Cette photo" : "Cette vidéo") : "Télécharger"} />}
          {cur?.locked && !cur.old && <span className="liv-locked" title="Le téléchargement s'ouvre une fois validé"><Download size={15} /> Téléchargement après validation</span>}
          </>}
          {files.length > 1 && <button onClick={downloadAll}><Download size={16} /> Tout télécharger ({files.length})</button>}
        </div>
      </header>

      {wall && (
        <section className="liv-wall">
          {d.versions.map((x, i) => {
            const todo = d.comments.filter((c) => c.version === x.v && !c.resolved).length;
            return (
              <button key={x.v} className="ghost liv-wcard" style={{ ["--r" as string]: ratios[x.v] ?? 1.6 }} onClick={() => { setV(x.v); setNow(0); setRatio(ratios[x.v] ?? 16 / 9); setLb(true); }}>
                {x.thumb || isImg(x)
                  ? <img src={x.thumb || x.play} alt="" loading="lazy" onLoad={(e) => setR(x.v, e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)} />
                  : <video src={`${x.play}#t=1`} muted playsInline preload="metadata" tabIndex={-1} onLoadedMetadata={(e) => setR(x.v, e.currentTarget.videoWidth, e.currentTarget.videoHeight)} />}
                <span className="liv-wshade" />
                <span className="liv-gnum">{String(i + 1).padStart(2, "0")}</span>
                {isOk(x.v) && <span className="liv-wok"><CheckCircle2 size={14} /> Validée</span>}
                {todo > 0 && <span className="liv-gtodo">{todo} retour{todo > 1 ? "s" : ""}</span>}
                {!isImg(x) && <span className="liv-wplay"><Play size={22} fill="#fff" strokeWidth={0} /></span>}
                
              </button>
            );
          })}
          {/* Remplit la dernière ligne pour qu'elle ne s'étire pas */}
          <span className="liv-wfill" />
        </section>
      )}
      {(!wall || lb) && <div className={wall ? "liv-lightbox" : ""} onClick={(e) => { if (wall && e.target === e.currentTarget) setLb(false); }}>
      {wall && (
        <div className="liv-lb-top">
          <button className="ghost liv-lb-close" onClick={() => setLb(false)} aria-label="Fermer"><X size={20} /></button>
          <span className="liv-lb-count">{idx + 1} / {d.versions.length}</span>
          <span style={{ flex: 1 }} />
          {approved
            ? <span className="ok-pill"><CheckCircle2 size={15} /> {isImg(cur) ? "Photo validée" : "Vidéo validée"}</span>
            : <button className="primary" disabled={busy || !cur?.ready} onClick={() => confirm(`Valider « ${lab(cur)} » ?`) && post({ action: "approve", version: cur.v, author })}><CheckCircle2 size={16} /> Valider</button>}
          {cur?.original && <SaveButton href={dl(cur.v)} label="Télécharger" />}
        </div>
      )}
      <div className={`liv-main ${d.feedback === "off" ? "solo" : ""}`}>
        <div className="liv-player">
          <div className="liv-toolbar">
            {gallery
              ? (
                <div className="liv-gnav">
                  <button className="ghost" aria-label="Précédent" onClick={() => go(-1)}><ChevronLeft size={18} /></button>
                  <span><b>{lab(cur)}</b><small>{idx + 1} / {d.versions.length}</small></span>
                  <button className="ghost" aria-label="Suivant" onClick={() => go(1)}><ChevronRight size={18} /></button>
                </div>
              )
              : d.versions.length > 1
              ? <div className={`seg ${multi ? "seg-videos" : ""}`}>{d.versions.map((x) => <button key={x.v} className={x.v === cur.v ? "on" : ""} onClick={() => { setV(x.v); setNow(0); setRatio(16 / 9); }}>{lab(x)}{isOk(x.v) && " ✓"}</button>)}</div>
              : null}
            {cur?.ready && isVideo && nets.length > 0 && (
              <div className="liv-preview">
                {showPreview && nets.length > 1 && <div className="seg">{nets.map(([k, label]) => <button key={k} className={sel === k ? "on" : ""} onClick={() => setMock2(k)}>{label}</button>)}</div>}
                <label className="ios-switch">
                  <span>Aperçu {nets.length === 1 ? nets[0][1] : "réseau"}</span>
                  <input type="checkbox" role="switch" checked={preview} onChange={(e) => setPreview(e.target.checked)} />
                  <i />
                </label>
              </div>
            )}
          </div>
          <div className={`liv-scene ${dual ? "dual" : ""}`} style={dual ? { ["--ratio" as string]: ratio } : undefined}>
          {!cur?.ready && <div className="liv-wait">Vidéo en cours de préparation sur Frame.io, réessaie dans quelques minutes.</div>}
          <div className={`liv-stage mock-${isVideo ? pm : "player"}`}>
          {cur?.ready && (isVideo
            ? <div className="mock-screen" onClick={() => { if (pm !== "player" && video.current) video.current.paused ? video.current.play() : video.current.pause(); }}>
              <video key={cur.v} ref={video} src={cur.play} poster={cur.thumb || undefined} controls={pm === "player"} playsInline preload="auto" loop={pm !== "player" && pm !== "youtube"}
                onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
                // Téléchargement non autorisé : on retire l'option du menu du lecteur et le clic droit
                // Le lecteur lit une version recompressée par Frame.io : le téléchargement passe uniquement par le bouton (fichier original)
                controlsList="nodownload" disablePictureInPicture={!cur.original} onContextMenu={(e) => e.preventDefault()}
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
                    <span>{d.title}</span>
                    <span className="mock-music"><Music2 size={12} /> Son original · {d.client || "maderino"}</span>
                  </div>
                  <div className="mock-progress"><i style={{ width: duration ? `${(now / duration) * 100}%` : 0 }} /></div>
                </div>
              )}
            </div>
            : <img src={cur.play} alt="" draggable={false} onContextMenu={(e) => e.preventDefault()} />)}
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
          {dual && <MockPhone key={`${cur.v}-${sel}`} kind={sel} src={cur.play} poster={cur.thumb} d={d} />}
          </div>
          {gallery
            ? (
              <div className="liv-gallery">
                {d.versions.map((x, i) => {
                  const todo = d.comments.filter((c) => c.version === x.v && !c.resolved).length;
                  return (
                    <button key={x.v} className={`ghost liv-gcard ${x.v === cur.v ? "on" : ""}`} onClick={() => { setV(x.v); setNow(0); setRatio(16 / 9); }}>
                      <span className="liv-gthumb">
                        {x.thumb || isImg(x)
                          ? <img src={x.thumb || x.play} alt="" loading="lazy" />
                          : <video src={`${x.play}#t=1`} muted playsInline preload="metadata" tabIndex={-1} />}
                        {!isImg(x) && <span className="liv-gplay"><Play size={13} fill="#fff" strokeWidth={0} /></span>}
                        <span className="liv-gnum">{String(i + 1).padStart(2, "0")}</span>
                        {isOk(x.v) && <span className="liv-gok"><CheckCircle2 size={14} /></span>}
                        {todo > 0 && <span className="liv-gtodo">{todo}</span>}
                      </span>
                      <span className="liv-gname">{lab(x)}</span>
                    </button>
                  );
                })}
              </div>
            )
            : null}
        </div>

        {d.feedback !== "off" && <aside className="liv-side">
          <h3><MessageSquare size={16} /> Retours · {lab(cur)}</h3>
          {d.feedback === "ask" && !askOpen && comments.length === 0 ? (
            <div className="liv-ask">
              <p>{approved ? "Merci pour ta validation. Une remarque malgré tout ? C'est ici." : <>Tout te convient ? Valide simplement {multi ? "la vidéo" : `la V${cur.v}`} en haut de la page.</>}</p>
              <button onClick={() => setAskOpen(true)}><MessageSquare size={15} /> J&apos;ai une remarque</button>
            </div>
          ) : <>
          <div className="liv-comments">
            {comments.length === 0 && <p className="muted small">{isVideo ? "Aucun retour pour l'instant. Mets pause sur un moment précis et écris ton commentaire." : "Aucun retour pour l'instant. Écris ton commentaire sur cette photo."}</p>}
            {comments.map((c) => (
              <div key={c.id} className={`liv-comment ${c.resolved ? "done" : ""}`}>
                <div className="liv-c-head">
                  {c.time !== null && <button className="liv-tc" onClick={() => seek(c.time!)}>{tc(c.time)}</button>}
                  <b>{c.author}</b>
                  {c.resolved && <span className="ok-pill small">corrigé</span>}
                </div>
                {c.audio ? <audio controls preload="none" src={c.audio} /> : <p>{c.text}</p>}
              </div>
            ))}
          </div>
          <form className="liv-form" onSubmit={comment}>
            <input placeholder="Ton prénom" value={author} onChange={(e) => setAuthor(e.target.value)} />
            {voice
              ? <div className="liv-voice-ready"><audio controls src={voice} /><button type="button" className="ghost" onClick={() => setVoice("")}>Supprimer</button></div>
              : <textarea required rows={3} placeholder={isVideo && atTime ? `Ton retour à ${tc(now)}…` : "Ton retour…"} value={text} onChange={(e) => setText(e.target.value)} />}
            <div className="row">
              {isVideo && (
                // Bascule : retour lié au moment de la vidéo, ou retour général
                <button type="button" className={`liv-when ${atTime ? "on" : ""}`} onClick={() => setAtTime(!atTime)} title="Touche pour changer">
                  <Clock size={13} /> {atTime ? <>Au moment <b>{tc(now)}</b></> : "Retour général"}
                </button>
              )}
              {!voice && <VoiceButton onDone={setVoice} />}
              <span style={{ flex: 1 }} />
              <button className="primary" disabled={busy || (!text.trim() && !voice)}>Envoyer</button>
            </div>
            {error && <p className="neg small">{error}</p>}
          </form>
          </>}
        </aside>}
      </div>
      </div>}
      {d.reviewUrl && <Review url={d.reviewUrl} big={approved || (multi && d.approved.length > 0)} />}
      <footer className="liv-foot"><Logo /><span className="muted small">Merci pour ta confiance · maderino production</span></footer>
    </div>
  );
}

// Avis Google aux couleurs maderino : mis en avant une fois la vidéo validée, discret sinon
function Review({ url, big }: { url: string; big: boolean }) {
  return big ? (
    <a className="liv-review" href={url} target="_blank" rel="noreferrer">
      <span className="liv-review-text">
        <span className="eyebrow">avis google</span>
        <b>ton avis <span className="accent">compte.</span></b>
        <small>Si le résultat te plaît, quelques mots sur Google m&apos;aident énormément à faire connaître mon travail. Trente secondes suffisent.</small>
      </span>
      <span className="liv-review-side">
        <span className="stars">{[0, 1, 2, 3, 4].map((i) => <Star key={i} size={18} fill="currentColor" strokeWidth={0} />)}</span>
        <em>Laisser un avis <ArrowUpRight size={16} /></em>
      </span>
    </a>
  ) : (
    <a className="liv-review-small" href={url} target="_blank" rel="noreferrer"><Star size={13} fill="currentColor" strokeWidth={0} /> Laisser un avis Google</a>
  );
}

// Téléchargement ; sur iPhone / iPad : propose « Enregistrer dans Photos » (feuille de partage)
function SaveButton({ href, label }: { href: string; label: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const ios = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent) && !!navigator.canShare;
  async function prepare() {
    if (!ios) { window.open(href, "_blank"); return; }
    setBusy(true);
    try {
      const info = await (await fetch(`${href}&url=1`)).json();
      const blob = await (await fetch(info.url)).blob();
      const f = new File([blob], info.name || "fichier", { type: info.type || blob.type });
      if (navigator.canShare({ files: [f] })) setFile(f); else window.open(href, "_blank");
    } catch { window.open(href, "_blank"); }
    finally { setBusy(false); }
  }
  // Le partage doit partir d'un appui : 2e bouton une fois le fichier prêt
  if (file) return <button className="primary" onClick={() => navigator.share({ files: [file] }).then(() => setFile(null)).catch(() => {})}><Download size={16} /> Enregistrer dans Photos</button>;
  return <button disabled={busy} onClick={prepare}><Download size={16} /> {busy ? "Préparation…" : label}</button>;
}

// Enregistrement d'un message vocal (3 min max), renvoyé en data URL
function VoiceButton({ onDone }: { onDone: (dataUrl: string) => void }) {
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [secs, setSecs] = useState(0);
  const [err, setErr] = useState("");
  async function start() {
    setErr("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const r = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 48000 } : undefined);
      const parts: Blob[] = [];
      r.ondataavailable = (e) => parts.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const fr = new FileReader();
        fr.onload = () => onDone(String(fr.result));
        fr.readAsDataURL(new Blob(parts, { type: r.mimeType || "audio/webm" }));
        setRec(null);
      };
      r.start();
      setRec(r); setSecs(0);
      const started = Date.now();
      const t = setInterval(() => {
        const sec = Math.floor((Date.now() - started) / 1000);
        setSecs(sec);
        if (sec >= 180 || r.state !== "recording") { clearInterval(t); if (r.state === "recording") r.stop(); }
      }, 250);
    } catch { setErr("Micro non autorisé"); }
  }
  return rec
    ? <button type="button" className="liv-rec on" onClick={() => rec.stop()}><Square size={12} fill="currentColor" /> {tc(secs)} · Arrêter</button>
    : <button type="button" className="liv-rec" onClick={start} title={err || "Laisser un message vocal"}><Mic size={15} /> {err || "Vocal"}</button>;
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
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onContextMenu={(e) => e.preventDefault()}
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
            <span>{d.title}</span>
            <span className="mock-music"><Music2 size={12} /> Son original · {d.client || "maderino"}</span>
          </div>
          <div className="mock-progress"><i style={{ width: duration ? `${(now / duration) * 100}%` : 0 }} /></div>
        </div>
      </div>
    </div>
  );
}

// Livraison d'un dossier Frame.io : navigation dans les sous-dossiers, aperçu, retours et téléchargement par fichier
type Item = { id: string; name: string; type: string; mediaType: string; version: number; sig: string; thumb?: string; updatedAt?: string; count?: number };
const ago = (iso?: string) => {
  if (!iso) return "";
  const days = Math.floor((Date.now() - Date.parse(iso)) / 864e5);
  return days <= 0 ? "aujourd'hui" : days === 1 ? "hier" : days < 30 ? `il y a ${days} j` : new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
};
type Media = { name: string; mediaType: string; play: string; thumb: string; canDownload: boolean };
function FolderDelivery({ d, token, reload }: { d: Data; token: string; reload: () => Promise<unknown> }) {
  const base = `/api/livraison/${token}`;
  // Fil d'Ariane : dossiers ouverts depuis le dossier livré (le premier = racine)
  const [path, setPath] = useState<{ id: string; name: string; sig: string; stack?: boolean }[]>([{ id: "", name: d.title, sig: "" }]);
  const loc = path[path.length - 1];
  const [data, setData] = useState<{ items: Item[] } | null>(null);
  const [error, setError] = useState("");
  const [file, setFile] = useState<Item | null>(null);
  const [media, setMedia] = useState<Media | null>(null);
  const [author, setAuthor] = useState("");
  const [text, setText] = useState("");
  const [now, setNow] = useState(0);
  const [atTime, setAtTime] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => { try { setAuthor(localStorage.getItem("liv-author") ?? ""); } catch {} }, []);
  useEffect(() => {
    setData(null); setError("");
    fetch(`${base}/folder?id=${loc.id}&sig=${loc.sig}${loc.stack ? "&stack=1" : ""}`).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setData(j); }).catch((e) => setError(e.message));
  }, [loc.id]);
  useEffect(() => {
    setMedia(null); setNow(0);
    if (file) fetch(`${base}/file?id=${file.id}&sig=${file.sig}`).then((r) => r.json()).then(setMedia).catch(() => {});
  }, [file?.id]);

  const files = data?.items.filter((x) => x.type !== "folder" && x.type !== "version_stack") ?? [];
  // Nom du fichier caché au client : « Vidéo 3 », « Photo 12 »
  const fname = (x: Item | null) => { if (!x) return ""; const n = (data?.items.filter((y) => y.type !== "folder") ?? []).findIndex((y) => y.id === x.id) + 1; return `${x.mediaType.startsWith("image") ? "Photo" : "Vidéo"} ${n || ""}`.trim(); };
  const isVid = (m?: string) => !m || m.startsWith("video");
  const icon = (x: Item) => x.type === "folder" ? <Folder size={22} /> : x.type === "version_stack" ? <Layers size={22} /> : x.mediaType.startsWith("image") ? <FileImage size={22} /> : <Film size={22} />;
  const dl = (f: Item) => `${base}/file?id=${f.id}&sig=${f.sig}&download=1`;
  async function downloadFolder() {
    for (const f of files) {
      const el = document.createElement("iframe"); el.style.display = "none"; el.src = dl(f);
      document.body.appendChild(el); setTimeout(() => el.remove(), 120_000);
      await new Promise((ok) => setTimeout(ok, 1200));
    }
  }
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    const r = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "comment", author, text, fileId: file.id, fileName: file.name, time: atTime && isVid(media?.mediaType) ? now : null }) });
    setBusy(false);
    if (r.ok) { setText(""); try { localStorage.setItem("liv-author", author); } catch {} reload(); }
  }
  const cs = d.comments.filter((c) => c.fileId === file?.id).sort((a, b) => (a.time ?? 1e9) - (b.time ?? 1e9));

  return (
    <div className="liv dark">
      <div className="liv-bg" style={media?.thumb || (media && !isVid(media.mediaType)) ? { backgroundImage: `url("${media.thumb || media.play}")` } : undefined} />
      <div className="liv-top"><Logo /><span className="muted small">Livraison privée</span></div>
      <header className="liv-hero">
        <div className="liv-hero-text">
          <span className="eyebrow">{d.client ? `livraison · ${d.client}` : "livraison"}</span>
          <h1>{d.title}</h1>
          {d.message && <p className="liv-msg">{d.message}</p>}
          <div className="liv-chips">
            <span>Dossier</span>
            <span>Envoyé le {new Date(d.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</span>
          </div>
        </div>
        <div className="liv-cta">
          {d.reviewUrl && (
            // Avis Google en haut de la page, aux couleurs maderino
            <a className="liv-review-btn" href={d.reviewUrl} target="_blank" rel="noreferrer">
              <span className="stars">{[0, 1, 2, 3, 4].map((k) => <Star key={k} size={13} fill="currentColor" strokeWidth={0} />)}</span>
              Laisser un avis Google <ArrowUpRight size={15} />
            </a>
          )}
          {d.download && files.length > 0 && <button onClick={downloadFolder}><Download size={16} /> Télécharger ce dossier ({files.length})</button>}
        </div>
      </header>

      <div className={`liv-main ${file && d.feedback !== "off" ? "" : "solo"}`}>
        <div className="liv-player">
          <div className="liv-crumbs">
            {path.map((p, i, all) => (
              <span key={p.id || "root"}>
                <button className="ghost" disabled={i === all.length - 1} onClick={() => { setFile(null); setPath(path.slice(0, i + 1)); }}>{p.name}</button>
                {i < all.length - 1 && <ChevronRight size={14} />}
              </span>
            ))}
          </div>
          {file && (
            <div className="liv-fileview">
              {!media && <div className="liv-wait">Chargement…</div>}
              {media && (isVid(media.mediaType)
                ? <video key={file.id} src={media.play} poster={media.thumb || undefined} controls playsInline preload="metadata" controlsList="nodownload" onContextMenu={(e) => e.preventDefault()} onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)} />
                : <img src={media.play} alt="" onContextMenu={(e) => e.preventDefault()} />)}
              <div className="liv-actions">
                <span className="liv-file">{fname(file)}</span>
                <span style={{ flex: 1 }} />
                {media?.canDownload && <a href={dl(file)} target="_blank" rel="noreferrer"><button><Download size={15} /> Télécharger</button></a>}
                <button onClick={() => setFile(null)}>Fermer</button>
              </div>
            </div>
          )}
          {error && <p className="neg">{error}</p>}
          {!data && !error && <p className="muted">Chargement…</p>}
          {data?.items.length === 0 && <p className="muted">Dossier vide.</p>}
          {data && data.items.some((x) => x.type === "folder") && (
            <>
              <span className="rdv-group-label">Dossiers</span>
              <div className="liv-folders">
                {data.items.filter((x) => x.type === "folder").map((x) => (
                  <button key={x.id} className="ghost liv-folder" onClick={() => { setFile(null); setPath([...path, { id: x.id, name: x.name, sig: x.sig }]); }}>
                    <span className="liv-cover">
                      {x.thumb ? <img src={x.thumb} alt="" loading="lazy" /> : <Folder size={34} />}
                    </span>
                    <span className="liv-folder-info">
                      <b>{x.name}</b>
                      <small>{x.count !== undefined ? `${x.count} élément${x.count > 1 ? "s" : ""} · ` : ""}{ago(x.updatedAt)}</small>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
          {data && data.items.some((x) => x.type !== "folder") && (
            <>
              <span className="rdv-group-label">Fichiers</span>
              <div className="liv-browser">
                {data.items.filter((x) => x.type !== "folder").map((x) => (
                  <button key={x.id} className={`ghost liv-entry ${file?.id === x.id ? "on" : ""}`} onClick={() => x.type === "version_stack" ? (setFile(null), setPath([...path, { id: x.id, name: x.name, sig: x.sig, stack: true }])) : setFile(x)}>
                    <span className="liv-thumb">
                      {x.thumb ? <img src={x.thumb} alt="" loading="lazy" /> : <span className="liv-entry-ic">{icon(x)}</span>}
                      {!x.mediaType.startsWith("image") && x.thumb && <i><Play size={14} fill="#fff" /></i>}
                    </span>
                    <span className="liv-entry-name">{fname(x)}</span>
                    <small className="muted">{ago(x.updatedAt)}</small>
                    {d.comments.some((c) => c.fileId === x.id && !c.resolved) && <b>{d.comments.filter((c) => c.fileId === x.id && !c.resolved).length}</b>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {file && d.feedback !== "off" && <aside className="liv-side">
          <h3><MessageSquare size={16} /> Retours{file ? ` · ${fname(file)}` : ""}</h3>
          <div className="liv-comments">
            {!file && <p className="muted small">Ouvre un fichier pour voir ou laisser des retours.</p>}
            {file && cs.length === 0 && <p className="muted small">Aucun retour sur ce fichier.</p>}
            {cs.map((c) => (
              <div key={c.id} className={`liv-comment ${c.resolved ? "done" : ""}`}>
                <div className="liv-c-head">{c.time !== null && <span className="liv-tc">{tc(c.time)}</span>}<b>{c.author}</b>{c.resolved && <span className="ok-pill small">corrigé</span>}</div>
                <p>{c.text}</p>
              </div>
            ))}
          </div>
          {file && (
            <form className="liv-form" onSubmit={send}>
              <input placeholder="Ton prénom" value={author} onChange={(e) => setAuthor(e.target.value)} />
              <textarea required rows={3} placeholder="Ton retour…" value={text} onChange={(e) => setText(e.target.value)} />
              <div className="row">
                {isVid(media?.mediaType) && <button type="button" className={`liv-when ${atTime ? "on" : ""}`} onClick={() => setAtTime(!atTime)}><Clock size={13} /> {atTime ? <>Au moment <b>{tc(now)}</b></> : "Retour général"}</button>}
                <span style={{ flex: 1 }} />
                <button className="primary" disabled={busy || !text.trim()}>Envoyer</button>
              </div>
            </form>
          )}
        </aside>}
      </div>
      <footer className="liv-foot"><Logo /><span className="muted small">Merci pour ta confiance · maderino production</span></footer>
    </div>
  );
}
