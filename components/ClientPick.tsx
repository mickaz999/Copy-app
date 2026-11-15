"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

// Choix du client d'une livraison : liste déroulante (clients existants, nouveau client, aucun pour les agences)
export default function ClientPick({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [names, setNames] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  useEffect(() => { api<{ name: string }[]>("clients").then((l) => setNames(l.map((c) => c.name))).catch(() => {}); }, []);
  const list = value && !names.some((n) => n.toLowerCase() === value.toLowerCase()) ? [value, ...names] : names;
  const cur = list.find((n) => n.toLowerCase() === value.toLowerCase()) ?? "";
  const add = () => { const n = name.trim(); if (!n) return; setNames((l) => (l.includes(n) ? l : [...l, n])); onChange(n); setAdding(false); setName(""); };
  if (adding) return (
    <div className="row liv-client">
      <input autoFocus placeholder="Nom du client" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
      <button type="button" className="primary" disabled={!name.trim()} onClick={add}>Ajouter</button>
      <button type="button" className="ghost" onClick={() => setAdding(false)}>Annuler</button>
    </div>
  );
  return (
    <label className="field-line liv-client">Client
      <select value={cur} onChange={(e) => e.target.value === "__new" ? setAdding(true) : onChange(e.target.value)}>
        <option value="">Aucun (agence)</option>
        {list.map((n) => <option key={n} value={n}>{n}</option>)}
        <option value="__new">+ Nouveau client…</option>
      </select>
    </label>
  );
}
