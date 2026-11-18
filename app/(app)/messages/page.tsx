"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, ChevronLeft, ExternalLink, MessageCircle } from "lucide-react";
import { api } from "@/lib/api";
import VoiceButton from "@/components/VoiceButton";
import VoicePlayer from "@/components/VoicePlayer";
import { deliveryUrl } from "@/lib/site";

type Item = { id: string; commentId: string; mine: boolean; author: string; text: string; time: number | null; resolved: boolean; at: string; audio: string; label: string };
type Conv = { id: string; title: string; client: string; token: string; feed: Item[]; lastAt: string; toAnswer: boolean; open: number };

const tc = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const when = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const preview = (x?: Item) => (!x ? "" : `${x.mine ? "Toi : " : ""}${x.audio && (!x.text || x.text === "Message vocal") ? "🎤 Message vocal" : x.text}`);

// Messagerie : réponses et retours des clients sur leurs livraisons, et mes réponses (texte ou vocal)
export default function Messages() {
  const [list, setList] = useState<Conv[] | null>(null);
  const [sel, setSel] = useState("");
  const [text, setText] = useState("");
  const [voice, setVoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const load = () => api<Conv[]>("messages").then(setList).catch(() => setList([]));
  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, []);
  const c = list?.find((x) => x.id === sel);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [sel, c?.feed.length]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (!c || busy || (!text.trim() && !voice)) return;
    setBusy(true); setErr("");
    try { await api(`livraisons/${c.id}/messages`, "POST", { text, audio: voice || undefined }); setText(""); setVoice(""); await load(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }
  async function resolve(it: Item) {
    await api(`livraisons/${c!.id}`, "PATCH", { commentId: it.commentId, resolved: !it.resolved }).catch(() => {});
    load();
  }

  return (
    <div className="content narrow">
      <div className="eyebrow">messagerie</div>
      <h1 className="title">tes <span className="accent">messages.</span></h1>
      <div className={`msg-app ${c ? "has-sel" : ""}`}>
        <div className="msg-list">
          {list === null && <p className="muted small">Chargement…</p>}
          {list?.length === 0 && <p className="muted">Aucun message pour l&apos;instant. Les réponses et retours de tes clients apparaîtront ici.</p>}
          {list?.map((x) => (
            <button key={x.id} className={`msg-conv ${x.id === sel ? "on" : ""}`} onClick={() => setSel(x.id)}>
              <span className="imsg-initial">{((x.client || x.title).trim()[0] || "?").toUpperCase()}</span>
              <span className="msg-conv-txt">
                <span className="msg-conv-top"><b>{x.client || x.title}</b><span className="muted small">{new Date(x.lastAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span></span>
                <span className="muted small msg-conv-sub">{x.client ? `${x.title} · ` : ""}{preview(x.feed[x.feed.length - 1])}</span>
              </span>
              {x.toAnswer && <span className="msg-dot" title="À répondre" />}
            </button>
          ))}
        </div>
        {c && (
          <div className="msg-thread liv-side imsg">
            <div className="msg-head">
              <button className="ghost msg-back" onClick={() => setSel("")}><ChevronLeft size={18} /></button>
              <div><b>{c.client || c.title}</b><div className="muted small">{c.title}{c.open ? ` · ${c.open} retour${c.open > 1 ? "s" : ""} à traiter` : ""}</div></div>
              <a className="ghost" href={deliveryUrl(c)} target="_blank" rel="noreferrer" title="Ouvrir la livraison"><ExternalLink size={16} /></a>
            </div>
            <div className="imsg-list">
              {c.feed.map((x, i) => {
                const prev = c.feed[i - 1];
                const showTime = !prev || Date.parse(x.at) - Date.parse(prev.at) > 30 * 60_000;
                return (
                  <div key={x.id}>
                    {showTime && <div className="imsg-time">{when(x.at)}</div>}
                    {/* Ici je suis à droite (bleu), le client à gauche */}
                    <div className={`imsg-row ${x.mine ? "out" : "in"} ${x.resolved ? "done" : ""}`}>
                      {!x.mine && <span className="imsg-initial">{((x.author || c.client || "?").trim()[0] || "?").toUpperCase()}</span>}
                      <div className="imsg-bubble">
                        {(x.label || x.time !== null || x.commentId) && <span className="imsg-meta">
                          {x.label && <span>{x.label}</span>}
                          {x.time !== null && <span className="imsg-tc">{tc(x.time)}</span>}
                          {x.commentId && <button type="button" className="imsg-tc" onClick={() => resolve(x)}>{x.resolved ? "✓ corrigé" : "Marquer corrigé"}</button>}
                        </span>}
                        {x.audio && <VoicePlayer src={x.audio} />}
                        {x.text && !(x.audio && x.text === "Message vocal") && <p>{x.text}</p>}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={end} />
            </div>
            <form className="imsg-form" onSubmit={send}>
              <div className="imsg-bar">
                {voice
                  ? <div className="imsg-voice"><VoicePlayer src={voice} /><button type="button" className="ghost" onClick={() => setVoice("")}>✕</button></div>
                  : <>
                      <VoiceButton onDone={setVoice} />
                      <textarea rows={1} placeholder={`Répondre à ${c.client || "ton client"}…`} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
                    </>}
                <button className="imsg-send" disabled={busy || (!text.trim() && !voice)} aria-label="Envoyer"><ArrowUp size={16} /></button>
              </div>
              {err && <p className="neg small">{err}</p>}
            </form>
          </div>
        )}
        {!c && list && list.length > 0 && <div className="msg-empty muted"><MessageCircle size={28} /><p>Choisis une conversation.</p></div>}
      </div>
    </div>
  );
}
