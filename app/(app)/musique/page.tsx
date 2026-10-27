"use client";
import { useEffect, useState } from "react";
import { ExternalLink, Music2, Play, Plus, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";

type Track = { id: string; url: string; videoId: string; start: number; title: string; author: string; mood: string; notes: string };

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const errorText = (e: unknown) => { const raw = (e as Error).message; try { return JSON.parse(raw).error ?? raw; } catch { return raw; } };

export default function Musique() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [url, setUrl] = useState("");
  const [mood, setMood] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const load = () => api<Track[]>("tracks").then(setTracks);
  useEffect(() => { load(); }, []);

  async function add() {
    if (!url.trim()) return;
    setBusy(true); setError("");
    try {
      const info = await api<{ videoId: string; start: number; title: string; author: string }>(`youtube?url=${encodeURIComponent(url)}`);
      const t = await api<Track>("tracks", "POST", { url: url.trim(), ...info, title: info.title || "Vidéo YouTube", mood });
      setTracks((ts) => [t, ...ts]);
      setUrl(""); setMood("");
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }

  async function patch(id: string, p: Partial<Track>) {
    setTracks((ts) => ts.map((t) => (t.id === id ? { ...t, ...p } : t)));
    await api(`tracks/${id}`, "PATCH", p);
  }

  async function remove(id: string) {
    setTracks((ts) => ts.filter((t) => t.id !== id));
    setConfirmDel(null);
    if (playing === id) setPlaying(null);
    await api(`tracks/${id}`, "DELETE");
  }

  const moods = Array.from(new Set(tracks.flatMap((t) => t.mood.split(",").map((m) => m.trim()).filter(Boolean))));
  const shown = tracks.filter((t) => !filter || t.mood.split(",").map((m) => m.trim()).includes(filter));

  return (
    <div className="content">
      <div className="eyebrow">musique</div>
      <h1 className="title">ce qui nous <span className="accent">inspire.</span></h1>

      <section className="settings-card add-track">
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input id="yt-url" placeholder="Colle un lien YouTube (avec le minutage si tu veux)" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} style={{ flex: 1, minWidth: 0 }} />
          <button className="primary" disabled={busy} onClick={add}><Plus size={16} /> Ajouter</button>
        </div>
        <input id="yt-mood" placeholder="Ambiance (facultatif) : lofi, nostalgique, mariage…" value={mood} onChange={(e) => setMood(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        {error && <div className="neg">{error}</div>}
      </section>

      {moods.length > 0 && (
        <div className="row mood-filter">
          <button className={!filter ? "primary" : ""} onClick={() => setFilter("")}>Tout</button>
          {moods.map((m) => <button key={m} className={filter === m ? "primary" : ""} onClick={() => setFilter(m)}>{m}</button>)}
        </div>
      )}

      {!tracks.length && (
        <div className="empty-music"><Music2 size={28} /><p>Ajoute ta première musique : colle un lien YouTube ci-dessus.</p></div>
      )}

      <div className="tracks">
        {shown.map((t) => (
          <article key={t.id} className="track card">
            <div className="track-media">
              {playing === t.id ? (
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${t.videoId}?autoplay=1&start=${t.start}`}
                  title={t.title}
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <button className="thumb" onClick={() => setPlaying(t.id)} aria-label={`Écouter ${t.title}`}>
                  <img src={`https://i.ytimg.com/vi/${t.videoId}/hqdefault.jpg`} alt="" />
                  <span className="play"><Play size={22} fill="currentColor" /></span>
                  {t.start > 0 && <span className="at">à {fmt(t.start)}</span>}
                </button>
              )}
            </div>
            <div className="track-body">
              <h3>{t.title}</h3>
              <div className="muted small">{t.author}</div>
              <input id={`mood-${t.id}`} className="cell-input mood-input" placeholder="Ambiance…" defaultValue={t.mood} onBlur={(e) => e.target.value !== t.mood && patch(t.id, { mood: e.target.value })} />
              <textarea id={`notes-${t.id}`} className="cell-input" rows={2} placeholder="Pour quel projet, quel passage…" defaultValue={t.notes} onBlur={(e) => e.target.value !== t.notes && patch(t.id, { notes: e.target.value })} />
              <div className="row track-actions">
                <a className="link" href={`https://www.youtube.com/watch?v=${t.videoId}${t.start ? `&t=${t.start}s` : ""}`} target="_blank" rel="noreferrer">YouTube <ExternalLink size={12} /></a>
                <span style={{ flex: 1 }} />
                {playing === t.id && <button className="ghost" onClick={() => setPlaying(null)}><X size={15} /> Fermer</button>}
                {confirmDel === t.id
                  ? <><button className="ghost neg" onClick={() => remove(t.id)}>Supprimer ?</button><button className="ghost" onClick={() => setConfirmDel(null)}>Non</button></>
                  : <button className="ghost" title="Supprimer" onClick={() => setConfirmDel(t.id)}><Trash2 size={15} /></button>}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
