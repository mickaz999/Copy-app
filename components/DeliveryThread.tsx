"use client";
import { useState } from "react";
import { Send } from "lucide-react";
import VoiceButton from "@/components/VoiceButton";

export type Msg = { id: string; fromMe: boolean; author: string; text: string; audio: string; createdAt: string };

// Côté client : mes notes vocales / messages, et un endroit pour me répondre
export default function DeliveryThread({ token, messages, onSent }: { token: string; messages?: Msg[]; onSent: () => void }) {
  const [text, setText] = useState("");
  const [voice, setVoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!messages?.some((m) => m.fromMe)) return null;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    let author = "";
    try { author = localStorage.getItem("liv-author") ?? ""; } catch {}
    const r = await fetch(`/api/livraison/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reply", text, audio: voice || undefined, author }) });
    setBusy(false);
    if (!r.ok) { setErr((await r.json().catch(() => ({}))).error ?? "Erreur"); return; }
    setText(""); setVoice(""); onSent();
  }

  return (
    <div className="liv-thread">
      {messages.map((m) => (
        <div key={m.id} className={`liv-bubble ${m.fromMe ? "me" : "you"}`}>
          <span className="liv-bubble-who">{m.fromMe ? "Un message pour toi" : m.author || "Toi"}</span>
          {m.audio && <audio controls preload="metadata" src={m.audio} />}
          {m.text && <p>{m.text}</p>}
        </div>
      ))}
      <form className="liv-thread-form" onSubmit={send}>
        {voice
          ? <div className="liv-voice-ready"><audio controls src={voice} /><button type="button" className="ghost" onClick={() => setVoice("")}>Supprimer</button></div>
          : <textarea rows={2} placeholder="Réponds ici (écrit ou vocal)…" value={text} onChange={(e) => setText(e.target.value)} />}
        <div className="row">
          {!voice && <VoiceButton onDone={setVoice} />}
          <button className="primary" disabled={busy || (!text.trim() && !voice)}><Send size={14} /> {busy ? "Envoi…" : "Répondre"}</button>
        </div>
        {err && <p className="neg small">{err}</p>}
      </form>
    </div>
  );
}
