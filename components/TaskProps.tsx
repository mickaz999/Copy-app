"use client";
import { useEffect, useRef, useState } from "react";
import { AlignLeft, Calendar, CircleChevronDown, ExternalLink, Hash, Link2, List, SquareCheck } from "lucide-react";

export type PropType = "text" | "number" | "select" | "multi" | "date" | "checkbox" | "url";
export type Option = { name: string; color: string };
export type Prop = { id: string; name: string; type: PropType; options: Option[]; order: number };

export const PROP_TYPES: Record<PropType, string> = {
  text: "Texte", number: "Nombre", select: "Sélection", multi: "Sélection multiple",
  date: "Date", checkbox: "Case à cocher", url: "Lien",
};
const I = { size: 13, className: "prop-ic" };
export const PROP_ICONS: Record<PropType, React.ReactNode> = {
  text: <AlignLeft {...I} />, number: <Hash {...I} />, select: <CircleChevronDown {...I} />, multi: <List {...I} />,
  date: <Calendar {...I} />, checkbox: <SquareCheck {...I} />, url: <Link2 {...I} />,
};
const OPTION_COLORS = ["#ffe6d3", "#e3f1e8", "#e1ecfb", "#f1e4f8", "#fbe7e7", "#fbf3d5", "#ece9e5"];

export const nextOptionColor = (opts: Option[]) => OPTION_COLORS[opts.length % OPTION_COLORS.length];

// Affiche ou modifie la valeur d'une propriété, selon son type
export function PropValue({ prop, value, onChange, onAddOption }: {
  prop: Prop;
  value: unknown;
  onChange: (v: unknown) => void;
  onAddOption: (name: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const pick = useRef<HTMLDetailsElement>(null);
  const [menuPos, setMenuPos] = useState<React.CSSProperties>({});
  // Ferme le menu de choix quand on clique ailleurs
  useEffect(() => {
    const close = (e: MouseEvent) => { if (pick.current?.open && !pick.current.contains(e.target as Node)) pick.current.open = false; };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const id = `prop-${prop.id}`;

  switch (prop.type) {
    case "checkbox":
      return <input id={id} type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />;
    case "number":
      return <input id={id} className="cell-input num" type="number" value={(value as number) ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />;
    case "date":
      return <input id={id} className="cell-input" type="date" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || null)} />;
    case "url":
      return (
        <span className="row" style={{ flexWrap: "nowrap", gap: 4 }}>
          <input id={id} className="cell-input" placeholder="https://…" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
          {typeof value === "string" && /^https?:\/\//.test(value) && <a href={value} target="_blank" rel="noreferrer" title="Ouvrir"><ExternalLink size={14} /></a>}
        </span>
      );
    case "select":
    case "multi": {
      const selected: string[] = prop.type === "multi" ? ((value as string[]) ?? []) : value ? [value as string] : [];
      const toggle = (name: string) => {
        if (prop.type === "select") onChange(selected[0] === name ? null : name);
        else onChange(selected.includes(name) ? selected.filter((s) => s !== name) : [...selected, name]);
      };
      const color = (n: string) => prop.options.find((o) => o.name === n)?.color ?? "var(--tag)";
      return (
        <details
          className="pick"
          ref={pick}
          onToggle={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setMenuPos({ position: "fixed", top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - 240)) });
          }}
        >
          <summary>
            {selected.length ? selected.map((n) => <span key={n} className="opt" style={{ background: color(n) }}>{n}</span>) : <span className="muted">Vide</span>}
          </summary>
          <div className="pick-menu" style={menuPos}>
            {prop.options.map((o) => (
              <label key={o.name} className="pick-item">
                <input type={prop.type === "multi" ? "checkbox" : "radio"} name={id} checked={selected.includes(o.name)} onChange={() => toggle(o.name)} />
                <span className="opt" style={{ background: o.color }}>{o.name}</span>
              </label>
            ))}
            <input
              id={`${id}-new`}
              className="cell-input"
              placeholder="Nouvelle option + Entrée"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                const name = draft.trim();
                if (e.key !== "Enter" || !name) return;
                e.preventDefault();
                if (!prop.options.some((o) => o.name === name)) onAddOption(name);
                toggle(name);
                setDraft("");
              }}
            />
          </div>
        </details>
      );
    }
    default:
      return <input id={id} className="cell-input" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
  }
}
