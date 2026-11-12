"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Trash2, Plus, ListPlus } from "lucide-react";
import { api } from "@/lib/api";
import { MiniLoader } from "@/components/LivLoader";

type Brief = { id: string; text: string; author: string; project: string; client: string; audio: string };
type Notice = { id: string; title: string; body: string; url: string; read: boolean; createdAt: string; brief?: Brief };
const CATEGORIES = ["Clients", "Persos", "Gaming", "Admin", "Créa persos"];

// Crée une tâche à partir d'un brief : texte (et lien du vocal) dans la description
function BriefTask({ b, onDone }: { b: Brief; onDone: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ title: `${b.project}${b.client ? ` · ${b.client}` : ""}`, date: today, category: "Clients" });
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  async function create() {
    setBusy(true);
    const notes = [
      `Brief${b.author ? ` de ${b.author}` : ""} (dépôt « ${b.project} ») :`,
      b.text,
      b.audio ? `Message vocal : ${window.location.origin}${b.audio}` : "",
    ].filter(Boolean).join("\n\n");
    await api("tasks", "POST", { title: f.title, date: f.date || null, category: f.category, status: "todo", notes });
    setBusy(false); setOk(true); onDone();
  }
  if (ok) return <div className="notice ok">Tâche créée dans le Planning.</div>;
  return (
    <div className="brief-task" onClick={(e) => e.stopPropagation()}>
      <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Titre de la tâche" />
      <div className="row">
        <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
        <button className="primary" disabled={busy || !f.title.trim()} onClick={create}><Plus size={15} /> Créer la tâche</button>
      </div>
    </div>
  );
}

const ago = (iso: string) => {
  const m = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

// Boîte de notifications : tout ce que le téléphone reçoit, consultable dans l'app
export default function Notifs() {
  const [items, setItems] = useState<Notice[] | null>(null);
  const router = useRouter();
  const [open, setOpen] = useState("");
  const load = () => api<{ items: Notice[] }>("inbox").then((r) => setItems(r.items)).catch(() => setItems([]));
  useEffect(() => {
    load();
    // Ouvrir la boîte = tout est vu
    const t = setTimeout(() => api("inbox", "POST", { all: true }).then(() => window.dispatchEvent(new Event("inbox-changed"))), 1500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="content narrow">
      <div className="eyebrow">notifications</div>
      <h1 className="title">ce qui s&apos;est <span className="accent">passé.</span></h1>
      {items && items.length > 0 && (
        <div className="row" style={{ margin: "14px 0" }}>
          <button onClick={async () => { await api("inbox", "POST", { all: true }); load(); window.dispatchEvent(new Event("inbox-changed")); }}><CheckCheck size={15} /> Tout marquer comme lu</button>
          <button className="ghost neg" onClick={async () => { if (confirm("Effacer toutes les notifications ?")) { await api("inbox", "POST", { clear: true }); load(); window.dispatchEvent(new Event("inbox-changed")); } }}><Trash2 size={15} /> Tout effacer</button>
        </div>
      )}
      {!items && <MiniLoader />}
      {items?.length === 0 && <p className="muted"><Bell size={15} /> Aucune notification pour l&apos;instant.</p>}
      <div className="inbox">
        {items?.map((n) => (
          n.brief ? (
            // Brief client : lecture du texte / vocal et création de tâche sur place
            <div key={n.id} className={`inbox-row brief ${n.read ? "" : "unread"}`}>
              <span className="inbox-dot" />
              <span className="inbox-txt">
                <b>{n.title}</b>
                {n.brief.author && <span>de {n.brief.author}</span>}
                {n.brief.text && <p className="inbox-brief">{n.brief.text}</p>}
                {n.brief.audio && <audio controls preload="none" src={n.brief.audio} />}
                {open === n.id
                  ? <BriefTask b={n.brief} onDone={() => {}} />
                  : <button className="inbox-act" onClick={() => setOpen(n.id)}><ListPlus size={15} /> Créer une tâche avec ce brief</button>}
              </span>
              <small>{ago(n.createdAt)}</small>
            </div>
          ) : (
          <button key={n.id} className={`ghost inbox-row ${n.read ? "" : "unread"}`} onClick={() => n.url && router.push(n.url)}>
            <span className="inbox-dot" />
            <span className="inbox-txt"><b>{n.title}</b>{n.body && <span>{n.body}</span>}</span>
            <small>{ago(n.createdAt)}</small>
          </button>
          )
        ))}
      </div>
    </div>
  );
}
