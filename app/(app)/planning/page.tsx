"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import { api, isoDay } from "@/lib/api";
import { REPEATS, nextDate } from "@/lib/repeat";
import { RotateCcw, MessageSquareReply, CircleDashed, Clock, Circle, ExternalLink, Pencil, Trash2, AlertTriangle, ArrowDown, ArrowUp, Calendar, CalendarCheck, CalendarCog, Check, ChevronLeft, ChevronRight, Lock, LockOpen, Clapperboard, CircleDot, MapPin, MoreHorizontal, Plus, RefreshCw, Repeat, Tag, Type, X } from "lucide-react";
import FramePicker, { FrameFile } from "@/components/FramePicker";
import { PropValue, Prop, PropType, PROP_TYPES, PROP_ICONS, nextOptionColor } from "@/components/TaskProps";
import { PUBLIC_URL } from "@/lib/site";

type Task = { id: string; title: string; notes: string; status: string; category: string; date: string | null; endDate: string | null; startTime: string; endTime: string; props: string; subtasks?: string; deliveryId?: string; repeat: string; repeatUntil: string | null; repeatSpawned?: boolean };

type View = "today" | "month" | "days5" | "board" | "list";
const VIEWS: View[] = ["today", "month", "days5", "board", "list"];

// Valeurs des propriétés perso d'une tâche
const propsOf = (t: Partial<Task>): Record<string, unknown> => { try { return JSON.parse(t.props || "{}"); } catch { return {}; } };
type Ev = {
  id: string; title: string; start: string; end: string; allDay: boolean; location: string; description?: string;
  calendar: string; color: string; calId?: string; eventId?: string; editable?: boolean;
};
type GCal = { id: string; calendarId: string; name: string; color: string; visible: boolean; writable: boolean };
type GAccount = { id: string; email: string; calendars: GCal[] };
// Formulaire d'événement : dates "YYYY-MM-DD", heures "HH:MM"
type EvForm = { calId: string; eventId?: string; title: string; allDay: boolean; startDay: string; endDay: string; startTime: string; endTime: string; location: string; description: string };
type Cal = { id: string; name: string; url: string; color: string };

const STATUSES = [
  { key: "waiting", label: "En attente" },
  { key: "todo", label: "À faire" },
  { key: "doing", label: "En cours" },
  { key: "done", label: "Terminé" },
];
const STATUS_LABEL: Record<string, string> = { waiting: "En attente", todo: "À faire", doing: "En cours", done: "Terminé" };
const NEXT_STATUS: Record<string, string> = { waiting: "todo", todo: "doing", doing: "done", done: "todo" };
const CATEGORIES = ["Persos", "Gaming", "Clients", "Admin", "Créa persos"];
// Anciens noms de catégories, renommés à l'affichage
const LEGACY: Record<string, string> = { Créa: "Créa persos", Client: "Clients", Perso: "Persos" };
const COLORS: Record<string, string> = { Persos: "#0f7b6c", Gaming: "#9065b0", Clients: "#2383e2", Admin: "#787774", "Créa persos": "#ff6a00" };
const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const CAL_COLORS = ["#1c1a17", "#2383e2", "#e03e3e", "#0f7b6c", "#d9730d", "#9065b0", "#dfab01", "#787774"];
const SPAN_ROW = 24; // hauteur d'une ligne de barre continue (px)
const HOUR_START = 7, HOUR_END = 23, HOUR_PX = 44;

const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const monday = (d: Date) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return addDays(x, -((x.getDay() + 6) % 7)); };
// Nombre de jours de retard (0 si à l'heure ou terminée)
function daysLate(t: Task) {
  const due = (t.endDate ?? t.date)?.slice(0, 10);
  const now = isoDay(new Date());
  if (!due || t.status === "done" || t.status === "waiting" || due >= now) return 0;
  return Math.round((Date.parse(now) - Date.parse(due)) / 864e5);
}
// Tâche du jour avec horaire dont l'heure de fin (ou début + 1 h) est passée sans être terminée
function timeOver(t: Task) {
  const d = t.date?.slice(0, 10), e = t.endDate?.slice(0, 10);
  if (!d || !t.startTime || (e && e !== d) || t.status === "done" || t.status === "waiting" || d !== isoDay(new Date())) return false;
  const [h, m] = (t.endTime && t.endTime > t.startTime ? t.endTime : t.startTime).split(":").map(Number);
  const end = h * 60 + m + (t.endTime && t.endTime > t.startTime ? 0 : 60);
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes() >= end;
}
const latePill = (t: Task) => daysLate(t) > 0 ? `${daysLate(t)} j de retard` : timeOver(t) ? "en retard" : "";
// Temps restant avant l'échéance d'une tâche sur plusieurs jours (« encore 1 j et 5 h »),
// ou d'une tâche du jour qui a une heure de fin (« encore 3 h »)
function timeLeft(t: Task) {
  const endD = (t.endDate ?? t.date)?.slice(0, 10);
  if (!endD) return "";
  const today = isoDay(new Date());
  if (endD === today && !t.endTime) return "";
  const [h, m] = (t.endTime || "23:59").split(":").map(Number);
  const [y, mo, d] = endD.split("-").map(Number);
  const ms = new Date(y, mo - 1, d, h, m).getTime() - Date.now();
  if (ms <= 0) return "";
  const hours = Math.floor(ms / 36e5), days = Math.floor(hours / 24), rest = hours % 24;
  if (days === 0) return hours === 0 ? `encore ${Math.max(1, Math.round(ms / 6e4))} min` : `encore ${hours} h`;
  return `encore ${days} j${rest ? ` et ${rest} h` : ""}`;
}

// Sous-tâches (checklist) et progression
type Sub = { id: string; title: string; done: boolean };
const subsOf = (t: Pick<Task, "subtasks">): Sub[] => { try { return JSON.parse(t.subtasks || "[]"); } catch { return []; } };
function Progress({ t, small }: { t: Task; small?: boolean }) {
  const subs = subsOf(t);
  if (!subs.length) return null;
  const done = subs.filter((s) => s.done).length;
  return (
    <span className={`progress ${small ? "small" : ""} ${done === subs.length ? "full" : ""}`} title={`${done} sur ${subs.length} sous-tâches faites`}>
      <span className="bar"><span style={{ width: `${(done / subs.length) * 100}%` }} /></span>
      <span className="n">{done}/{subs.length}</span>
    </span>
  );
}
// Couleur de la catégorie (le « projet ») : bordure + fond teinté de la vignette
// Version plus vive des couleurs de catégorie, lisible sur fond noir (thème sombre)
const DARK_COLORS: Record<string, string> = { Persos: "#2dd4bf", Gaming: "#c084fc", Clients: "#60a5fa", Admin: "#a8a29e", "Créa persos": "#ff8a3d" };
const isDark = () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
const catColor = (t: Pick<Task, "category">) => (isDark() ? DARK_COLORS : COLORS)[t.category] ?? (isDark() ? "#ff8a3d" : "#ff6a00");
const catStyle = (t: Pick<Task, "category">) => ({ borderLeftColor: catColor(t), ["--cat" as string]: catColor(t) }) as React.CSSProperties;
const toHours = (hm: string) => { const [h, m] = hm.split(":").map(Number); return h + (m || 0) / 60; };
const addMinutes = (hm: string, n: number) => { const t = Math.min(23 * 60 + 59, toHours(hm) * 60 + n); return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(Math.round(t % 60)).padStart(2, "0")}`; };
// Compte à rebours jusqu'au jour de l'échéance (date de fin, sinon date) : J-3, J-1, Jour J
function remainingLabel(t: Task, today: string): { text: string; urgent: boolean } {
  const due = (t.endDate ?? t.date)!.slice(0, 10);
  if (t.status === "done") return { text: "terminé", urgent: false };
  const n = Math.round((Date.parse(due) - Date.parse(today)) / 864e5);
  if (n < 0) return { text: "dépassé", urgent: true };
  if (n === 0) return { text: "Jour J", urgent: true };
  return { text: `J-${n}`, urgent: n <= 2 };
}
// Badge J-n affiché sur toutes les tâches datées pas encore terminées (les retards ont leur propre badge)
function Countdown({ t }: { t: Task }) {
  if (!t.date || t.status === "done" || daysLate(t) > 0) return null;
  const { text, urgent } = remainingLabel(t, isoDay(new Date()));
  return <span className={`countdown ${urgent ? "urgent" : ""}`}>{text}</span>;
}
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const pad = (n: number) => String(n).padStart(2, "0");
const localTime = (iso: string) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

// Jours (YYYY-MM-DD) couverts par un événement ; la fin d'une journée entière est exclusive
function eventDays(e: Ev): string[] {
  if (!e.allDay) return [isoDay(new Date(e.start))];
  const out: string[] = [];
  for (let d = new Date(e.start + "T00:00"); isoDay(d) < e.end || out.length === 0; d = addDays(d, 1)) {
    out.push(isoDay(d));
    if (out.length > 60) break;
  }
  return out;
}

export default function Planning() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<Ev[]>([]);
  const [calErrors, setCalErrors] = useState<string[]>([]);
  const [view, setView] = useState<View>("month");
  const [props, setProps] = useState<Prop[]>([]);
  const [cursor, setCursor] = useState(() => new Date());
  const [edit, setEdit] = useState<Partial<Task> | null>(null);
  const [showEvent, setShowEvent] = useState<Ev | null>(null);
  const [showCals, setShowCals] = useState(false);
  const [viewing, setViewing] = useState<Task | null>(null);
  const [evForm, setEvForm] = useState<EvForm | null>(null);
  const [gcals, setGcals] = useState<GCal[]>([]);
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("");
  const [over, setOver] = useState<string | null>(null);

  const month = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  // Vue « 5 jours » : à partir du jour choisi (aujourd'hui par défaut), sans revenir au lundi
  const timeGrid = view === "days5";
  // 3 jours sur téléphone, 5 sur ordinateur
  const [isPhone, setIsPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 760px)");
    const update = () => setIsPhone(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const dayCount = isPhone ? 3 : 5;
  const rangeStart = view === "days5" ? new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()) : monday(month);
  const rangeEnd = addDays(rangeStart, timeGrid ? dayCount : 42);
  const rangeStartRef = useRef(rangeStart); rangeStartRef.current = rangeStart;
  const rangeEndRef = useRef(rangeEnd); rangeEndRef.current = rangeEnd;

  const loadProps = () =>
    api<(Omit<Prop, "options"> & { options: string })[]>("properties").then((ps) => setProps(ps.map((p) => ({ ...p, options: JSON.parse(p.options || "[]") }))));

  // Modif d'une tâche depuis la vue Liste : affichage immédiat, enregistrement groupé
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pending = useRef<Record<string, Partial<Task>>>({});
  function patchTask(id: string, patch: Partial<Task>) {
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    pending.current[id] = { ...pending.current[id], ...patch };
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => {
      const body = pending.current[id];
      delete pending.current[id];
      saveTask(id, body);
    }, 400);
  }
  const setProp = (t: Task, propId: string, v: unknown) =>
    patchTask(t.id, { props: JSON.stringify({ ...propsOf(t), [propId]: v }) });

  async function addOption(prop: Prop, name: string) {
    const options = [...prop.options, { name, color: nextOptionColor(prop.options) }];
    setProps((ps) => ps.map((p) => (p.id === prop.id ? { ...p, options } : p)));
    await api(`properties/${prop.id}`, "PATCH", { options });
  }

  const loadTasks = () => api<Task[]>("tasks").then((ts) => setTasks(ts.map((t) => ({ ...t, category: LEGACY[t.category] ?? t.category }))));
  // Événements gardés en mémoire par période : changer de mois / de jours est instantané,
  // puis la période est rafraîchie en arrière-plan
  const evCache = useRef(new Map<string, { events: Ev[]; errors: string[] }>());
  const rangeKey = (a: Date, b: Date) => `${a.toISOString()}|${b.toISOString()}`;
  const fetchRange = (a: Date, b: Date, refresh = false) =>
    api<{ events: Ev[]; errors: string[] }>(`events?from=${a.toISOString()}&to=${b.toISOString()}${refresh ? "&refresh=1" : ""}`)
      .then((r) => { evCache.current.set(rangeKey(a, b), r); return r; });

  function loadEvents(refresh = false) {
    const key = rangeKey(rangeStart, rangeEnd);
    if (refresh) evCache.current.clear();
    const hit = evCache.current.get(key);
    if (hit) { setEvents(hit.events); setCalErrors(hit.errors); }
    fetchRange(rangeStart, rangeEnd, refresh).then((r) => {
      // N'affiche le résultat que si on est toujours sur la même période
      if (rangeKey(rangeStartRef.current, rangeEndRef.current) === key) { setEvents(r.events); setCalErrors(r.errors); }
      prefetchNeighbours();
    }).catch(() => {});
  }

  // Précharge la période d'avant et d'après pour une navigation sans attente
  function prefetchNeighbours() {
    const spans: [Date, Date][] = view === "days5"
      ? [[addDays(rangeStart, 1), addDays(rangeEnd, 1)], [addDays(rangeStart, -1), addDays(rangeEnd, -1)]]
      : [-1, 1].map((n) => { const m = new Date(month.getFullYear(), month.getMonth() + n, 1); const s0 = monday(m); return [s0, addDays(s0, 42)] as [Date, Date]; });
    for (const [a, b] of spans) if (!evCache.current.has(rangeKey(a, b))) fetchRange(a, b).catch(() => {});
  }

  const loadGcals = () =>
    api<{ accounts: GAccount[] }>("google/calendars").then((r) => setGcals(r.accounts.flatMap((a) => a.calendars)));

  useEffect(() => {
    loadTasks();
    loadGcals();
    loadProps();
    // Reprend la dernière vue utilisée sur cet appareil
    try {
      const saved = localStorage.getItem("planning-view");
      // L'ancienne vue Semaine n'existe plus : on bascule sur 5 jours
      const v = (saved === "week" ? "days5" : saved) as View;
      if (VIEWS.includes(v)) setView(v);
    } catch {}
    // ?view=today : ouverture directe de la to-do du jour
    const qv = new URLSearchParams(window.location.search).get("view") as View | null;
    if (qv && VIEWS.includes(qv)) setView(qv);
    // Message de retour après la connexion Google
    const msg = new URLSearchParams(window.location.search).get("google");
    if (msg) { setNotice(msg); setShowCals(true); window.history.replaceState(null, "", "/planning"); }
  }, []);

  useEffect(() => { try { localStorage.setItem("planning-view", view); } catch {} }, [view]);

  const writable = gcals.filter((c) => c.writable);

  function newEvent(day: string, hour?: number, endMin?: number) {
    if (!writable.length) { setNotice("Connecte d'abord ton compte Google pour ajouter des événements."); setShowCals(true); return; }
    // hour peut être fractionnaire (ex. 9.5 = 9h30) ; endMin = fin en minutes depuis minuit
    const sm = Math.round((hour ?? 9) * 60), em = Math.min(endMin ?? sm + 60, 23 * 60 + 59);
    const hm = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
    setEvForm({
      calId: writable[0].id, title: "", allDay: false,
      startDay: day, endDay: day, startTime: hm(sm), endTime: hm(em),
      location: "", description: "",
    });
  }

  // Créneau « brouillon » façon Google Agenda : clic = 1 h, glisser = choisir la durée.
  // Souris : on glisse directement puis le formulaire s'ouvre au relâchement.
  // Doigt : un toucher pose 1 h ; on déplace le bloc ou on tire la poignée, puis on touche le bloc pour créer.
  const [draft, setDraft] = useState<{ k: string; s: number; e: number } | null>(null);
  const snap = (m: number) => Math.round(m / 15) * 15;
  const minAt = (x: { clientY: number }, col: Element) => HOUR_START * 60 + ((x.clientY - col.getBoundingClientRect().top) / HOUR_PX) * 60;
  const clampMin = (m: number) => Math.max(HOUR_START * 60, Math.min(HOUR_END * 60, m));
  const fmtMin = (m: number) => `${Math.floor(m / 60)}:${pad(m % 60)}`;
  function colDown(x: React.PointerEvent, k: string) {
    if ((x.target as HTMLElement).closest(".wk-event, .wk-draft")) return;
    const col = x.currentTarget;
    const s0 = clampMin(Math.floor(minAt(x, col) / 30) * 30);
    if (x.pointerType !== "mouse") {
      // Toucher : ne rien faire si c'était un défilement
      const y0 = x.clientY, x0 = x.clientX;
      const up = (ev: PointerEvent) => {
        window.removeEventListener("pointerup", up);
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 10) return;
        setDraft((d) => (d ? null : { k, s: s0, e: Math.min(s0 + 60, HOUR_END * 60) }));
      };
      window.addEventListener("pointerup", up);
      return;
    }
    if (x.button !== 0) return;
    x.preventDefault();
    let d = { k, s: s0, e: Math.min(s0 + 60, HOUR_END * 60) }, moved = false;
    setDraft(d);
    const move = (ev: PointerEvent) => {
      const m = snap(clampMin(minAt(ev, col)));
      if (!moved && Math.abs(m - s0) < 15) return;
      moved = true;
      d = m > s0 ? { k, s: s0, e: Math.max(s0 + 15, m) } : { k, s: Math.min(m, s0), e: s0 + 30 };
      setDraft(d);
    };
    const up = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      setDraft(null);
      newEvent(k, d.s / 60, d.e);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  function draftDown(x: React.PointerEvent, mode: "move" | "end") {
    x.stopPropagation(); x.preventDefault();
    const d0 = draft!, y0 = x.clientY;
    let moved = false;
    (x.currentTarget as Element).setPointerCapture?.(x.pointerId);
    const move = (ev: PointerEvent) => {
      const dm = snap(((ev.clientY - y0) / HOUR_PX) * 60);
      if (Math.abs(ev.clientY - y0) > 6) moved = true;
      if (mode === "end") setDraft({ ...d0, e: Math.max(d0.s + 15, Math.min(HOUR_END * 60, d0.e + dm)) });
      else { const len = d0.e - d0.s, s1 = Math.max(HOUR_START * 60, Math.min(HOUR_END * 60 - len, d0.s + dm)); setDraft({ ...d0, s: s1, e: s1 + len }); }
    };
    const up = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      if (!moved && mode === "move") {
        setDraft(null); newEvent(d0.k, d0.s / 60, d0.e);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function openEvent(e: Ev) {
    if (!e.editable || !e.calId) return setShowEvent(e);
    const endDay = e.allDay ? isoDay(addDays(new Date(e.end + "T00:00"), -1)) : isoDay(new Date(e.end));
    setEvForm({
      calId: e.calId, eventId: e.eventId, title: e.title, allDay: e.allDay,
      startDay: e.allDay ? e.start : isoDay(new Date(e.start)), endDay,
      startTime: e.allDay ? "09:00" : localTime(e.start), endTime: e.allDay ? "10:00" : localTime(e.end),
      location: e.location, description: e.description ?? "",
    });
  }
  useEffect(() => { if (view === "month" || view === "today" || timeGrid) loadEvents(); }, [view, rangeStart.getTime()]);

  const visible = tasks.filter((t) => !filter || t.category === filter);
  const day = (t: Task) => t.date?.slice(0, 10) ?? null;
  const endDay = (t: Task) => t.endDate?.slice(0, 10) ?? null;
  // Une tâche apparaît sur chaque jour entre son début et sa fin
  const onDay = (t: Task, k: string) => { const s = day(t); return !!s && k >= s && k <= (endDay(t) ?? s); };
  const today = isoDay(new Date());
  // Heure actuelle rafraîchie chaque minute (ligne « maintenant » et zone passée)
  const [, setTick] = useState(0);
  useEffect(() => { const i = setInterval(() => setTick((n) => n + 1), 60_000); return () => clearInterval(i); }, []);
  const nowH = new Date().getHours() + new Date().getMinutes() / 60;
  // Jours fermés au lien de prise de RDV, basculés depuis l'en-tête des jours
  const [booking, setBooking] = useState<any>(null);
  useEffect(() => { api("booking").then(setBooking).catch(() => {}); }, []);
  const blockedDays: string[] = booking ? JSON.parse(booking.blocked || "[]") : [];
  async function toggleBlocked(k: string) {
    if (!booking) return;
    const list = blockedDays.includes(k) ? blockedDays.filter((d) => d !== k) : [...blockedDays, k];
    setBooking({ ...booking, blocked: JSON.stringify(list) });
    setBooking(await api("booking", "POST", { ...booking, hours: JSON.parse(booking.hours), blocked: list }));
  }
  const BlockBtn = ({ k }: { k: string }) => booking?.enabled && k >= today ? (
    <button
      className={`ghost rdv-lock ${blockedDays.includes(k) ? "on" : ""}`}
      title={blockedDays.includes(k) ? "RDV bloqués ce jour : clique pour rouvrir" : "Bloquer les RDV ce jour"}
      onClick={(e) => { e.stopPropagation(); toggleBlocked(k); }}
      onPointerDown={(e) => e.stopPropagation()}
    >{blockedDays.includes(k) ? <Lock size={12} /> : <LockOpen size={12} />}</button>
  ) : null;

  // Enregistre une tâche ; si c'était une tâche répétitive terminée, la suivante vient d'être créée
  async function saveTask(id: string, body: Partial<Task>) {
    const r = await api<{ spawned?: boolean }>(`tasks/${id}`, "PATCH", body);
    if (r.spawned) loadTasks();
  }

  // Dates des prochaines occurrences d'une tâche répétitive, jusqu'à `until` inclus
  function occurrences(t: Task, until: string) {
    const out: string[] = [];
    if (!t.repeat || t.repeatSpawned || !t.date) return out;
    const stop = t.repeatUntil?.slice(0, 10);
    let d = nextDate(t.date, t.repeat);
    for (let i = 0; d && d <= until && i < 400; i++) {
      if (stop && d > stop) break;
      out.push(d);
      d = nextDate(d, t.repeat);
    }
    return out;
  }

  // Occurrences à venir des tâches d'un seul jour, affichées en discret
  const ghostsOn = (k: string) => visible.filter((t) => !multiTask(t) && occurrences(t, k).includes(k));

  // Tâche Clients terminée : demander quelle(s) vidéo(s) Frame.io correspondent
  const [linking, setLinking] = useState<Task | null>(null);
  async function move(id: string, patch: Partial<Task>) {
    if (!id) return;
    const before = tasks.find((t) => t.id === id);
    if (patch.status === "done" && before && before.status !== "done" && before.category === "Clients") setLinking({ ...before, ...patch });
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    await saveTask(id, patch);
  }

  // Glisser une tâche : elle garde sa durée si elle a une date de fin
  function moveToDay(id: string, k: string) {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    const s0 = day(t), e0 = endDay(t);
    if (s0 && e0) {
      const diff = Math.round((Date.parse(k) - Date.parse(s0)) / 864e5);
      const e = new Date(Date.parse(e0) + diff * 864e5).toISOString().slice(0, 10);
      return move(id, { date: k, endDate: e });
    }
    move(id, { date: k });
  }

  async function saveEdit() {
    if (!edit?.title?.trim()) return;
    const endDate = edit.date && edit.endDate && edit.endDate > edit.date ? edit.endDate : null;
    const hasTime = !!(edit.date && !endDate && edit.startTime);
    const body = {
      ...edit, date: edit.date || null, endDate,
      startTime: hasTime ? edit.startTime : "",
      endTime: hasTime && edit.endTime && edit.endTime > edit.startTime! ? edit.endTime : "",
    };
    setEdit(null);
    if (edit.id) {
      // Affichage immédiat, enregistrement en arrière-plan
      setTasks((ts) => ts.map((t) => (t.id === edit.id ? { ...t, ...body } as Task : t)));
      await saveTask(edit.id, body);
    } else {
      const created = await api<Task>("tasks", "POST", body);
      setTasks((ts) => [...ts, { ...created, category: LEGACY[created.category] ?? created.category }]);
    }
  }

  async function remove() {
    const id = edit?.id;
    setEdit(null);
    if (!id) return;
    setTasks((ts) => ts.filter((t) => t.id !== id));
    await api(`tasks/${id}`, "DELETE");
  }

  const newTask = (date: string | null) => setEdit({ title: "", status: "todo", category: "Créa persos", date, notes: "" });
  const shift = (n: number) =>
    setCursor(view === "days5" ? addDays(cursor, n) : new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));

  // Retard : échéance (fin, sinon date) dépassée et tâche pas terminée
  const lateDays = (t: Task) => {
    const due = endDay(t) ?? day(t);
    if (!due || t.status === "done" || t.status === "waiting" || due >= today) return 0;
    return Math.round((Date.parse(today) - Date.parse(due)) / 864e5);
  };
  const lateLabel = (n: number) => (n === 1 ? "1 jour de retard" : `${n} jours de retard`);
  const lateTasks = visible.filter((t) => lateDays(t) > 0).sort((a, b) => lateDays(b) - lateDays(a));
  // En attente avec une échéance passée : sortie du calendrier, rangée sous le planning pour relancer ou supprimer
  const staleDays = (t: Task) => {
    const due = endDay(t) ?? day(t);
    return t.status === "waiting" && due && due < today ? Math.round((Date.parse(today) - Date.parse(due)) / 864e5) : 0;
  };
  const staleTasks = visible.filter((t) => staleDays(t) > 0).sort((a, b) => staleDays(b) - staleDays(a));
  const onCal = visible.filter((t) => !staleDays(t));
  // Relancer : repasse « à faire » à partir d'aujourd'hui en gardant la même durée
  function relaunch(t: Task) {
    const s0 = day(t), e0 = endDay(t);
    const span = s0 && e0 ? Math.round((Date.parse(e0) - Date.parse(s0)) / 864e5) : 0;
    const body: Partial<Task> = { status: "todo", date: today, endDate: e0 ? new Date(Date.parse(today) + span * 864e5).toISOString().slice(0, 10) : null };
    setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, ...body } : x)));
    saveTask(t.id, body);
  }
  async function removeTask(t: Task) {
    setTasks((ts) => ts.filter((x) => x.id !== t.id));
    await api(`tasks/${t.id}`, "DELETE");
  }

  // ---- Barres continues pour ce qui dure plusieurs jours ----
  // Tâche avec un horaire : placée dans la grille des heures (vue jours)
  const timed = (t: Task) => !!t.startTime && !t.endDate;
  const multiTask = (t: Task) => { const s0 = day(t), e0 = endDay(t); return !!(s0 && e0 && e0 > s0); };
  const evLast = (e: Ev) => (e.allDay ? isoDay(addDays(new Date(e.end + "T00:00"), -1)) : isoDay(new Date(e.start)));
  const multiEvent = (e: Ev) => e.allDay && evLast(e) > e.start;
  type Span = { key: string; s: number; e: number; lane: number; head: boolean; tail: boolean; task?: Task; ev?: Ev; ghost?: boolean };

  // Place les éléments sur plusieurs jours en lignes (« voies ») sans chevauchement
  function layoutSpans(keys: string[], opts: { tasks?: boolean; events?: boolean }) {
    const first = keys[0], last = keys[keys.length - 1];
    const items: Omit<Span, "lane">[] = [];
    const add = (key: string, from: string, to: string, extra: Partial<Span>) => {
      if (to < first || from > last) return;
      const s0 = from < first ? 0 : keys.indexOf(from);
      const e0 = to > last ? keys.length - 1 : keys.indexOf(to);
      items.push({ key, s: s0, e: e0, head: from >= first, tail: to <= last, ...extra });
    };
    if (opts.events) events.filter(multiEvent).forEach((e) => add(`e-${e.id}`, e.start, evLast(e), { ev: e }));
    if (opts.tasks) {
      onCal.filter(multiTask).forEach((t) => add(`t-${t.id}`, day(t)!, endDay(t)!, { task: t }));
      // Prochaines occurrences d'une tâche répétitive sur plusieurs jours : même durée, en pointillé
      onCal.filter((t) => multiTask(t) && t.repeat && !t.repeatSpawned).forEach((t) => {
        const len = Math.round((Date.parse(endDay(t)!) - Date.parse(day(t)!)) / 864e5);
        for (const d of occurrences(t, last)) {
          const end = isoDay(addDays(new Date(d + "T00:00"), len));
          add(`g-${t.id}-${d}`, d, end, { task: t, ghost: true });
        }
      });
    }
    items.sort((a, b) => a.s - b.s || (b.e - b.s) - (a.e - a.s));
    const laneEnds: number[] = [];
    const spans = items.map((it) => {
      let lane = laneEnds.findIndex((end) => end < it.s);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(it.e); } else laneEnds[lane] = it.e;
      return { ...it, lane };
    });
    // Hauteur à réserver dans chaque colonne : seulement les voies qui la traversent
    const depth = keys.map((_, c) => spans.reduce((m, sp) => (sp.s <= c && c <= sp.e ? Math.max(m, sp.lane + 1) : m), 0));
    return { spans, lanes: laneEnds.length, depth };
  }

  const SpanBar = ({ sp, offset = 0 }: { sp: Span; offset?: number }) => {
    const cls = `span-bar ${sp.head ? "head" : ""} ${sp.tail ? "tail" : ""}`;
    const pos = { gridColumn: `${sp.s + 1 + offset} / ${sp.e + 2 + offset}`, gridRow: sp.lane + 1 };
    if (sp.ev) {
      const e = sp.ev;
      return (
        <div className={`${cls} chip event`} style={{ ...pos, background: e.color }} title={`${e.title} · ${e.calendar}`} onClick={(x) => { x.stopPropagation(); openEvent(e); }}>
          <span className="chip-text">{e.title}</span>
        </div>
      );
    }
    const t = sp.task!;
    if (sp.ghost)
      return (
        <div className={`${cls} chip task ghost`} style={pos} title={`${t.title} · ${REPEATS[t.repeat]}`} onClick={(e) => { e.stopPropagation(); setViewing(t); }}>
          <Repeat size={11} className="rep-lead" /><span className="chip-text">{t.title}</span>
        </div>
      );
    return (
      <div
        className={`${cls} chip task ${t.status} ${lateDays(t) ? "overdue-bar" : ""}`}
        style={{ ...pos, ...catStyle(t), borderLeftColor: sp.head ? catColor(t) : "transparent" }}
        draggable
        onDragStart={(e) => e.dataTransfer.setData("id", t.id)}
        onClick={(e) => { e.stopPropagation(); setViewing(t); }}
        title={`${t.title} · ${fmtDay(t.date!)} → ${fmtDay(t.endDate!)}`}
      >
        <span className="st" onClick={(e) => { e.stopPropagation(); move(t.id, { status: NEXT_STATUS[t.status] ?? "todo" }); }}>
          {t.status === "done" && <Check size={9} strokeWidth={3.5} />}
        </span>
        <span className="chip-text">{t.title}</span>
        {/* Compte à rebours aussi quand la fin est hors de la vue (barre coupée à droite) */}
        <span className={`span-end ${remainingLabel(t, today).urgent ? "urgent" : ""}`}>{remainingLabel(t, today).text}{!sp.tail && " →"}</span>
      </div>
    );
  };

  const TaskChip = ({ t, late }: { t: Task; late?: boolean }) => (
    <div
      className={`chip task ${t.status} ${late ? "late" : lateDays(t) ? "overdue" : timeOver(t) ? "late-now" : ""}`}
      style={catStyle(t)}
      draggable
      onDragStart={(e) => e.dataTransfer.setData("id", t.id)}
      onClick={(e) => { e.stopPropagation(); setViewing(t); }}
      title={`${t.title} · ${STATUS_LABEL[t.status]} (clic sur l'icône pour changer)`}
    >
      <span
        className="st"
        onClick={(e) => { e.stopPropagation(); move(t.id, { status: NEXT_STATUS[t.status] ?? "todo" }); }}
      >
        {t.status === "done" && <Check size={9} strokeWidth={3.5} />}
      </span>
      <span className="chip-text">{t.startTime && <b className="chip-time">{t.startTime}</b>}{t.title}</span>
      <Progress t={t} small />
      {!late && !timeOver(t) && <Countdown t={t} />}
      {!late && timeOver(t) && <span className="late-badge"><AlertTriangle size={10} strokeWidth={2.5} /> en retard</span>}
      {late && <span className="late-badge"><AlertTriangle size={10} strokeWidth={2.5} /> {lateLabel(lateDays(t))}</span>}
      {t.repeat && <Repeat size={11} className="rep" aria-label={REPEATS[t.repeat]} />}
    </div>
  );

  const EventChip = ({ e }: { e: Ev }) => (
    <div className="chip event" style={{ background: e.color }} title={`${e.title} · ${e.calendar}`} onClick={(x) => { x.stopPropagation(); openEvent(e); }}>
      {!e.allDay && <b>{hhmm(e.start)} </b>}{e.title}
    </div>
  );

  // Glisser une tâche sur un jour change sa date
  const dropProps = (k: string) => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setOver(k); },
    onDragLeave: () => setOver(null),
    onDrop: (e: React.DragEvent) => { setOver(null); moveToDay(e.dataTransfer.getData("id"), k); },
  });

  const title =
    view === "days5"
      ? `${rangeStart.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} → ${addDays(rangeStart, dayCount - 1).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`
      : month.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  // Glisser le doigt à gauche/droite sur le calendrier pour changer de période
  const swipe = useRef<{ x: number; y: number; t: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const el = e.target as HTMLElement;
    swipe.current = e.touches.length === 1 && el.closest(".cal-month, .days5") && !el.closest("input, textarea, select, .modal") ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() } : null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s0 = swipe.current; swipe.current = null;
    if (!s0) return;
    const dx = e.changedTouches[0].clientX - s0.x, dy = e.changedTouches[0].clientY - s0.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - s0.t < 800) shift((dx < 0 ? 1 : -1) * (timeGrid ? dayCount : 1));
  };

  return (
    <div className="content wide" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="eyebrow">planning</div>
      <h1 className="title">ce qu&apos;on <span className="accent">planifie.</span></h1>
      {/* Barre d'outils : vues en segment façon Apple, filtres, actions */}
      <div className="pl-bar">
        <div className="pl-seg">
          {([["today", "Aujourd'hui"], ["month", "Mois"], ["days5", `${dayCount} jours`], ["board", "Tableau"], ["list", "Liste"]] as [View, string][]).map(([v, label]) => (
            <button key={v} className={`ghost ${view === v ? "on" : ""}`} onClick={() => { setView(v); if (v === "days5") setCursor(new Date()); }}>{label}</button>
          ))}
        </div>
        <select className="pl-filter" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Toutes catégories</option>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <button className="ghost pl-icon" title="Agendas" onClick={() => setShowCals(true)}><CalendarCog size={17} /><span>Agendas</span></button>
        <span style={{ flex: 1 }} />
        <button className="pl-ev" onClick={() => newEvent(today)}><Plus size={16} /> Événement</button>
        <button className="primary" onClick={() => newTask(null)}><Plus size={16} /> Nouvelle tâche</button>
      </div>

      {notice && !showCals && <div className="notice" onClick={() => setNotice("")}>{notice} <X size={13} /></div>}
      {calErrors.length > 0 && (
        <details className="cal-errors">
          <summary><AlertTriangle size={14} /> {calErrors.length === 1 ? "1 agenda n'a pas pu être chargé" : `${calErrors.length} agendas n'ont pas pu être chargés`} · <button className="ghost link" onClick={(e) => { e.preventDefault(); setShowCals(true); }}>Vérifier mes agendas</button></summary>
          <ul>{calErrors.map((e) => <li key={e}>{e.length > 160 ? e.slice(0, 160) + "…" : e}</li>)}</ul>
        </details>
      )}

      {view !== "board" && view !== "list" && view !== "today" && (
        <div className="pl-nav">
          <strong style={{ textTransform: view === "month" ? "capitalize" : "none" }}>{title}</strong>
          <div className="pl-step">
            <button className="ghost" aria-label="Précédent" onClick={() => shift(-1)}><ChevronLeft size={18} /></button>
            <button className="ghost pl-now" onClick={() => setCursor(new Date())}>Aujourd&apos;hui</button>
            <button className="ghost" aria-label="Suivant" onClick={() => shift(1)}><ChevronRight size={18} /></button>
          </div>
          <span style={{ flex: 1 }} />
          <button className="ghost" title="Recharger les agendas" onClick={() => loadEvents(true)}><RefreshCw size={16} /></button>
        </div>
      )}

      {view === "month" && (
        <div className="cal-month">
          <div className="cal cal-head">{DAYS.map((d) => <div key={d} className="head">{d}</div>)}</div>
          {Array.from({ length: 6 }, (_, w) => {
            const week = Array.from({ length: 7 }, (_, i) => addDays(rangeStart, w * 7 + i));
            const keys = week.map(isoDay);
            const { spans, lanes, depth } = layoutSpans(keys, { tasks: true, events: true });
            return (
              <div key={w} className="cal cal-week">
                {week.map((d, ci) => {
                  const k = isoDay(d);
                  const evs = events.filter((e) => !multiEvent(e) && eventDays(e).includes(k)).sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start));
                  return (
                    <div
                      key={k}
                      className={`day ${d.getMonth() !== month.getMonth() ? "out" : ""} ${k === today ? "today" : ""} ${over === k ? "over" : ""} ${blockedDays.includes(k) ? "rdv-blocked" : ""}`}
                      style={{ gridColumn: ci + 1 }}
                      onClick={() => newTask(k)}
                      {...dropProps(k)}
                    >
                      <span className="num">{d.getDate()}</span><BlockBtn k={k} />
                      <div style={{ height: depth[ci] * SPAN_ROW }} />
                      {k === today && lateTasks.filter((t) => !multiTask(t) || !onDay(t, k)).map((t) => <TaskChip key={`late-${t.id}`} t={t} late />)}
                      {evs.map((e) => <EventChip key={e.id} e={e} />)}
                      {onCal.filter((t) => !multiTask(t) && onDay(t, k)).map((t) => <TaskChip key={t.id} t={t} />)}
                      {ghostsOn(k).map((t) => (
                        <div key={`g-${t.id}`} className="chip task ghost" title={`${t.title} · ${REPEATS[t.repeat]}`} onClick={(e) => { e.stopPropagation(); setViewing(t); }}>
                          <Repeat size={11} className="rep-lead" /><span className="chip-text">{t.title}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
                {lanes > 0 && <div className="span-layer month">{spans.map((sp) => <SpanBar key={sp.key} sp={sp} />)}</div>}
              </div>
            );
          })}
        </div>
      )}

      {timeGrid && (() => {
        const days = Array.from({ length: dayCount }, (_, i) => addDays(rangeStart, i));
        return (
          <div className="week days5" data-days={dayCount} style={{ ["--days" as string]: dayCount }}>
            <div className="wk-row">
              <div className="wk-gutter" />
              {days.map((d) => (
                <div key={+d} className={`wk-head ${isoDay(d) === today ? "today" : ""} ${blockedDays.includes(isoDay(d)) ? "rdv-blocked" : ""}`}>
                  {DAYS[(d.getDay() + 6) % 7]} <span className="num">{d.getDate()}</span> <BlockBtn k={isoDay(d)} />
                </div>
              ))}
            </div>
            {(() => {
              const keys = days.map(isoDay);
              const { spans, lanes, depth } = layoutSpans(keys, { events: true });
              const singles = (k: string) => events.filter((e) => e.allDay && !multiEvent(e) && eventDays(e).includes(k));
              if (!lanes && !keys.some((k) => singles(k).length)) return null;
              return (
                <div className="wk-row wk-allday">
                  <div className="wk-gutter muted" style={{ gridColumn: 1 }}>Journée</div>
                  {keys.map((k, ci) => (
                    <div key={k} className="wk-cell" style={{ gridColumn: ci + 2 }}>
                      <div style={{ height: depth[ci] * SPAN_ROW }} />
                      {singles(k).map((e) => <EventChip key={e.id} e={e} />)}
                    </div>
                  ))}
                  {lanes > 0 && <div className="span-layer days">{spans.map((sp) => <SpanBar key={sp.key} sp={sp} offset={1} />)}</div>}
                </div>
              );
            })()}
            <div className="wk-row wk-grid" style={{ height: (HOUR_END - HOUR_START) * HOUR_PX }}>
              <div className="wk-gutter">
                {Array.from({ length: HOUR_END - HOUR_START }, (_, h) => (
                  <div key={h} className="wk-hour muted" style={{ top: h * HOUR_PX }}>{HOUR_START + h}h</div>
                ))}
              </div>
              {days.map((d) => {
                const k = isoDay(d);
                return (
                  <div
                    key={k}
                    className="wk-col"
                    style={{ backgroundSize: `100% ${HOUR_PX}px, 100% ${HOUR_PX}px` }}
                    title="Clique ou glisse pour créer un événement"
                    onPointerDown={(x) => colDown(x, k)}
                  >
                    {(k < today || (k === today && nowH > HOUR_START)) && (
                      <div className="wk-past" style={{ height: k < today ? "100%" : Math.min(HOUR_END - HOUR_START, nowH - HOUR_START) * HOUR_PX }} />
                    )}
                    {draft?.k === k && (
                      <div
                        className="wk-draft"
                        style={{ top: (draft.s / 60 - HOUR_START) * HOUR_PX, height: ((draft.e - draft.s) / 60) * HOUR_PX }}
                        onPointerDown={(x) => draftDown(x, "move")}
                      >
                        <b>{fmtMin(draft.s)} – {fmtMin(draft.e)}</b>
                        <span>Nouvel événement</span>
                        <span className="wk-draft-handle" onPointerDown={(x) => draftDown(x, "end")} />
                      </div>
                    )}
                    {events.filter((e) => !e.allDay && isoDay(new Date(e.start)) === k).map((e) => {
                      const s = new Date(e.start), en = new Date(e.end);
                      const top = Math.max(0, (s.getHours() + s.getMinutes() / 60 - HOUR_START) * HOUR_PX);
                      const height = Math.max(20, ((en.getTime() - s.getTime()) / 36e5) * HOUR_PX);
                      return (
                        <div key={e.id} className="wk-event" style={{ top, height, background: e.color }} onClick={(x) => { x.stopPropagation(); openEvent(e); }} title={e.title}>
                          <b>{hhmm(e.start)}</b> {e.title}
                          {e.location && <div className="loc">{e.location}</div>}
                        </div>
                      );
                    })}
                    {onCal.filter((t) => timed(t) && onDay(t, k)).map((t) => {
                      const s0 = toHours(t.startTime), e0 = t.endTime ? toHours(t.endTime) : s0 + 1;
                      const top = Math.max(0, (s0 - HOUR_START) * HOUR_PX);
                      const height = Math.max(22, (e0 - s0) * HOUR_PX);
                      return (
                        <div key={`t-${t.id}`} className={`wk-event task-event ${t.status} ${timeOver(t) ? "late-now" : ""}`} style={{ top, height, ...catStyle(t) }} onClick={(x) => { x.stopPropagation(); setViewing(t); }} title={t.title}>
                          <span className="st" onClick={(x) => { x.stopPropagation(); move(t.id, { status: NEXT_STATUS[t.status] ?? "todo" }); }}>
                            {t.status === "done" && <Check size={9} strokeWidth={3.5} />}
                          </span>
                          <span><b>{t.startTime}</b> {t.title}{timeOver(t) && <span className="late-badge"><AlertTriangle size={9} strokeWidth={2.5} /> en retard</span>}</span>
                        </div>
                      );
                    })}
                    {k === today && nowH >= HOUR_START && nowH <= HOUR_END && (
                      <div className="wk-now" style={{ top: (nowH - HOUR_START) * HOUR_PX }}>
                        <span>{fmtMin(Math.floor(nowH * 60))}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {(() => {
              const keys = days.map(isoDay);
              const { spans, lanes, depth } = layoutSpans(keys, { tasks: true });
              return (
                <div className="wk-row wk-allday wk-tasks">
                  <div className="wk-gutter muted" style={{ gridColumn: 1 }}>Tâches</div>
                  {keys.map((k, ci) => (
                    <div key={k} className={`wk-cell ${over === k ? "over" : ""}`} style={{ gridColumn: ci + 2 }} onClick={() => newTask(k)} {...dropProps(k)}>
                      {depth[ci] > 0 && <div style={{ height: depth[ci] * 36 - 6, flexShrink: 0 }} />}
                      {k === today && lateTasks.filter((t) => !multiTask(t) || !onDay(t, k)).map((t) => <TaskChip key={`late-${t.id}`} t={t} late />)}
                      {onCal.filter((t) => !multiTask(t) && !timed(t) && onDay(t, k)).map((t) => <TaskChip key={t.id} t={t} />)}
                      {ghostsOn(k).map((t) => (
                        <div key={`g-${t.id}`} className="chip task ghost" title={`${t.title} · ${REPEATS[t.repeat]}`} onClick={(e) => { e.stopPropagation(); setViewing(t); }}>
                          <Repeat size={11} className="rep-lead" /><span className="chip-text">{t.startTime && `${t.startTime} `}{t.title}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                  {lanes > 0 && <div className="span-layer days">{spans.map((sp) => <SpanBar key={sp.key} sp={sp} offset={1} />)}</div>}
                </div>
              );
            })()}
          </div>
        );
      })()}

      {view === "today" && (() => {
        // To-do du jour : mêmes tâches, mêmes actions que le reste du Planning (statut, fiche, retours client…)
        const todays = visible.filter((t) => onDay(t, today) && t.status !== "waiting")
          .sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || (a.startTime || "99").localeCompare(b.startTime || "99"));
        const done = todays.filter((t) => t.status === "done").length;
        const row = (t: Task, late = false) => (
          <div key={t.id} className={`todo-row ${t.status === "done" ? "done" : ""}`} style={catStyle(t)} onClick={() => setViewing(t)}>
            <div className="todo-main">
              <span className={`st todo-st ${t.status}`} title={`${STATUS_LABEL[t.status]} · clic pour changer`} onClick={(e) => { e.stopPropagation(); move(t.id, { status: NEXT_STATUS[t.status] ?? "todo" }); }}>
                {t.status === "done" && <Check size={12} strokeWidth={3.5} />}
              </span>
              <div className="todo-text">
                <b>{t.title || "Sans titre"}</b>
                <span className="muted small">
                  {t.startTime && <><Clock size={11} /> {t.startTime}{t.endTime ? `–${t.endTime}` : ""} · </>}
                  <span style={{ color: catColor(t) }}>{t.category}</span>
                  <span>{STATUS_LABEL[t.status]}</span>
                  {late && <span className="todo-late">{lateLabel(lateDays(t))}</span>}
                  {!late && t.status !== "done" && timeLeft(t) && <span className="todo-left">{timeLeft(t)}</span>}
                </span>
              </div>
              <Progress t={t} />
              {!late && latePill(t) && <span className="late-pill"><AlertTriangle size={10} strokeWidth={2.5} /> {latePill(t)}</span>}
            </div>
          </div>
        );
        const lateOnly = lateTasks.filter((t) => !todays.some((x) => x.id === t.id));
        const total = todays.length + lateOnly.length;
        const pct = total ? Math.round((done / total) * 100) : 0;
        const left = total - done;
        const R = 34, C = 2 * Math.PI * R;
        return (
          <div className="today-split">
          {/* Gauche : journée heure par heure (agendas + tâches avec horaire) */}
          <section className="day-plan" ref={(el) => { if (el && !el.dataset.scrolled) { el.dataset.scrolled = "1"; const now = el.querySelector<HTMLElement>(".day-plan-now"); if (now) el.scrollTop = Math.max(0, now.offsetTop - 80); } }}>
            <div className="day-plan-h"><b>{new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</b></div>
            {(() => {
              const evs = events.filter((e) => !e.allDay && isoDay(new Date(e.start)) === today);
              const allDay = events.filter((e) => e.allDay && eventDays(e).includes(today));
              const timed = todays.filter((t) => t.startTime);
              const items = [
                ...evs.map((e) => { const s0 = new Date(e.start), e0 = new Date(e.end); return { k: e.id, s: s0.getHours() + s0.getMinutes() / 60, e: e0.getHours() + e0.getMinutes() / 60 || 24, label: e.title, time: hhmm(e.start), color: e.color, task: null as Task | null, ev: e }; }),
                ...timed.map((t) => { const s0 = toHours(t.startTime); return { k: t.id, s: s0, e: t.endTime ? toHours(t.endTime) : s0 + 1, label: t.title, time: t.startTime, color: catColor(t), task: t, ev: null as Ev | null }; }),
              ];
              const H0 = Math.max(0, Math.min(HOUR_START, ...items.map((i) => Math.floor(i.s)))), H1 = Math.min(24, Math.max(HOUR_END, ...items.map((i) => Math.ceil(i.e))));
              const PX = 52;
              return (
                <>
                  {allDay.length > 0 && <div className="day-plan-all">{allDay.map((e) => <span key={e.id} style={{ ["--c" as string]: e.color }} onClick={() => openEvent(e)}>{e.title}</span>)}</div>}
                  <div className="day-plan-grid" style={{ height: (H1 - H0) * PX }}>
                    {Array.from({ length: H1 - H0 }, (_, i) => <div key={i} className="day-plan-hour" style={{ top: i * PX }}><span>{H0 + i}h</span></div>)}
                    {nowH >= H0 && nowH <= H1 && <div className="day-plan-now" style={{ top: (nowH - H0) * PX }} />}
                    {items.map((i) => (
                      <div key={i.k} className={`day-plan-ev ${i.task ? "task" : ""} ${i.task?.status === "done" ? "done" : ""}`} style={{ top: (i.s - H0) * PX + 1, height: Math.max(26, (i.e - i.s) * PX - 3), ["--c" as string]: i.color }}
                        onClick={() => (i.task ? setViewing(i.task) : i.ev && openEvent(i.ev))}>
                        <b>{i.time}</b> {i.label}
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </section>
          <div className="todo-view">
            {/* En-tête : progression du jour */}
            <div className="todo-hero">
              <svg className="todo-ring" viewBox="0 0 84 84">
                <circle cx="42" cy="42" r={R} className="bg" />
                <circle cx="42" cy="42" r={R} className="fg" strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} />
                <text x="42" y="47" textAnchor="middle">{pct}%</text>
              </svg>
              <div className="todo-hero-txt">
                <b>{total === 0 ? "Journée libre" : left === 0 ? "Tout est fait, bravo" : `${left} tâche${left > 1 ? "s" : ""} à faire`}</b>
                <span className="muted small">{done}/{total} terminée{done > 1 ? "s" : ""} aujourd&apos;hui{lateTasks.length ? ` · ${lateTasks.length} en retard` : ""}</span>
                <div className="todo-bar"><i style={{ width: `${pct}%` }} /></div>
              </div>
              <button className="primary" onClick={() => newTask(today)}><Plus size={16} /> Ajouter</button>
            </div>

            {/* En retard d'abord : à rattraper avant le reste */}
            {lateTasks.length > 0 && (
              <section className="todo-group late">
                <h3 className="todo-gh"><AlertTriangle size={14} /> En retard <span>{lateTasks.length}</span></h3>
                {lateTasks.map((t) => row(t, true))}
              </section>
            )}
            <section className="todo-group">
              <h3 className="todo-gh">Aujourd&apos;hui <span>{todays.length}</span></h3>
              {todays.length === 0 && <p className="muted small todo-empty">Rien de prévu aujourd&apos;hui. Profite.</p>}
              {todays.map((t) => row(t))}
            </section>
          </div>
          </div>
        );
      })()}

      {view === "list" && (
        <TaskTable
          tasks={visible}
          props={props}
          onPatch={patchTask}
          onSetProp={setProp}
          onAddOption={addOption}
          onOpen={(t) => setViewing(t)}
          onNew={async () => { await api("tasks", "POST", { title: "", status: "todo", category: filter || "Créa persos" }); loadTasks(); }}
          onPropsChanged={loadProps}
        />
      )}

      {view === "board" && (
        <div className="board">
          {STATUSES.map((s) => (
            <div key={s.key} className="col" onDragOver={(e) => e.preventDefault()} onDrop={(e) => move(e.dataTransfer.getData("id"), { status: s.key })}>
              <div className="row"><strong>{s.label}</strong><span className="muted">{visible.filter((t) => t.status === s.key).length}</span></div>
              {visible.filter((t) => t.status === s.key).map((t) => (
                <div key={t.id} className="card task-card" style={catStyle(t)} draggable onDragStart={(e) => e.dataTransfer.setData("id", t.id)} onClick={() => setViewing(t)}>
                  <div>{t.title}{latePill(t) && <span className="late-pill" style={{ marginLeft: 6 }}><AlertTriangle size={10} strokeWidth={2.5} /> {latePill(t)}</span>}{!latePill(t) && <Countdown t={t} />}</div>
                  <Progress t={t} />
                  <div className="row" style={{ marginTop: 4 }}>
                    <span className="tag" style={{ color: COLORS[t.category] }}>{t.category}</span>
                    {t.date && <span className="muted">{fmtDay(t.date)}{t.endDate && t.endDate.slice(0, 10) !== t.date.slice(0, 10) ? ` → ${fmtDay(t.endDate)}` : ""}</span>}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {view !== "board" && view !== "list" && staleTasks.length > 0 && (
        <>
          <h3>En attente · date passée <span className="muted small">à relancer ou supprimer</span></h3>
          <div className="stale-list">
            {staleTasks.map((t) => (
              <div key={t.id} className="stale-item">
                <TaskChip t={t} />
                <span className="muted small">{staleDays(t)} j</span>
                <button title="Relancer : passer à faire aujourd'hui" onClick={() => relaunch(t)}><RotateCcw size={14} /><span className="relaunch-txt"> Relancer</span></button>
                <button className="stale-del" title="Supprimer la tâche" onClick={() => { if (confirm(`Supprimer « ${t.title} » ?`)) removeTask(t); }}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </>
      )}

      {view !== "board" && view !== "list" && visible.some((t) => !t.date && t.status !== "done") && (
        <>
          <h3>Sans date</h3>
          <div className="row">{visible.filter((t) => !t.date && t.status !== "done").map((t) => <TaskChip key={t.id} t={t} />)}</div>
        </>
      )}

      {viewing && (() => {
        // Toujours afficher la version à jour de la tâche (après un changement de statut, etc.)
        const t = tasks.find((x) => x.id === viewing.id) ?? viewing;
        const vals = propsOf(t);
        const filled = props.filter((p) => { const v = vals[p.id]; return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length) && v !== false; });
        const late = lateDays(t) || (timeOver(t) ? -1 : 0);
        const color = catColor(t);
        return (
          <TaskView
            t={t}
            color={color}
            late={late}
            filled={filled}
            vals={vals}
            onClose={() => setViewing(null)}
            onEdit={() => { setViewing(null); setEdit({ ...t, date: day(t), endDate: endDay(t) }); }}
            onStatus={(st) => move(t.id, { status: st })}
            onLinkVideos={() => { setViewing(null); setLinking(t); }}
            onSubs={(subs) => {
              // Première sous-tâche cochée : la tâche passe « en cours »
              const patch: Partial<Task> = { subtasks: JSON.stringify(subs) };
              if (t.status === "todo" && subs.some((s) => s.done)) patch.status = "doing";
              move(t.id, patch);
            }}
            onDelete={async () => { setViewing(null); setTasks((ts) => ts.filter((x) => x.id !== t.id)); await api(`tasks/${t.id}`, "DELETE"); }}
            onRevision={async (feedback) => {
              // Retour client : la version livrée passe en Terminé, une tâche « Modifs Vn » est créée sur 3 jours
              const { title, version } = revisionTitle(t.title);
              const start = today, end = isoDay(addDays(new Date(today + "T00:00"), REVISION_DAYS - 1));
              const notes = [feedback.trim() && `Retours client (V${version - 1}) :\n${feedback.trim()}`, t.notes].filter(Boolean).join("\n\n");
              setViewing(null);
              const created = await api<Task>("tasks", "POST", { title, category: t.category, props: t.props, status: "todo", date: start, endDate: end, notes });
              setTasks((ts) => [...ts.map((x) => (x.id === t.id ? { ...x, status: "done" } : x)), created]);
              await saveTask(t.id, { status: "done" });
              setViewing(created);
            }}
          />
        );
      })()}

      {edit && (
        <div className="overlay" onClick={() => setEdit(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <input autoFocus placeholder="Titre de la tâche" value={edit.title ?? ""} onChange={(e) => setEdit({ ...edit, title: e.target.value })} onKeyDown={(e) => e.key === "Enter" && saveEdit()} style={{ fontSize: 18 }} />
            {/* Dates facultatives : une tâche sans date va dans « Sans date » */}
            <div className="row">
              <label className="check">
                <input id="task-has-date" type="checkbox" checked={!!edit.date} onChange={(e) => setEdit(e.target.checked ? { ...edit, date: today } : { ...edit, date: null, endDate: null, repeat: "", repeatUntil: null })} /> Date
              </label>
              {edit.date && (
                <label className="check">
                  <input id="task-has-end" type="checkbox" checked={!!edit.endDate} onChange={(e) => setEdit({ ...edit, endDate: e.target.checked ? edit.date : null, startTime: e.target.checked ? "" : edit.startTime, endTime: e.target.checked ? "" : edit.endTime })} /> Date de fin
                </label>
              )}
              {edit.date && !edit.endDate && (
                <label className="check">
                  <input id="task-has-time" type="checkbox" checked={!!edit.startTime} onChange={(e) => setEdit({ ...edit, startTime: e.target.checked ? "09:00" : "", endTime: e.target.checked ? "10:00" : "" })} /> Horaire
                </label>
              )}
              {edit.date && (
                <label className="check">
                  <input id="task-has-repeat" type="checkbox" checked={!!edit.repeat} onChange={(e) => setEdit({ ...edit, repeat: e.target.checked ? "weekly" : "", repeatUntil: e.target.checked ? edit.repeatUntil : null })} /> Répéter
                </label>
              )}
            </div>
            {edit.date && (
              <div className="row">
                <label>{edit.endDate ? "Début" : "Date"}<input id="task-date" type="date" value={edit.date ?? ""} onChange={(e) => e.target.value && setEdit({ ...edit, date: e.target.value, endDate: edit.endDate && edit.endDate < e.target.value ? e.target.value : edit.endDate })} /></label>
                {edit.endDate && <label>Fin<input id="task-end" type="date" value={edit.endDate ?? ""} min={edit.date ?? undefined} onChange={(e) => setEdit({ ...edit, endDate: e.target.value || null })} /></label>}
                {!edit.endDate && edit.startTime && (
                  <>
                    <label>De<input id="task-start-time" type="time" value={edit.startTime} onChange={(e) => setEdit({ ...edit, startTime: e.target.value, endTime: edit.endTime && edit.endTime <= e.target.value ? addMinutes(e.target.value, 60) : edit.endTime })} /></label>
                    <label>À<input id="task-end-time" type="time" value={edit.endTime ?? ""} onChange={(e) => setEdit({ ...edit, endTime: e.target.value })} /></label>
                  </>
                )}
              </div>
            )}
            {edit.date && edit.repeat && (
              <div className="row">
                <label>Fréquence
                  <select id="task-repeat" value={edit.repeat} onChange={(e) => setEdit({ ...edit, repeat: e.target.value })}>
                    {Object.entries(REPEATS).filter(([k]) => k).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
                <label>Jusqu&apos;au (facultatif)<input id="task-until" type="date" value={edit.repeatUntil?.slice(0, 10) ?? ""} min={edit.date ?? undefined} onChange={(e) => setEdit({ ...edit, repeatUntil: e.target.value || null })} /></label>
              </div>
            )}
            <div className="row">
              <label>Statut
                <select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
                  {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </label>
              <label>Catégorie
                <select value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
            </div>
            {props.length > 0 && (
              <div className="prop-grid">
                {props.map((p) => (
                  <div key={p.id} className="prop-row">
                    <span className="muted">{PROP_ICONS[p.type]} {p.name}</span>
                    <PropValue
                      prop={p}
                      value={propsOf(edit)[p.id]}
                      onChange={(v) => setEdit({ ...edit, props: JSON.stringify({ ...propsOf(edit), [p.id]: v }) })}
                      onAddOption={(n) => { const q = props.find((x) => x.id === p.id)!; addOption(q, n); }}
                    />
                  </div>
                ))}
              </div>
            )}
            <label>Notes<textarea rows={4} value={edit.notes ?? ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></label>
            <div className="row">
              {edit.id && <button className="neg" onClick={remove}>Supprimer</button>}
              <span style={{ flex: 1 }} />
              <button onClick={() => setEdit(null)}>Annuler</button>
              <button className="primary" onClick={saveEdit}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {showEvent && (
        <div className="overlay" onClick={() => setShowEvent(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="row"><span className="dot" style={{ background: showEvent.color }} /><h3 style={{ margin: 0 }}>{showEvent.title}</h3></div>
            <div>
              {showEvent.allDay
                ? new Date(showEvent.start + "T00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
                : `${new Date(showEvent.start).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} · ${hhmm(showEvent.start)} – ${hhmm(showEvent.end)}`}
            </div>
            {showEvent.location && <div className="row" style={{ gap: 6 }}><MapPin size={15} /> {showEvent.location}</div>}
            {showEvent.description && <div style={{ whiteSpace: "pre-wrap" }}>{showEvent.description}</div>}
            <div className="muted">Agenda : {showEvent.calendar} (lecture seule)</div>
            <div className="row"><span style={{ flex: 1 }} /><button onClick={() => setShowEvent(null)}>Fermer</button></div>
          </div>
        </div>
      )}

      {evForm && (
        <EventModal
          form={evForm}
          calendars={writable}
          onClose={() => setEvForm(null)}
          onSaved={() => { setEvForm(null); loadEvents(); }}
        />
      )}

      {linking && <LinkVideos task={linking} onClose={() => setLinking(null)} onLinked={(deliveryId) => setTasks((ts) => ts.map((t) => (t.id === linking.id ? { ...t, deliveryId } : t)))} />}

      {showCals && (
        <CalendarsModal
          notice={notice}
          onClose={() => { setShowCals(false); setNotice(""); loadGcals(); loadEvents(true); }}
        />
      )}
    </div>
  );
}

function EventModal({ form, calendars, onClose, onSaved }: { form: EvForm; calendars: GCal[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(form);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (p: Partial<EvForm>) => setF({ ...f, ...p });
  // RDV pris via le lien public : report / annulation avec mail à la personne
  const [appt, setAppt] = useState<{ id: string; name: string; email: string; phone: string } | null>(null);
  const [notify, setNotify] = useState(true);
  const [message, setMessage] = useState("");
  useEffect(() => { if (form.eventId) api(`rdv?eventId=${encodeURIComponent(form.eventId)}`).then(setAppt).catch(() => {}); }, []);

  async function save() {
    if (!f.title.trim()) return setError("Donne un titre à l'événement.");
    const body = {
      calId: f.calId, title: f.title, allDay: f.allDay, location: f.location, description: f.description,
      start: f.allDay ? f.startDay : `${f.startDay}T${f.startTime}`,
      end: f.allDay ? (f.endDay < f.startDay ? f.startDay : f.endDay) : `${f.endDay}T${f.endTime}`,
    };
    if (!f.allDay && body.end <= body.start) return setError("L'heure de fin doit être après l'heure de début.");
    setBusy(true); setError("");
    try {
      if (f.eventId) await api(`google/events/${f.calId}/${encodeURIComponent(f.eventId)}`, "PATCH", body);
      else await api("google/events", "POST", body);
      const moved = f.startDay !== form.startDay || f.startTime !== form.startTime || f.endTime !== form.endTime;
      if (appt && moved && !f.allDay)
        await api(`rdv/${appt.id}`, "POST", { action: "move", day: f.startDay, time: f.startTime, end: f.endTime, force: true, skipGoogle: true, message: notify ? message : "", silent: !notify });
      onSaved();
    } catch (e) {
      setError(errorText(e)); setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      if (appt) await api(`rdv/${appt.id}`, "POST", { action: "cancel", message: notify ? message : "", silent: !notify });
      else await api(`google/events/${f.calId}/${encodeURIComponent(f.eventId!)}`, "DELETE");
      onSaved();
    } catch (e) {
      setError(errorText(e)); setBusy(false);
    }
  }

  const cal = calendars.find((c) => c.id === f.calId);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <input id="ev-title" autoFocus placeholder="Titre de l'événement" value={f.title} onChange={(e) => set({ title: e.target.value })} onKeyDown={(e) => e.key === "Enter" && save()} style={{ fontSize: 18 }} />
        <label>Agenda
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <span className="dot" style={{ background: cal?.color }} />
            <select id="ev-cal" value={f.calId} disabled={!!f.eventId} onChange={(e) => set({ calId: e.target.value })} style={{ flex: 1 }}>
              {calendars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </label>
        <label className="check">
          <input id="ev-allday" type="checkbox" checked={f.allDay} onChange={(e) => set({ allDay: e.target.checked })} /> Toute la journée
        </label>
        <div className="row">
          <label>Début<input id="ev-sd" type="date" value={f.startDay} onChange={(e) => set({ startDay: e.target.value, endDay: e.target.value > f.endDay ? e.target.value : f.endDay })} /></label>
          {!f.allDay && <label>&nbsp;<input id="ev-st" type="time" value={f.startTime} onChange={(e) => set({ startTime: e.target.value })} /></label>}
        </div>
        <div className="row">
          <label>Fin<input id="ev-ed" type="date" value={f.endDay} onChange={(e) => set({ endDay: e.target.value })} /></label>
          {!f.allDay && <label>&nbsp;<input id="ev-et" type="time" value={f.endTime} onChange={(e) => set({ endTime: e.target.value })} /></label>}
        </div>
        <label>Lieu<input id="ev-loc" value={f.location} onChange={(e) => set({ location: e.target.value })} /></label>
        <label>Notes<textarea id="ev-desc" rows={3} value={f.description} onChange={(e) => set({ description: e.target.value })} /></label>
        {appt && (
          <div className="appt-box">
            <b>RDV pris via ton lien · {appt.name}</b>
            <span className="muted small">{appt.email || appt.phone}</span>
            {appt.email
              ? <label className="check"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Prévenir {appt.name} par mail si je déplace ou supprime</label>
              : <span className="muted small">Pas de mail : préviens-le·la sur <a className="link" href={`https://wa.me/${appt.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">WhatsApp</a>.</span>}
            {appt.email && notify && <textarea rows={2} placeholder="Message joint au mail (facultatif)" value={message} onChange={(e) => setMessage(e.target.value)} />}
          </div>
        )}
        {error && <div className="neg">{error}</div>}
        <div className="row">
          {f.eventId && !confirmDelete && <button className="neg" disabled={busy} onClick={() => setConfirmDelete(true)}>Supprimer</button>}
          {confirmDelete && <><span className="neg">{appt ? `Annuler le RDV${appt.email && notify ? " et prévenir" : ""} ?` : "Supprimer de Google Agenda ?"}</span><button className="neg" disabled={busy} onClick={remove}>Oui</button><button onClick={() => setConfirmDelete(false)}>Non</button></>}
          <span style={{ flex: 1 }} />
          <button onClick={onClose}>Annuler</button>
          <button className="primary" disabled={busy} onClick={save}>{busy ? "…" : "Enregistrer"}</button>
        </div>
      </div>
    </div>
  );
}

// Les erreurs d'API arrivent en JSON { error } : on n'affiche que le message
function errorText(e: unknown) {
  const raw = (e as Error).message;
  try { return JSON.parse(raw).error ?? raw; } catch { return raw; }
}

function CalendarsModal({ notice, onClose }: { notice: string; onClose: () => void }) {
  const [cals, setCals] = useState<Cal[]>([]);
  const [google, setGoogle] = useState<{ configured: boolean; accounts: GAccount[] } | null>(null);
  const [newCal, setNewCal] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState(notice);
  const [draft, setDraft] = useState({ name: "", url: "", color: CAL_COLORS[0] });
  const load = () => api<Cal[]>("calendars").then(setCals);
  const loadGoogle = (refresh = false) => api(`google/calendars${refresh ? "?refresh=1" : ""}`).then((r) => { setGoogle(r); if (r.errors?.length) setMsg(r.errors.join(" · ")); });
  useEffect(() => { load(); loadGoogle(true); }, []);

  async function patchG(id: string, p: Partial<GCal>) {
    setGoogle((g) => g && { ...g, accounts: g.accounts.map((a) => ({ ...a, calendars: a.calendars.map((c) => (c.id === id ? { ...c, ...p } : c)) })) });
    try { await api(`google/calendars/${id}`, "PATCH", p); } catch (e) { setMsg(errorText(e)); loadGoogle(); }
  }

  async function createCal(accountId: string) {
    const name = newCal[accountId]?.trim();
    if (!name) return;
    try {
      await api("google/calendars", "POST", { accountId, name });
      setNewCal({ ...newCal, [accountId]: "" });
      setMsg(`Agenda « ${name} » créé dans Google.`);
      loadGoogle();
    } catch (e) { setMsg(errorText(e)); }
  }

  async function disconnect(id: string) {
    await api(`google/accounts/${id}`, "DELETE");
    loadGoogle();
  }

  async function add() {
    if (!draft.name.trim() || !draft.url.trim()) return;
    await api("calendars", "POST", draft);
    setDraft({ name: "", url: "", color: CAL_COLORS[(cals.length + 1) % CAL_COLORS.length] });
    load();
  }

  async function patch(id: string, p: Partial<Cal>) {
    setCals((cs) => cs.map((c) => (c.id === id ? { ...c, ...p } : c)));
    await api(`calendars/${id}`, "PATCH", p);
  }

  async function remove(id: string) {
    await api(`calendars/${id}`, "DELETE");
    load();
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ width: "min(600px, 94vw)", maxHeight: "88vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: 0 }} className="row"><CalendarCog size={18} /> Mes agendas</h3>
        {msg && <div className="notice" onClick={() => setMsg("")}>{msg} <X size={13} /></div>}

        <div className="section-title">Google Agenda <span className="muted">· lecture et écriture</span></div>
        {google && !google.configured && (
          <div className="muted">
            La connexion Google n'est pas encore activée : il manque <b>GOOGLE_CLIENT_ID</b> et <b>GOOGLE_CLIENT_SECRET</b> dans les variables d'environnement Vercel.
          </div>
        )}
        {google?.accounts.map((a) => (
          <div key={a.id} className="gaccount">
            <div className="row">
              <strong style={{ flex: 1 }}>{a.email}</strong>
              <button className="ghost neg" onClick={() => disconnect(a.id)}>Déconnecter</button>
            </div>
            {a.calendars.map((c) => (
              <div key={c.id} className="row" style={{ flexWrap: "nowrap" }}>
                <input id={`gv-${c.id}`} type="checkbox" title="Afficher dans le planning" checked={c.visible} onChange={(e) => patchG(c.id, { visible: e.target.checked })} />
                <input id={`gc-${c.id}`} type="color" value={c.color} onChange={(e) => patchG(c.id, { color: e.target.value })} style={{ width: 32, padding: 0, height: 26, flexShrink: 0 }} />
                {c.writable
                  ? <input id={`gn-${c.id}`} defaultValue={c.name} onBlur={(e) => e.target.value !== c.name && patchG(c.id, { name: e.target.value })} style={{ flex: 1, minWidth: 0 }} />
                  : <span style={{ flex: 1 }}>{c.name} <span className="muted">· lecture seule</span></span>}
              </div>
            ))}
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <input id={`gnew-${a.id}`} placeholder="Nouvel agenda (ex : Tournages)" value={newCal[a.id] ?? ""} onChange={(e) => setNewCal({ ...newCal, [a.id]: e.target.value })} onKeyDown={(e) => e.key === "Enter" && createCal(a.id)} style={{ flex: 1, minWidth: 0 }} />
              <button onClick={() => createCal(a.id)}>Créer</button>
            </div>
          </div>
        ))}
        {google?.configured && (
          <a className="gbutton" href="/api/google/connect">
            <b>G</b> {google.accounts.length ? "Connecter un autre compte Google" : "Connecter mon compte Google"}
          </a>
        )}

        <div className="section-title">Autres agendas <span className="muted">· lien iCal, lecture seule</span></div>
        {cals.map((c) => (
          <div key={c.id} className="row">
            <input id={`ic-${c.id}`} type="color" value={c.color} onChange={(e) => patch(c.id, { color: e.target.value })} style={{ width: 32, padding: 0, height: 26 }} />
            <strong style={{ flex: 1 }}>{c.name}</strong>
            <button className="ghost neg" onClick={() => remove(c.id)}>Retirer</button>
          </div>
        ))}
        <details className="muted">
          <summary>Ajouter un agenda par lien iCal (Apple, Outlook…)</summary>
          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
            <label>Nom<input id="ical-name" placeholder="ex : Perso" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
            <label>Adresse iCal<input id="ical-url" placeholder="https://…/basic.ics" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} /></label>
            <div className="row">
              {CAL_COLORS.map((c) => (
                <span key={c} className="dot" onClick={() => setDraft({ ...draft, color: c })} style={{ background: c, cursor: "pointer", outline: draft.color === c ? "2px solid var(--text)" : "none", outlineOffset: 2 }} />
              ))}
              <span style={{ flex: 1 }} />
              <button className="primary" onClick={add}>Ajouter</button>
            </div>
          </div>
        </details>
        <div className="row"><span style={{ flex: 1 }} /><button onClick={onClose}>Fermer</button></div>
      </div>
    </div>
  );
}

type SortKey = { key: string; dir: 1 | -1 };

function TaskTable({ tasks, props, onPatch, onSetProp, onAddOption, onOpen, onNew, onPropsChanged }: {
  tasks: Task[];
  props: Prop[];
  onPatch: (id: string, p: Partial<Task>) => void;
  onSetProp: (t: Task, propId: string, v: unknown) => void;
  onAddOption: (p: Prop, name: string) => void;
  onOpen: (t: Task) => void;
  onNew: () => void;
  onPropsChanged: () => void;
}) {
  const [sort, setSort] = useState<SortKey>({ key: "date", dir: 1 });
  const [adding, setAdding] = useState<{ name: string; type: PropType } | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  // Les menus s'affichent en position fixe pour ne pas être coupés par le défilement du tableau
  const [pos, setPos] = useState<React.CSSProperties>({});
  const anchor = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPos({ position: "fixed", top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 280)) });
  };
  const [confirmDel, setConfirmDel] = useState(false);

  const valueFor = (t: Task, key: string): string | number => {
    const v = ["title", "status", "category", "repeat"].includes(key) ? (t as any)[key] : key === "date" ? t.date?.slice(0, 10) : key === "endDate" ? t.endDate?.slice(0, 10) : propsOf(t)[key];
    if (v === null || v === undefined || v === "") return sort.dir === 1 ? "￿" : "";
    if (Array.isArray(v)) return v.join(",");
    if (typeof v === "boolean") return v ? 1 : 0;
    return v as string | number;
  };
  const rows = [...tasks].sort((a, b) => {
    const x = valueFor(a, sort.key), y = valueFor(b, sort.key);
    return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
  });
  const sortBy = (key: string) => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }));
  const arrow = (key: string) => (sort.key === key ? (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : null);

  async function createProp() {
    if (!adding?.name.trim()) return;
    await api("properties", "POST", { name: adding.name.trim(), type: adding.type, options: [], order: props.length });
    setAdding(null);
    onPropsChanged();
  }

  async function renameProp(p: Prop, name: string) {
    if (name.trim() && name !== p.name) { await api(`properties/${p.id}`, "PATCH", { name: name.trim() }); onPropsChanged(); }
  }

  async function deleteProp(p: Prop) {
    await api(`properties/${p.id}`, "DELETE");
    setMenu(null); setConfirmDel(false);
    onPropsChanged();
  }

  return (
    <div className="table-wrap">
      <table className="db">
        <thead>
          <tr>
            <th onClick={() => sortBy("title")} style={{ minWidth: 220 }}><Type size={13} className="prop-ic" /> Nom{arrow("title")}</th>
            <th onClick={() => sortBy("status")}><CircleDot size={13} className="prop-ic" /> Statut{arrow("status")}</th>
            <th onClick={() => sortBy("category")}><Tag size={13} className="prop-ic" /> Catégorie{arrow("category")}</th>
            <th onClick={() => sortBy("date")}><Calendar size={13} className="prop-ic" /> Début{arrow("date")}</th>
            <th onClick={() => sortBy("endDate")}><CalendarCheck size={13} className="prop-ic" /> Fin{arrow("endDate")}</th>
            <th onClick={() => sortBy("repeat")}><Repeat size={13} className="prop-ic" /> Répétition{arrow("repeat")}</th>
            {props.map((p) => (
              <th key={p.id} className="prop-th">
                <span onClick={() => sortBy(p.id)}>{PROP_ICONS[p.type]} {p.name}{arrow(p.id)}</span>
                <button className="ghost th-menu" title="Modifier la propriété" onClick={(e) => { anchor(e); setMenu(menu === p.id ? null : p.id); setConfirmDel(false); }}>⋯</button>
                {menu === p.id && (
                  <div className="th-pop" style={pos} onClick={(e) => e.stopPropagation()}>
                    <input id={`rename-${p.id}`} defaultValue={p.name} onBlur={(e) => renameProp(p, e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
                    <div className="muted">Type : {PROP_TYPES[p.type]}</div>
                    {!confirmDel
                      ? <button className="neg" onClick={() => setConfirmDel(true)}>Supprimer la propriété</button>
                      : <div className="row"><span className="neg">Supprimer « {p.name} » ?</span><button className="neg" onClick={() => deleteProp(p)}>Oui</button><button onClick={() => setConfirmDel(false)}>Non</button></div>}
                  </div>
                )}
              </th>
            ))}
            <th className="add-th">
              {!adding ? (
                <button className="ghost" title="Ajouter une propriété" onClick={(e) => { anchor(e); setAdding({ name: "", type: "select" }); }}>＋</button>
              ) : (
                <div className="th-pop" style={pos}>
                  <input id="new-prop-name" autoFocus placeholder="Nom de la propriété" value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && createProp()} />
                  <select id="new-prop-type" value={adding.type} onChange={(e) => setAdding({ ...adding, type: e.target.value as PropType })}>
                    {Object.entries(PROP_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <div className="row"><button onClick={() => setAdding(null)}>Annuler</button><button className="primary" onClick={createProp}>Ajouter</button></div>
                </div>
              )}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id}>
              <td className="title-cell">
                <input id={`t-${t.id}`} className="cell-input" placeholder="Sans titre" value={t.title} onChange={(e) => onPatch(t.id, { title: e.target.value })} />
                {!latePill(t) && <Countdown t={t} />}
                <Progress t={t} small />
                {latePill(t) && <span className="late-pill"><AlertTriangle size={10} strokeWidth={2.5} /> {latePill(t)}</span>}
                <button className="ghost open-btn" title="Ouvrir la tâche" onClick={() => onOpen(t)}>Ouvrir</button>
              </td>
              <td>
                <select id={`s-${t.id}`} className={`status-pill ${t.status}`} value={t.status} onChange={(e) => onPatch(t.id, { status: e.target.value })}>
                  {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </td>
              <td>
                <select id={`c-${t.id}`} className="cell-input" value={t.category} onChange={(e) => onPatch(t.id, { category: e.target.value })} style={{ color: COLORS[t.category] }}>
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </td>
              <td>
                <input id={`d-${t.id}`} className="cell-input" type="date" value={t.date?.slice(0, 10) ?? ""} onChange={(e) => onPatch(t.id, { date: e.target.value || null })} />
              </td>
              <td>
                <input id={`e-${t.id}`} className="cell-input" type="date" min={t.date?.slice(0, 10)} value={t.endDate?.slice(0, 10) ?? ""} onChange={(e) => onPatch(t.id, { endDate: e.target.value || null })} />
              </td>
              <td>
                <select id={`r-${t.id}`} className="cell-input" value={t.repeat ?? ""} onChange={(e) => onPatch(t.id, { repeat: e.target.value })}>
                  {Object.entries(REPEATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </td>
              {props.map((p) => (
                <td key={p.id}>
                  <PropValue prop={p} value={propsOf(t)[p.id]} onChange={(v) => onSetProp(t, p.id, v)} onAddOption={(n) => onAddOption(p, n)} />
                </td>
              ))}
              <td />
            </tr>
          ))}
        </tbody>
      </table>
      <button className="ghost new-row" onClick={onNew}><Plus size={15} /> Nouvelle tâche</button>
    </div>
  );
}

// « Projet » → « Modifs V2 · Projet » ; « Modifs V2 · Projet » → « Modifs V3 · Projet »
const REVISION_DAYS = 3;
function revisionTitle(title: string) {
  const m = title.match(/^Modifs V(\d+) · (.*)$/);
  const version = m ? Number(m[1]) + 1 : 2;
  return { title: `Modifs V${version} · ${m ? m[2] : title}`, version };
}

function TaskView({ t, color, late, filled, vals, onClose, onEdit, onStatus, onSubs, onDelete, onRevision, onLinkVideos }: {
  t: Task; color: string; late: number; filled: Prop[]; vals: Record<string, unknown>;
  onClose: () => void; onEdit: () => void; onStatus: (s: string) => void; onSubs: (subs: Sub[]) => void; onDelete: () => void;
  onRevision: (feedback: string) => void; onLinkVideos: () => void;
}) {
  const [revising, setRevising] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [newSub, setNewSub] = useState("");
  const subs = subsOf(t);
  const subsDone = subs.filter((s) => s.done).length;
  const addSub = (text = newSub) => {
    // Plusieurs lignes collées d'un coup = plusieurs sous-tâches
    const titles = text.split("\n").map((x) => x.trim()).filter(Boolean);
    if (!titles.length) return;
    onSubs([...subs, ...titles.map((title) => ({ id: Math.random().toString(36).slice(2, 10), title, done: false }))]);
    setNewSub("");
  };
  const longDay = (iso: string) => new Date(iso.slice(0, 10) + "T12:00:00Z").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const s0 = t.date?.slice(0, 10), e0 = t.endDate?.slice(0, 10);
  const show = (p: Prop) => {
    const v = vals[p.id];
    if (p.type === "checkbox") return <span className="ok-pill"><Check size={14} /> Oui</span>;
    if (p.type === "select" || p.type === "multi")
      return (Array.isArray(v) ? v : [v]).map((n) => <span key={String(n)} className="opt" style={{ background: p.options.find((o) => o.name === n)?.color }}>{String(n)}</span>);
    if (p.type === "date") return longDay(String(v));
    if (p.type === "url") return <a className="link" href={String(v)} target="_blank" rel="noreferrer">{String(v).replace(/^https?:\/\//, "").slice(0, 40)} <ExternalLink size={12} /></a>;
    return String(v);
  };
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal task-view" style={{ ["--cat" as string]: color }} onClick={(e) => e.stopPropagation()}>
        <div className="tv-band" />
        <div className="tv-top">
          <span className="tv-cat"><span className="dot" style={{ background: color }} />{t.category}</span>
          <button className="ghost tv-close" aria-label="Fermer" onClick={onClose}><X size={18} /></button>
        </div>
        <h2 className={`tv-title ${t.status === "done" ? "done" : ""}`}>{t.title || "Sans titre"}</h2>

        <div className="tv-status">
          {STATUSES.map((st) => (
            <button key={st.key} className={`tv-st ${st.key} ${t.status === st.key ? "on" : ""}`} onClick={() => onStatus(st.key)}>
              {st.key === "done" ? <Check size={14} /> : st.key === "doing" ? <CircleDot size={14} /> : st.key === "waiting" ? <CircleDashed size={14} /> : <Circle size={14} />} {st.label}
            </button>
          ))}
        </div>

        {late !== 0 && <div className="tv-late"><AlertTriangle size={15} /> {late < 0 ? "En retard : l'horaire est passé" : late === 1 ? "1 jour de retard" : `${late} jours de retard`}</div>}

        <dl className="tv-props">
          <dt><Calendar size={14} /> {e0 && e0 !== s0 ? "Période" : "Date"}</dt>
          <dd>{s0 ? <>{e0 && e0 !== s0 ? <>{longDay(s0)} <span className="muted">→</span> {longDay(e0)}</> : longDay(s0)} <span className="tv-left">{remainingLabel(t, isoDay(new Date())).text}</span></> : <span className="muted">Sans date</span>}</dd>
          {t.startTime && <><dt><Clock size={14} /> Horaire</dt><dd>{t.startTime}{t.endTime ? ` – ${t.endTime}` : ""}</dd></>}
          {t.repeat && <><dt><Repeat size={14} /> Répétition</dt><dd>{REPEATS[t.repeat]}{t.repeatUntil ? ` · jusqu'au ${longDay(t.repeatUntil)}` : ""}</dd></>}
          {filled.map((p) => <Fragment key={p.id}><dt>{PROP_ICONS[p.type]} {p.name}</dt><dd>{show(p)}</dd></Fragment>)}
        </dl>

        <div className="tv-subs">
          <div className="tv-subs-head">
            <b>Sous-tâches</b>
            {subs.length > 0 && <Progress t={t} />}
          </div>
          {subs.map((s, i) => (
            <div key={s.id} className={`tv-sub ${s.done ? "done" : ""}`}>
              <input type="checkbox" checked={s.done} onChange={() => onSubs(subs.map((x) => x.id === s.id ? { ...x, done: !x.done } : x))} />
              <input className="tv-sub-title" value={s.title} onChange={(e) => onSubs(subs.map((x) => x.id === s.id ? { ...x, title: e.target.value } : x))} />
              <button className="ghost" title="Monter" disabled={i === 0} onClick={() => { const c = [...subs]; [c[i - 1], c[i]] = [c[i], c[i - 1]]; onSubs(c); }}><ArrowUp size={13} /></button>
              <button className="ghost" title="Supprimer" onClick={() => onSubs(subs.filter((x) => x.id !== s.id))}><X size={13} /></button>
            </div>
          ))}
          <div className="tv-sub add">
            <Plus size={14} />
            <input placeholder="Ajouter une sous-tâche…" value={newSub} onChange={(e) => setNewSub(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addSub()} onPaste={(e) => { const txt = e.clipboardData.getData("text"); if (txt.includes("\n")) { e.preventDefault(); addSub(txt); } }} />
          </div>
          {subs.length > 0 && subsDone === subs.length && t.status !== "done" && (
            <button className="primary tv-subs-finish" onClick={() => onStatus("done")}><Check size={15} /> Tout est fait : marquer la tâche terminée</button>
          )}
        </div>

        {t.notes && <div className="tv-notes">{t.notes}</div>}

        {t.category === "Clients" && (
          <div className="tv-frame">
            <button className="tv-revision" onClick={onLinkVideos}><Clapperboard size={16} /> {t.deliveryId ? "Ajouter une vidéo Frame à la livraison" : "Lier une vidéo Frame"}</button>
            {t.deliveryId && <a className="link small" href="/livraisons">Voir la livraison liée →</a>}
          </div>
        )}

        {t.category === "Clients" && !revising && (
          <button className="tv-revision" onClick={() => setRevising(true)}>
            <MessageSquareReply size={16} /> Retour client · créer « {revisionTitle(t.title).title.split(" · ")[0]} »
          </button>
        )}
        {revising && (
          <div className="tv-revision-box">
            <label>Retours du client (facultatif)
              <textarea id="tv-feedback" autoFocus rows={4} placeholder="Ex : couper le plan à 0:12, logo plus grand, musique moins forte…" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
            </label>
            <p className="muted small">Crée « {revisionTitle(t.title).title} » sur les {REVISION_DAYS} prochains jours (à partir d&apos;aujourd&apos;hui) et passe cette version en Terminé.</p>
            <div className="row">
              <button onClick={() => setRevising(false)}>Annuler</button>
              <span style={{ flex: 1 }} />
              <button className="primary" onClick={() => onRevision(feedback)}><MessageSquareReply size={15} /> Créer les modifs</button>
            </div>
          </div>
        )}

        <div className="row tv-actions">
          {!confirmDel
            ? <button className="ghost neg" onClick={() => setConfirmDel(true)}><Trash2 size={15} /> Supprimer</button>
            : <><span className="neg">Supprimer ?</span><button className="neg" onClick={onDelete}>Oui</button><button onClick={() => setConfirmDel(false)}>Non</button></>}
          <span style={{ flex: 1 }} />
          <button className="primary" onClick={onEdit}><Pencil size={15} /> Modifier</button>
        </div>
      </div>
    </div>
  );
}

// Fin d'une tâche Clients : rattacher la ou les vidéos exportées sur Frame.io à une livraison
type DeliveryLite = { id: string; token: string; title: string; client: string; mode: string; accountId: string; files: string };
function LinkVideos({ task, onClose, onLinked }: { task: Task; onClose: () => void; onLinked: (deliveryId: string) => void }) {
  const [list, setList] = useState<DeliveryLite[] | null>(null);
  const [target, setTarget] = useState(task.deliveryId || "");
  const [done, setDone] = useState<{ text: string; link: string } | null>(null);
  const [error, setError] = useState("");
  const base = task.title.replace(/^Modifs V\d+ · /, "");
  useEffect(() => {
    api<DeliveryLite[]>("livraisons").then((l) => { setList(l); if (!task.deliveryId) setTarget(l.find((d) => d.title === base)?.id ?? "new-page"); }).catch(() => setList([]));
  }, []);

  async function pick(accountId: string, files: FrameFile[]) {
    setError("");
    try {
      let d: DeliveryLite;
      if (target.startsWith("new-")) {
        d = await api<DeliveryLite>("livraisons", "POST", { title: base, client: "", accountId, files, mode: target === "new-frame" ? "frame" : "page", kind: files.length > 1 ? "videos" : "versions" });
      } else {
        const cur = list!.find((x) => x.id === target)!;
        if (cur.accountId !== accountId) return setError("Choisis une vidéo du même compte Frame.io que cette livraison.");
        d = await api<DeliveryLite>(`livraisons/${cur.id}`, "PATCH", { files: [...JSON.parse(cur.files || "[]"), ...files] });
      }
      await api(`tasks/${task.id}`, "PATCH", { deliveryId: d.id });
      onLinked(d.id);
      const n = JSON.parse(d.files || "[]").length;
      const link = d.mode === "frame" ? "" : `${PUBLIC_URL}/l/${d.token}`;
      if (link) navigator.clipboard?.writeText(link).catch(() => {});
      setDone({ text: d.mode === "frame" ? `Vidéo liée au suivi Frame « ${d.title} » (V${n}). Les commentaires arriveront dans le Planning.` : `V${n} ajoutée à « ${d.title} ». Lien copié : envoie-le au client.`, link });
    } catch (e) { setError(errorText(e)); }
  }

  if (done) return (
    <div className="overlay" onClick={onClose}>
      <div className="modal appt-modal" onClick={(e) => e.stopPropagation()}>
        <h3>C&apos;est lié</h3>
        <p>{done.text}</p>
        {done.link && <a className="link small" href={done.link} target="_blank" rel="noreferrer">{done.link}</a>}
        <button className="primary" onClick={onClose}>OK</button>
      </div>
    </div>
  );
  return (
    <FramePicker title={task.status === "done" ? `« ${task.title} » terminée. Quelle(s) vidéo(s) Frame correspondent ?` : `Vidéo(s) Frame pour « ${task.title} »`} onPick={pick} onClose={onClose}>
      <label className="field-line">Ajouter à
        <select value={target} onChange={(e) => setTarget(e.target.value)} disabled={!list}>
          {list?.map((d) => <option key={d.id} value={d.id}>Nouvelle version de « {d.title} »{d.client ? ` · ${d.client}` : ""}{d.mode === "frame" ? " (suivi Frame)" : ""}</option>)}
          <option value="new-page">Nouvelle livraison « {base} » (lien maderino)</option>
          <option value="new-frame">Nouveau suivi Frame « {base} » (agence)</option>
        </select>
      </label>
      <p className="muted small">Choisis la ou les vidéos exportées, ou ferme pour passer. Pour une nouvelle livraison, plusieurs vidéos = des vidéos différentes (modifiable dans Livraisons).</p>
      {error && <p className="neg small">{error}</p>}
    </FramePicker>
  );
}
