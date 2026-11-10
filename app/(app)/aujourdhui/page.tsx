"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, ChevronDown, ChevronRight, Clock, Plus } from "lucide-react";
import { api, isoDay } from "@/lib/api";
import { MiniLoader } from "@/components/LivLoader";

type Sub = { id: string; title: string; done: boolean };
type Task = { id: string; title: string; status: string; category: string; date: string | null; endDate: string | null; startTime: string; endTime: string; subtasks?: string };

const subsOf = (t: Task): Sub[] => { try { return JSON.parse(t.subtasks || "[]"); } catch { return []; } };

// To-do du jour : tâches d'aujourd'hui (et en retard), à cocher
export default function Today() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [title, setTitle] = useState("");
  const today = isoDay(new Date());

  useEffect(() => { api<Task[]>("tasks").then(setTasks).catch(() => setTasks([])); }, []);

  const patch = async (t: Task, p: Partial<Task>) => {
    setTasks((all) => all!.map((x) => (x.id === t.id ? { ...x, ...p } : x)));
    await api(`tasks/${t.id}`, "PATCH", p);
  };
  const add = async () => {
    if (!title.trim()) return;
    const t = await api<Task>("tasks", "POST", { title: title.trim(), status: "todo", category: "Persos", date: today });
    setTasks((all) => [...(all ?? []), t]); setTitle("");
  };

  if (!tasks) return <div className="content"><MiniLoader /></div>;
  const day = (t: Task) => t.date?.slice(0, 10) ?? "";
  const end = (t: Task) => (t.endDate ?? t.date)?.slice(0, 10) ?? "";
  const dated = tasks.filter((t) => t.date && t.status !== "waiting");
  const late = dated.filter((t) => t.status !== "done" && end(t) < today);
  const todays = dated.filter((t) => day(t) <= today && today <= end(t)).sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || (a.startTime || "99").localeCompare(b.startTime || "99"));
  const done = todays.filter((t) => t.status === "done").length;

  const Row = ({ t }: { t: Task }) => {
    const subs = subsOf(t);
    const isDone = t.status === "done";
    return (
      <div className={`todo-row ${isDone ? "done" : ""}`}>
        <div className="todo-main">
          <button className={`ghost todo-check ${isDone ? "on" : ""}`} aria-label="Terminer" onClick={() => patch(t, { status: isDone ? "todo" : "done" })}>{isDone && <Check size={14} strokeWidth={3} />}</button>
          <div className="todo-text">
            <b>{t.title}</b>
            <span className="muted small">
              {t.startTime && <><Clock size={11} /> {t.startTime}{t.endTime ? `–${t.endTime}` : ""} · </>}
              {t.category}
              {end(t) < today && t.status !== "done" && <span className="todo-late"> · en retard depuis le {new Date(end(t) + "T12:00:00Z").toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" })}</span>}
            </span>
          </div>
          {subs.length > 0 && (
            <button className="ghost todo-subs-btn" onClick={() => setOpen((o) => ({ ...o, [t.id]: !o[t.id] }))}>
              {subs.filter((s) => s.done).length}/{subs.length} {open[t.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          )}
        </div>
        {open[t.id] && subs.map((s) => (
          <label key={s.id} className={`todo-sub ${s.done ? "done" : ""}`}>
            <input type="checkbox" checked={s.done} onChange={() => patch(t, { subtasks: JSON.stringify(subs.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x))) })} />
            {s.title}
          </label>
        ))}
      </div>
    );
  };

  return (
    <div className="content narrow">
      <div className="eyebrow">{new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</div>
      <h1 className="title">to-do du <span className="accent">jour.</span></h1>

      {todays.length > 0 && (
        <div className="todo-progress">
          <div className="todo-bar"><i style={{ width: `${(done / todays.length) * 100}%` }} /></div>
          <span className="muted small">{done}/{todays.length} terminée{done > 1 ? "s" : ""}</span>
        </div>
      )}

      <div className="todo-add">
        <Plus size={16} />
        <input placeholder="Ajouter une tâche pour aujourd'hui…" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
      </div>

      <section className="todo-list">
        {todays.length === 0 && <p className="muted">Rien de prévu aujourd&apos;hui. Profite.</p>}
        {todays.map((t) => <Row key={t.id} t={t} />)}
      </section>

      {late.length > 0 && (
        <section className="todo-list">
          <h3 className="todo-h"><AlertTriangle size={15} /> En retard ({late.length})</h3>
          {late.map((t) => <Row key={t.id} t={t} />)}
        </section>
      )}

      <p className="muted small"><Link href="/planning" className="link">Voir tout le Planning →</Link></p>
    </div>
  );
}
