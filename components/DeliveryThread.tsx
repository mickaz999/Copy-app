"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, MessageCircle } from "lucide-react";
import VoiceButton from "@/components/VoiceButton";

export type Msg = { id: string; fromMe: boolean; author: string; text: string; audio: string; createdAt: string };

const when = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// Côté client : conversation façon iMessage (mes notes vocales / messages à gauche, ses réponses à droite)
export default function DeliveryThread({ token, messages, onSent }: { token: string; messages?: Msg[]; onSent: () => void }) {
  const [text, setText] = useState("");
  const [voice, setVoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [messages?.length]);
  if (!messages?.some((m) => m.fromMe)) return null;

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy || (!text.trim() && !voice)) return;
    setBusy(true); setErr("");
    let author = "";
    try { author = localStorage.getItem("liv-author") ?? ""; } catch {}
    const r = await fetch(`/api/livraison/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reply", text, audio: voice || undefined, author }) });
    setBusy(false);
    if (!r.ok) { setErr((await r.json().catch(() => ({}))).error ?? "Erreur"); return; }
    setText(""); setVoice(""); onSent();
  }

  return (
    <aside className="liv-side imsg">
      <h3><MessageCircle size={16} /> Messages</h3>
      <div className="imsg-list">
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const showTime = !prev || Date.parse(m.createdAt) - Date.parse(prev.createdAt) > 30 * 60_000;
          return (
            <div key={m.id} className="imsg-row-wrap">
              {showTime && <div className="imsg-time">{when(m.createdAt)}</div>}
              <div className={`imsg-row ${m.fromMe ? "in" : "out"}`}>
                <div className="imsg-bubble">
                  {m.audio && <audio controls preload="metadata" src={m.audio} />}
                  {m.text && <p>{m.text}</p>}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      <form className="imsg-bar" onSubmit={send}>
        {voice
          ? <div className="imsg-voice"><audio controls src={voice} /><button type="button" className="ghost" onClick={() => setVoice("")}>✕</button></div>
          : <>
              <VoiceButton onDone={setVoice} />
              <textarea rows={1} placeholder="iMessage" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
            </>}
        <button className="imsg-send" disabled={busy || (!text.trim() && !voice)} aria-label="Envoyer"><ArrowUp size={16} /></button>
      </form>
      {err && <p className="neg small">{err}</p>}
    </aside>
  );
}
