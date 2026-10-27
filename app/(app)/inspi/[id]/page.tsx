"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Copy, Trash2, Undo2, ExternalLink, Film, Image as ImageIcon, Link2, ListChecks, Maximize2, Mic, Minus, Palette, Plus, Square, StickyNote, Type, Upload, X } from "lucide-react";
import { api } from "@/lib/api";
import { toEmbed } from "@/lib/embed";

type NodeType = "note" | "video" | "color" | "audio" | "image" | "check" | "link" | "title";
type Item = { id: string; text: string; done: boolean };
type BNode = { id: string; type: NodeType; x: number; y: number; w: number; h: number; title: string; text?: string; url?: string; color?: string; mediaId?: string; items?: Item[] };
type Edge = { id: string; from: string; to: string };
type View = { x: number; y: number; z: number };
type Data = { nodes: BNode[]; edges: Edge[]; view?: View };

const uid = () => Math.random().toString(36).slice(2, 10);
const DEFAULTS: Record<NodeType, Partial<BNode>> = {
  note: { w: 240, h: 170, title: "Note", text: "" },
  video: { w: 300, h: 230, title: "Vidéo", url: "" },
  color: { w: 200, h: 170, title: "Couleur", color: "#ff6b00", text: "" },
  audio: { w: 280, h: 140, title: "Vocal" },
  image: { w: 280, h: 240, title: "Image", url: "" },
  check: { w: 250, h: 210, title: "Checklist", items: [] },
  link: { w: 270, h: 120, title: "Lien", url: "" },
  title: { w: 360, h: 64, title: "Titre de section" },
};
const ICONS = { note: StickyNote, video: Film, color: Palette, audio: Mic, image: ImageIcon, check: ListChecks, link: Link2, title: Type };
const LABELS: Record<NodeType, string> = { video: "Vidéo", audio: "Vocal", note: "Note", image: "Image", check: "Checklist", link: "Lien", title: "Titre", color: "Couleur" };

export default function Espace({ params }: { params: { id: string } }) {
  const [name, setName] = useState("");
  const [nodes, setNodes] = useState<BNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [view, setView] = useState<View>({ x: 40, y: 40, z: 1 });
  const [loaded, setLoaded] = useState(false);
  const [linking, setLinking] = useState<{ from: string; x: number; y: number; dir?: "out" | "in" } | null>(null);
  const [selEdge, setSelEdge] = useState<string | null>(null);
  const vp = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    api<{ name: string; data: string }>(`boards/${params.id}`).then((b) => {
      setName(b.name);
      const d: Data = JSON.parse(b.data || "{}");
      setNodes(d.nodes ?? []); setEdges(d.edges ?? []); if (d.view) setView(d.view);
      setLoaded(true);
    });
  }, [params.id]);

  // Enregistrement automatique, regroupé
  useEffect(() => {
    if (!loaded) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => api(`boards/${params.id}`, "PATCH", { data: JSON.stringify({ nodes, edges, view }) }), 600);
  }, [nodes, edges, view, loaded]);

  const patchNode = (id: string, p: Partial<BNode>) => setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, ...p } : n)));

  // Coordonnées de la toile à partir d'un point de l'écran
  const toWorld = (cx: number, cy: number) => {
    const r = vp.current!.getBoundingClientRect();
    return { x: (cx - r.left - view.x) / view.z, y: (cy - r.top - view.y) / view.z };
  };

  function addNode(type: NodeType) {
    const r = vp.current!.getBoundingClientRect();
    const c = toWorld(r.left + r.width / 2, r.top + r.height / 2);
    const d = DEFAULTS[type];
    setNodes((ns) => {
      // Cherche une place libre en spirale autour du centre pour ne pas empiler les blocs
      const w = d.w!, h = d.h!, gap = 24;
      const free = (x: number, y: number) => !ns.some((o) => x < o.x + o.w + gap && x + w + gap > o.x && y < o.y + o.h + gap && y + h + gap > o.y);
      let x = c.x - w / 2, y = c.y - h / 2;
      outer: for (let ring = 1; ring < 40 && !free(x, y); ring++) {
        for (let k = 0; k < ring * 8; k++) {
          const a = (k / (ring * 8)) * Math.PI * 2;
          const tx = c.x - w / 2 + Math.cos(a) * ring * 120, ty = c.y - h / 2 + Math.sin(a) * ring * 120;
          if (free(tx, ty)) { x = tx; y = ty; break outer; }
        }
      }
      return [...ns, { id: uid(), type, x, y, ...(d as any) }];
    });
  }

  // Sélection et annulation : toute suppression peut être annulée
  const [selNode, setSelNode] = useState<string | null>(null);
  const history = useRef<{ nodes: BNode[]; edges: Edge[] }[]>([]);
  const [undoMsg, setUndoMsg] = useState("");
  const undoTimer = useRef<ReturnType<typeof setTimeout>>();
  const snapshot = (msg: string) => {
    history.current = [...history.current.slice(-30), { nodes, edges }];
    setUndoMsg(msg);
    clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndoMsg(""), 7000);
  };
  function undo() {
    const last = history.current.pop();
    if (!last) return;
    setNodes(last.nodes); setEdges(last.edges); setUndoMsg(""); setSelNode(null); setSelEdge(null);
  }

  function removeNode(id: string) {
    snapshot("Bloc supprimé");
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.from !== id && e.to !== id));
    setSelNode(null);
  }
  function removeEdge(id: string) {
    snapshot("Fil supprimé");
    setEdges((es) => es.filter((x) => x.id !== id));
    setSelEdge(null);
  }
  function duplicate(id: string) {
    const n = nodes.find((m) => m.id === id); if (!n) return;
    const copy = { ...n, id: uid(), x: n.x + 30, y: n.y + 30, items: n.items?.map((it) => ({ ...it, id: uid() })) };
    setNodes((ns) => [...ns, copy]); setSelNode(copy.id);
  }

  // Clavier (ordinateur) : Suppr efface la sélection, Ctrl+Z annule
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = /INPUT|TEXTAREA/.test((e.target as HTMLElement).tagName);
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !typing) { e.preventDefault(); undo(); }
      if ((e.key === "Delete" || e.key === "Backspace") && !typing) {
        if (selNode) removeNode(selNode); else if (selEdge) removeEdge(selEdge);
      }
      if (e.key === "Escape") { setSelNode(null); setSelEdge(null); setPending(null); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  // Glisser : déplacer un bloc, le redimensionner ou déplacer la toile
  function drag(e: React.PointerEvent, onMove: (dx: number, dy: number) => void) {
    e.preventDefault(); e.stopPropagation();
    let lx = e.clientX, ly = e.clientY;
    const move = (ev: PointerEvent) => { if (!vp.current?.classList.contains("gesturing")) onMove(ev.clientX - lx, ev.clientY - ly); lx = ev.clientX; ly = ev.clientY; };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // Le bloc attrapé passe au premier plan
  const toFront = (id: string) => setNodes((ns) => { const i = ns.findIndex((m) => m.id === id); return i < 0 || i === ns.length - 1 ? ns : [...ns.slice(0, i), ...ns.slice(i + 1), ns[i]]; });
  const moveNode = (e: React.PointerEvent, n: BNode) => { toFront(n.id); drag(e, (dx, dy) => setNodes((ns) => ns.map((m) => (m.id === n.id ? { ...m, x: m.x + dx / viewRef.current.z, y: m.y + dy / viewRef.current.z } : m)))); };
  const resizeNode = (e: React.PointerEvent, n: BNode) => drag(e, (dx, dy) => setNodes((ns) => ns.map((m) => (m.id === n.id ? { ...m, w: Math.max(160, m.w + dx / view.z), h: Math.max(110, m.h + dy / view.z) } : m))));
  // Toucher le fond : désélectionner (le déplacement lui-même est géré par les gestes ci-dessous)
  const pan = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).classList.contains("board-world")) return;
    setSelEdge(null); setPending(null); setSelNode(null);
  };

  // Gestes fluides : un doigt (ou la souris) pour se déplacer, deux doigts pour zoomer et se déplacer en même temps.
  // Pendant le geste on modifie directement le DOM (pas de rendu React à chaque image), puis on enregistre à la fin.
  const world = useRef<HTMLDivElement>(null);
  const viewRef = useRef(view);
  const live = useRef<View | null>(null);
  const panMoved = useRef(false);
  const tapStart = useRef<{ x: number; y: number } | null>(null);
  if (!live.current) viewRef.current = view;
  useEffect(() => {
    const el = vp.current; if (!el) return;
    const pts = new Map<number, { x: number; y: number }>();
    let raf = 0, inertia = 0, vel = { x: 0, y: 0, t: 0 }, startPt = { x: 0, y: 0 };
    const paint = (v: View) => {
      live.current = v;
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; const c = live.current; if (c && world.current) world.current.style.transform = `translate(${c.x}px, ${c.y}px) scale(${c.z})`; });
    };
    const commit = () => { const c = live.current; if (c) { live.current = null; setView(c); } };
    const cur = () => live.current ?? viewRef.current;
    const NO_PAN = "input, textarea, button, a, select, label, audio, video, iframe, [contenteditable], .port, .resize, .bnode-head, .node-actions, .wire-hit, .wire-del, .undo-toast, .board-zoom, .link-pick";
    // Pincement / écartement à deux doigts via les événements tactiles (fiable sur iPhone,
    // quel que soit l'endroit où les doigts se posent : bloc, texte, vidéo…)
    let pinch: { d: number; m: { x: number; y: number } } | null = null;
    const two = (e: TouchEvent) => {
      const r = el.getBoundingClientRect(), [a, b] = [e.touches[0], e.touches[1]];
      return { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1, m: { x: (a.clientX + b.clientX) / 2 - r.left, y: (a.clientY + b.clientY) / 2 - r.top } };
    };
    const tStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      cancelAnimationFrame(inertia);
      pts.clear(); pinch = two(e); panMoved.current = true;
      (document.activeElement as HTMLElement | null)?.blur?.();
      el.classList.add("gesturing");
    };
    const tMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length < 2) return;
      e.preventDefault();
      const n = two(e), v = cur();
      const z = Math.min(2.5, Math.max(0.2, v.z * (n.d / pinch.d)));
      const wx = (pinch.m.x - v.x) / v.z, wy = (pinch.m.y - v.y) / v.z;
      paint({ z, x: n.m.x - wx * z, y: n.m.y - wy * z });
      pinch = n;
    };
    const tEnd = (e: TouchEvent) => {
      if (!pinch || e.touches.length >= 2) return;
      pinch = null; pts.clear();
      el.classList.remove("gesturing");
      commit();
    };
    const noGesture = (e: Event) => e.preventDefault();
    el.addEventListener("touchstart", tStart, { passive: false, capture: true });
    el.addEventListener("touchmove", tMove, { passive: false, capture: true });
    el.addEventListener("touchend", tEnd, true);
    el.addEventListener("touchcancel", tEnd, true);
    el.addEventListener("gesturestart", noGesture);
    el.addEventListener("gesturechange", noGesture);

    const down = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (pinch || e.pointerType === "touch" && pts.size > 0) return;
      const touch = e.pointerType === "touch";
      if (!touch && e.button !== 0) return;
      // Deuxième doigt : toujours un zoom, même posé sur un bloc
      // Au doigt, un texte pas en cours d'édition laisse aussi glisser la toile (un simple toucher l'ouvre quand même)
      const softText = touch && t.matches("textarea, input:not([type=checkbox]):not([type=color]):not([type=range])") && document.activeElement !== t;
      const startsPan = (softText || !t.closest(NO_PAN)) && (t === el || !!t.closest(".board-world"));
      if (!startsPan) return;
      if (pts.size === 0 && t.closest(".bnode") && !touch) return; // à la souris, le corps d'un bloc reste sélectionnable
      cancelAnimationFrame(inertia);
      if (pts.size > 0) e.stopPropagation();
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) { panMoved.current = false; startPt = { x: e.clientX, y: e.clientY }; vel = { x: 0, y: 0, t: performance.now() }; }
      el.classList.add("gesturing");
    };
    const move = (e: PointerEvent) => {
      const p = pts.get(e.pointerId); if (!p) return;
      const v = cur();
      if (pinch) return;
      if (pts.size === 1) {
        const dx = e.clientX - p.x, dy = e.clientY - p.y;
        if (Math.hypot(e.clientX - startPt.x, e.clientY - startPt.y) > 8) panMoved.current = true;
        if (!panMoved.current) { return; }
        const now = performance.now(), dt = Math.max(1, now - vel.t);
        vel = { x: 0.8 * (dx / dt) + 0.2 * vel.x, y: 0.8 * (dy / dt) + 0.2 * vel.y, t: now };
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        paint({ ...v, x: v.x + dx, y: v.y + dy });
        return;
      }
      const [a0, b0] = [...pts.values()];
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [a1, b1] = [...pts.values()];
      const r = el.getBoundingClientRect();
      const m0 = { x: (a0.x + b0.x) / 2 - r.left, y: (a0.y + b0.y) / 2 - r.top }, m1 = { x: (a1.x + b1.x) / 2 - r.left, y: (a1.y + b1.y) / 2 - r.top };
      const d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y) || 1, d1 = Math.hypot(a1.x - b1.x, a1.y - b1.y);
      const z = Math.min(2.5, Math.max(0.2, v.z * (d1 / d0)));
      // Le point de la toile sous les doigts reste sous les doigts
      const wx = (m0.x - v.x) / v.z, wy = (m0.y - v.y) / v.z;
      panMoved.current = true;
      paint({ z, x: m1.x - wx * z, y: m1.y - wy * z });
    };
    const up = (e: PointerEvent) => {
      if (!pts.delete(e.pointerId)) return;
      if (pts.size === 1) { const [id] = [...pts.keys()]; const q = pts.get(id)!; startPt = q; vel = { x: 0, y: 0, t: performance.now() }; return; }
      if (pts.size) return;
      el.classList.remove("gesturing");
      // Petite inertie après un glissé rapide
      let vx = vel.x * 16, vy = vel.y * 16;
      if (performance.now() - vel.t > 80 || Math.hypot(vx, vy) < 2) return commit();
      const step = () => {
        vx *= 0.92; vy *= 0.92;
        const v = cur(); paint({ ...v, x: v.x + vx, y: v.y + vy });
        if (Math.hypot(vx, vy) > 0.4) inertia = requestAnimationFrame(step); else commit();
      };
      inertia = requestAnimationFrame(step);
    };
    el.addEventListener("pointerdown", down, true);
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => { el.removeEventListener("touchstart", tStart, true); el.removeEventListener("touchmove", tMove, true); el.removeEventListener("touchend", tEnd, true); el.removeEventListener("touchcancel", tEnd, true); el.removeEventListener("gesturestart", noGesture); el.removeEventListener("gesturechange", noGesture); cancelAnimationFrame(inertia); cancelAnimationFrame(raf); el.removeEventListener("pointerdown", down, true); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); };
  }, [loaded]);

  // Fil entre deux blocs. Depuis la sortie (droite) ou l'entrée (gauche) d'un bloc :
  // on glisse jusqu'à un autre bloc, ou on touche le rond puis le bloc à relier (pratique au doigt)
  const [pending, setPending] = useState<{ id: string; dir: "out" | "in" } | null>(null);
  const addEdge = (from: string, to: string) => {
    if (from === to) return;
    setEdges((es) => (es.some((x) => (x.from === from && x.to === to) || (x.from === to && x.to === from)) ? es : [...es, { id: uid(), from, to }]));
  };
  const connect = (a: string, b: string, dir: "out" | "in") => (dir === "out" ? addEdge(a, b) : addEdge(b, a));

  function startLink(e: React.PointerEvent, n: BNode, dir: "out" | "in") {
    e.preventDefault(); e.stopPropagation();
    if (pending && pending.id !== n.id) { connect(pending.id, n.id, pending.dir); setPending(null); return; }
    const sx = e.clientX, sy = e.clientY;
    let moved = false;
    const p = toWorld(sx, sy);
    setLinking({ from: n.id, x: p.x, y: p.y, dir } as any);
    const move = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8) moved = true;
      const q = toWorld(ev.clientX, ev.clientY); setLinking((l) => l && { ...l, x: q.x, y: q.y });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      setLinking(null);
      if (!moved) { setPending((pd) => (pd?.id === n.id ? null : { id: n.id, dir })); return; }
      const target = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest("[data-node]") as HTMLElement | null;
      if (target?.dataset.node) connect(n.id, target.dataset.node, dir);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // En mode « toucher pour relier », toucher un bloc termine le fil
  function nodeTap(e: React.PointerEvent, n: BNode) {
    tapStart.current = { x: e.clientX, y: e.clientY }; panMoved.current = false;
    if (!pending || pending.id === n.id) return;
    e.stopPropagation();
    connect(pending.id, n.id, pending.dir);
    setPending(null);
  }

  function zoom(factor: number, cx?: number, cy?: number) {
    const r = vp.current!.getBoundingClientRect();
    const px = cx ?? r.left + r.width / 2, py = cy ?? r.top + r.height / 2;
    setView((v) => {
      const z = Math.min(2.5, Math.max(0.25, v.z * factor));
      const k = z / v.z;
      return { z, x: px - r.left - (px - r.left - v.x) * k, y: py - r.top - (py - r.top - v.y) * k };
    });
  }

  useEffect(() => {
    const el = vp.current; if (!el) return;
    const wheel = (e: WheelEvent) => { e.preventDefault(); if (e.ctrlKey || e.metaKey) zoom(e.deltaY < 0 ? 1.1 : 0.9, e.clientX, e.clientY); else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY })); };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  });

  function fit() {
    if (!nodes.length) return setView({ x: 40, y: 40, z: 1 });
    const r = vp.current!.getBoundingClientRect();
    const minX = Math.min(...nodes.map((n) => n.x)), minY = Math.min(...nodes.map((n) => n.y));
    const maxX = Math.max(...nodes.map((n) => n.x + n.w)), maxY = Math.max(...nodes.map((n) => n.y + n.h));
    const z = Math.min(1.2, Math.max(0.25, Math.min((r.width - 80) / (maxX - minX), (r.height - 80) / (maxY - minY))));
    setView({ z, x: 40 - minX * z + (r.width - 80 - (maxX - minX) * z) / 2, y: 40 - minY * z + (r.height - 80 - (maxY - minY) * z) / 2 });
  }

  const byId = (id: string) => nodes.find((n) => n.id === id);
  const curve = (x1: number, y1: number, x2: number, y2: number) => {
    const d = Math.max(60, Math.abs(x2 - x1) / 2);
    return `M ${x1} ${y1} C ${x1 + d} ${y1}, ${x2 - d} ${y2}, ${x2} ${y2}`;
  };

  return (
    <div className="board-page">
      <div className="board-bar">
        <Link href="/inspi" className="gbutton"><ArrowLeft size={16} /></Link>
        <input id="board-title" className="board-title cell-input" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => api(`boards/${params.id}`, "PATCH", { name })} />
        <span style={{ flex: 1 }} />
        <div className="board-tools">
          {(Object.keys(LABELS) as NodeType[]).map((t) => {
            const Icon = ICONS[t];
            return <button key={t} title={`Ajouter : ${LABELS[t]}`} onClick={() => addNode(t)}><Icon size={16} /><span>{LABELS[t]}</span></button>;
          })}
        </div>
      </div>

      <div className="board-viewport" ref={vp} onPointerDown={pan}>
        <div className="board-world" ref={world} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }} onPointerDown={pan}>
          <svg className="board-wires">
            {edges.map((e) => {
              const a = byId(e.from), b = byId(e.to);
              if (!a || !b) return null;
              const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2;
              const col = a.type === "color" ? a.color : "#ff6b00";
              return (
                <g key={e.id} onPointerDown={(ev) => { ev.stopPropagation(); setSelEdge(e.id); setSelNode(null); }}>
                  <path d={curve(x1, y1, x2, y2)} className="wire-hit" />
                  <path d={curve(x1, y1, x2, y2)} className={`wire ${selEdge === e.id ? "sel" : ""}`} style={{ stroke: col }} />
                  {selEdge === e.id && (
                    <g className="wire-del" transform={`translate(${(x1 + x2) / 2} ${(y1 + y2) / 2})`} onPointerDown={(ev) => { ev.stopPropagation(); removeEdge(e.id); }}>
                      <circle r="11" /><path d="M -4 -4 L 4 4 M 4 -4 L -4 4" />
                    </g>
                  )}
                </g>
              );
            })}
            {linking && (() => {
              const a = byId(linking.from); if (!a) return null;
              return linking.dir === "in"
                ? <path d={curve(linking.x, linking.y, a.x, a.y + a.h / 2)} className="wire temp" />
                : <path d={curve(a.x + a.w, a.y + a.h / 2, linking.x, linking.y)} className="wire temp" />;
            })()}
          </svg>

          {nodes.map((n) => {
            const Icon = ICONS[n.type];
            const emb = n.type === "video" && n.url ? toEmbed(n.url) : null;
            return (
              <div key={n.id} className={`bnode ${n.type} ${selNode === n.id ? "selected" : ""} ${pending?.id === n.id ? "linking" : ""} ${pending && pending.id !== n.id ? "link-target" : ""}`} data-node={n.id} onPointerDownCapture={(e) => nodeTap(e, n)} onPointerUpCapture={(e) => { const d = tapStart.current; if (d && !panMoved.current && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 10) { setSelNode(n.id); setSelEdge(null); } }} style={{ left: n.x, top: n.y, width: n.w, height: n.h, ["--node" as string]: n.type === "color" ? n.color : undefined }}>
                <div className="bnode-head" onPointerDown={(e) => moveNode(e, n)}>
                  <Icon size={14} />
                  <input className="bnode-title cell-input" placeholder={n.type === "title" ? "Titre…" : "Sans titre"} value={n.title} onPointerDown={(e) => e.stopPropagation()} onChange={(e) => patchNode(n.id, { title: e.target.value })} />
                  <button className="ghost bnode-x" title="Supprimer" onPointerDown={(e) => e.stopPropagation()} onClick={() => removeNode(n.id)}><X size={14} /></button>
                </div>
                <div className="bnode-body">
                  {n.type === "note" && <textarea placeholder="Écris ici…" value={n.text} onChange={(e) => patchNode(n.id, { text: e.target.value })} />}
                  {n.type === "color" && (
                    <div className="swatch-wrap">
                      <label className="swatch" style={{ background: n.color }}><input type="color" value={n.color} onChange={(e) => patchNode(n.id, { color: e.target.value })} /></label>
                      <input className="hex" value={n.color} onChange={(e) => patchNode(n.id, { color: e.target.value })} />
                      <input className="swatch-note" placeholder="ombres, peau, hautes lumières…" value={n.text} onChange={(e) => patchNode(n.id, { text: e.target.value })} />
                    </div>
                  )}
                  {n.type === "video" && !emb && (
                    <div className="video-empty">
                      <input placeholder="Colle un lien YouTube, Reel, TikTok, Vimeo, Spotify…" onKeyDown={(e) => { const v = (e.target as HTMLInputElement).value; if (e.key === "Enter" && v) { const em = toEmbed(v); patchNode(n.id, { url: v, title: n.title === "Vidéo" ? em.label : n.title, ...(em.vertical ? { w: 260, h: 500 } : em.w ? { w: em.w, h: em.h } : {}) }); } }} />
                      <span className="muted small">puis Entrée</span>
                    </div>
                  )}
                  {n.type === "audio" && <VoiceNote node={n} onChange={(p) => patchNode(n.id, p)} />}
                  {n.type === "image" && <ImageBlock node={n} onChange={(p) => patchNode(n.id, p)} />}
                  {n.type === "check" && <Checklist node={n} onChange={(p) => patchNode(n.id, p)} />}
                  {n.type === "link" && <LinkBlock node={n} onChange={(p) => patchNode(n.id, p)} />}
                  {emb && (emb.kind === "link"
                    ? <a className="link" href={emb.src} target="_blank" rel="noreferrer">Ouvrir {emb.label}</a>
                    : <iframe src={emb.src} title={n.title} allow="autoplay; encrypted-media; picture-in-picture; clipboard-write" allowFullScreen />)}
                </div>
                <span className="port in" title="Relier" onPointerDown={(e) => startLink(e, n, "in")} />
                <span className="port out" title="Relier" onPointerDown={(e) => startLink(e, n, "out")} />
                <span className="resize" onPointerDown={(e) => resizeNode(e, n)} />
              </div>
            );
          })}
        </div>

        {pending && (
          <div className="link-banner">Touche le bloc à relier · <button className="ghost" onClick={() => setPending(null)}>Annuler</button></div>
        )}
        {!nodes.length && loaded && <div className="board-empty muted">Ajoute une vidéo, une note ou une couleur avec les boutons du haut.<br />Relie les blocs en tirant un fil depuis le rond de droite.</div>}

        {selNode && (() => {
          const n = byId(selNode); if (!n) return null;
          return (
            <div className="node-actions" style={{ left: view.x + n.x * view.z, top: Math.max(6, view.y + n.y * view.z - 50) }} onPointerDown={(e) => e.stopPropagation()}>
              <button onClick={() => duplicate(n.id)}><Copy size={15} /> Dupliquer</button>
              <button className="danger" onClick={() => removeNode(n.id)}><Trash2 size={15} /> Supprimer</button>
            </div>
          );
        })()}
        {undoMsg && (
          <div className="undo-toast">{undoMsg} <button onClick={undo}><Undo2 size={15} /> Annuler</button></div>
        )}

        <div className="board-zoom">
          <button onClick={() => zoom(1 / 1.2)} title="Dézoomer"><Minus size={16} /></button>
          <span>{Math.round(view.z * 100)} %</span>
          <button onClick={() => zoom(1.2)} title="Zoomer"><Plus size={16} /></button>
          <button onClick={fit} title="Tout voir"><Maximize2 size={15} /></button>
        </div>
      </div>
    </div>
  );
}

// ---- Blocs ----

async function upload(blob: Blob) {
  const res = await fetch("/api/media", { method: "POST", headers: { "Content-Type": blob.type || "application/octet-stream" }, body: blob });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error ?? "Envoi impossible");
  return j.id as string;
}

// Enregistrement d'un vocal au micro (5 min max)
function VoiceNote({ node, onChange }: { node: BNode; onChange: (p: Partial<BNode>) => void }) {
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [secs, setSecs] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function start() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm", "audio/mp4", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setBusy(true);
        try { onChange({ mediaId: await upload(new Blob(chunks, { type: r.mimeType || "audio/webm" })) }); }
        catch (e) { setError((e as Error).message); }
        finally { setBusy(false); setRec(null); }
      };
      r.start();
      setRec(r); setSecs(0);
    } catch {
      setError("Micro refusé : autorise le micro pour ce site dans ton navigateur.");
    }
  }

  useEffect(() => {
    if (!rec) return;
    const t = setInterval(() => setSecs((s) => { if (s + 1 >= 300) rec.stop(); return s + 1; }), 1000);
    return () => clearInterval(t);
  }, [rec]);

  if (node.mediaId)
    return (
      <div className="voice">
        <audio controls src={`/api/media/${node.mediaId}`} />
        <button className="ghost small" onClick={() => onChange({ mediaId: undefined })}>Réenregistrer</button>
      </div>
    );
  return (
    <div className="voice">
      {rec
        ? <button className="rec on" onClick={() => rec.stop()}><Square size={14} fill="currentColor" /> Arrêter · {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}</button>
        : <button className="rec" disabled={busy} onClick={start}><Mic size={16} /> {busy ? "Envoi…" : "Enregistrer un vocal"}</button>}
      {error && <span className="neg small">{error}</span>}
    </div>
  );
}

// Réduit une photo (1800 px max, JPEG) pour qu'elle reste légère à envoyer et à afficher
async function shrink(f: File): Promise<Blob> {
  if (!f.type.startsWith("image/") || f.type === "image/gif") return f;
  const img = await createImageBitmap(f).catch(() => null);
  if (!img) return f;
  const k = Math.min(1, 1800 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res(b ?? f), "image/jpeg", 0.85));
}

// Image depuis un lien ou un fichier (photo du téléphone, capture…)
function ImageBlock({ node, onChange }: { node: BNode; onChange: (p: Partial<BNode>) => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function pick(f?: File) {
    if (!f) return;
    setBusy(true); setError("");
    try { const id = await upload(await shrink(f)); onChange({ mediaId: id, url: `/api/media/${id}` }); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  if (node.url) return <img className="bimg" src={node.url} alt={node.title} draggable={false} />;
  return (
    <div className="video-empty">
      <label className="gbutton upload"><Upload size={15} /> {busy ? "Envoi…" : "Choisir une image"}<input type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} /></label>
      <input placeholder="ou colle un lien d'image + Entrée" onKeyDown={(e) => { const v = (e.target as HTMLInputElement).value.trim(); if (e.key === "Enter" && v) onChange({ url: v }); }} />
      {error && <span className="neg small">{error}</span>}
    </div>
  );
}

function Checklist({ node, onChange }: { node: BNode; onChange: (p: Partial<BNode>) => void }) {
  const items = node.items ?? [];
  const [focusId, setFocusId] = useState<string | null>(null);
  const set = (next: Item[]) => onChange({ items: next });
  const addAfter = (i: number) => { const it = { id: uid(), text: "", done: false }; const nx = [...items]; nx.splice(i + 1, 0, it); set(nx); setFocusId(it.id); };
  return (
    <div className="checklist">
      {items.map((it, i) => (
        <label key={it.id} className={`check-item ${it.done ? "done" : ""}`}>
          <input type="checkbox" checked={it.done} onChange={(e) => set(items.map((x) => (x.id === it.id ? { ...x, done: e.target.checked } : x)))} />
          <input className="check-text cell-input" autoFocus={focusId === it.id} placeholder="À faire…" value={it.text} onChange={(e) => set(items.map((x) => (x.id === it.id ? { ...x, text: e.target.value } : x)))}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !it.text) { e.preventDefault(); set(items.filter((x) => x.id !== it.id)); }
              if (e.key === "Enter") { e.preventDefault(); addAfter(i); }
            }} />
        </label>
      ))}
      <button className="ghost small add-item" onClick={() => addAfter(items.length - 1)}><Plus size={13} /> Ajouter</button>
    </div>
  );
}

function LinkBlock({ node, onChange }: { node: BNode; onChange: (p: Partial<BNode>) => void }) {
  if (!node.url)
    return (
      <div className="video-empty">
        <input placeholder="Colle un lien + Entrée" onKeyDown={(e) => { const v = (e.target as HTMLInputElement).value.trim(); if (e.key === "Enter" && v) { let host = v; try { host = new URL(v).hostname.replace(/^www\./, ""); } catch {} onChange({ url: v, title: node.title === "Lien" ? host : node.title }); } }} />
      </div>
    );
  return <LinkCard node={node} onChange={onChange} />;
}

// Un lien Spotify, YouTube, Reel… s'affiche directement en lecteur
function LinkCard({ node, onChange }: { node: BNode; onChange: (p: Partial<BNode>) => void }) {
  const emb = toEmbed(node.url!);
  useEffect(() => {
    if (emb.kind === "link") return;
    const w = emb.vertical ? 260 : emb.w ?? 420, h = emb.vertical ? 500 : emb.h ?? 280;
    if (node.h < h - 20 || node.w < w - 20) onChange({ w: Math.max(node.w, w), h: Math.max(node.h, h), title: /\./.test(node.title ?? "") ? emb.label : node.title });
  }, [node.url]); // eslint-disable-line react-hooks/exhaustive-deps
  if (emb.kind !== "link")
    return <iframe src={emb.src} title={node.title} allow="autoplay; encrypted-media; picture-in-picture; clipboard-write" allowFullScreen />;
  let host = node.url!;
  try { host = new URL(node.url!).hostname.replace(/^www\./, ""); } catch {}
  return (
    <a className="link-card" href={node.url} target="_blank" rel="noreferrer">
      <img src={`https://www.google.com/s2/favicons?domain=${host}&sz=64`} alt="" width={28} height={28} />
      <span><b>{host}</b><span className="muted small">{node.url}</span></span>
      <ExternalLink size={15} />
    </a>
  );
}
