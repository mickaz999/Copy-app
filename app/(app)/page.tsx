"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ListChecks, ArrowUpRight, Bell, Calculator, CalendarClock, CalendarDays, Clapperboard, Clock, MessageSquare, Video, Phone, Wallet, Workflow, AlertTriangle, CheckCircle2 } from "lucide-react";
import { api, isoDay } from "@/lib/api";

type Task = { id: string; title: string; status: string; category: string; date: string | null; endDate: string | null; startTime: string };
type Ev = { id: string; title: string; start: string; end: string; allDay: boolean; color: string };
type Appt = { id: string; name: string; mode: string; day: string; time: string; start: string; status: string };
type Delivery = { id: string; title: string; client: string; approvedV: number; approved: string; kind: string; comments: { resolved: boolean }[] };

const hm = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

// Accueil : le résumé du jour et l'accès à toutes les parties de l'app
export default function Home() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [events, setEvents] = useState<Ev[]>([]);
  const [appts, setAppts] = useState<Appt[]>([]);
  const [deliv, setDeliv] = useState<Delivery[]>([]);
  const today = isoDay(new Date());

  useEffect(() => {
    api<Task[]>("tasks").then(setTasks).catch(() => setTasks([]));
    const from = new Date(); from.setHours(0, 0, 0, 0);
    const to = new Date(from.getTime() + 864e5);
    api<{ events: Ev[] }>(`events?from=${from.toISOString()}&to=${to.toISOString()}`).then((r) => setEvents(r.events ?? [])).catch(() => {});
    api<Appt[]>("rdv").then(setAppts).catch(() => {});
    api<Delivery[]>("livraisons").then(setDeliv).catch(() => {});
  }, []);

  const day = (t: Task) => t.date?.slice(0, 10) ?? "";
  const end = (t: Task) => (t.endDate ?? t.date)?.slice(0, 10) ?? "";
  const open = (tasks ?? []).filter((t) => t.status !== "done" && t.date);
  const todays = open.filter((t) => day(t) <= today && today <= end(t)).sort((a, b) => (a.startTime || "99").localeCompare(b.startTime || "99"));
  const late = open.filter((t) => end(t) < today && t.status !== "waiting");
  const nextAppts = appts.filter((a) => a.status === "confirmed" && Date.parse(a.start) > Date.now() - 36e5).slice(0, 3);
  const todayEvents = events.filter((e) => !e.allDay && Date.parse(e.end) > Date.now()).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 4);
  const feedback = deliv.reduce((n, d) => n + d.comments.filter((c) => !c.resolved).length, 0);
  const waiting = deliv.filter((d) => (d.kind === "videos" ? JSON.parse(d.approved || "[]").length === 0 : !d.approvedV) && d.kind !== "folder").length;

  const h = new Date().getHours();
  const hello = h < 6 ? "bonne nuit" : h < 12 ? "bonjour" : h < 18 ? "bon après-midi" : "bonsoir";
  const date = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  const tiles = [
    { href: "/planning?view=today", icon: ListChecks, label: "To-do du jour", info: tasks ? `${todays.filter((t) => t.status !== "done").length} à faire` : "" },
    { href: "/planning", icon: CalendarDays, label: "Planning", info: tasks ? `${todays.length} tâche${todays.length > 1 ? "s" : ""} aujourd'hui` : "" },
    { href: "/rendez-vous", icon: CalendarClock, label: "Rendez-vous", info: `${nextAppts.length ? `Prochain : ${dayLabel(nextAppts[0].day)} ${nextAppts[0].time}` : "Aucun RDV prévu"}` },
    { href: "/livraisons", icon: Clapperboard, label: "Livraisons", info: feedback ? `${feedback} retour${feedback > 1 ? "s" : ""} à traiter` : `${waiting} en attente de validation` },
    { href: "/compta", icon: Wallet, label: "Compta EI", info: "Recettes, dépenses, URSSAF" },
    { href: "/inspi", icon: Workflow, label: "Espaces inspi", info: "Tes toiles d'idées" },
    { href: "/outils", icon: Calculator, label: "Outils", info: "Calculs et utilitaires" },
    { href: "/reglages", icon: Bell, label: "Notifications", info: "Notifs, mails, lien de RDV" },
  ];

  return (
    <div className="content home">
      <div className="eyebrow">{date}</div>
      <h1 className="title">{hello}, <span className="accent">maderino.</span></h1>

      <div className="home-stats">
        <Link href="/planning" className="home-stat"><b>{tasks ? todays.length : "–"}</b><span>tâche{todays.length > 1 ? "s" : ""} aujourd&apos;hui</span></Link>
        <Link href="/planning" className={`home-stat ${late.length ? "warn" : ""}`}><b>{tasks ? late.length : "–"}</b><span>en retard</span></Link>
        <Link href="/livraisons" className={`home-stat ${feedback ? "hot" : ""}`}><b>{feedback}</b><span>retour{feedback > 1 ? "s" : ""} client</span></Link>
        <Link href="/rendez-vous" className="home-stat"><b>{nextAppts.length}</b><span>RDV à venir</span></Link>
      </div>

      <div className="home-grid">
        <section className="home-card">
          <div className="home-card-h"><h3>Aujourd&apos;hui</h3><Link href="/planning" className="link small">Planning <ArrowUpRight size={13} /></Link></div>
          {!tasks && <p className="muted small">Chargement…</p>}
          {tasks && !todays.length && !todayEvents.length && <p className="muted small">Rien de prévu. Profite.</p>}
          {todayEvents.map((e) => (
            <div key={e.id} className="home-row"><span className="home-dot" style={{ background: e.color }} /><span className="home-time">{hm(e.start)}</span><span className="home-t">{e.title}</span></div>
          ))}
          {todays.slice(0, 6).map((t) => (
            <div key={t.id} className="home-row"><span className="home-dot task" /><span className="home-time">{t.startTime || "—"}</span><span className="home-t">{t.title}</span></div>
          ))}
          {late.length > 0 && <Link href="/planning" className="home-late"><AlertTriangle size={14} /> {late.length} tâche{late.length > 1 ? "s" : ""} en retard</Link>}
        </section>

        <section className="home-card">
          <div className="home-card-h"><h3>Prochains RDV</h3><Link href="/rendez-vous" className="link small">Tout voir <ArrowUpRight size={13} /></Link></div>
          {!nextAppts.length && <p className="muted small">Aucun RDV prévu.</p>}
          {nextAppts.map((a) => (
            <div key={a.id} className="home-row">{a.mode === "visio" ? <Video size={14} className="muted" /> : <Phone size={14} className="muted" />}<span className="home-time">{dayLabel(a.day)} · {a.time}</span><span className="home-t">{a.name}</span></div>
          ))}
          <div className="home-card-h" style={{ marginTop: 10 }}><h3>Livraisons</h3><Link href="/livraisons" className="link small">Tout voir <ArrowUpRight size={13} /></Link></div>
          {!deliv.length && <p className="muted small">Aucune livraison.</p>}
          {deliv.slice(0, 4).map((d) => {
            const todo = d.comments.filter((c) => !c.resolved).length;
            const ok = d.kind === "videos" ? JSON.parse(d.approved || "[]").length > 0 : !!d.approvedV;
            return (
              <Link key={d.id} href="/livraisons" className="home-row">
                {todo ? <MessageSquare size={14} className="hot" /> : ok ? <CheckCircle2 size={14} className="ok" /> : <Clock size={14} className="muted" />}
                <span className="home-t">{d.title}</span>
                <span className="muted small">{todo ? `${todo} retour${todo > 1 ? "s" : ""}` : ok ? "validée" : "en attente"}</span>
              </Link>
            );
          })}
        </section>
      </div>

      <div className="home-tiles">
        {tiles.map(({ href, icon: Icon, label, info }) => (
          <Link key={href} href={href} className="home-tile">
            <span className="home-tile-ic"><Icon size={20} /></span>
            <b>{label}</b>
            <span className="muted small">{info}</span>
            <ArrowUpRight size={15} className="home-tile-go" />
          </Link>
        ))}
      </div>
    </div>
  );
}
