"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

// Suggestions de clients déjà utilisés (livraisons + dépôts), pour un champ <input list="clients">
export default function ClientList() {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    Promise.all([api<{ client: string }[]>("livraisons").catch(() => []), api<{ client: string }[]>("drops").catch(() => [])]).then(([a, b]) => {
      const seen = new Map<string, string>();
      for (const x of [...a, ...b]) { const n = (x.client ?? "").trim(); if (n && !seen.has(n.toLowerCase())) seen.set(n.toLowerCase(), n); }
      setNames(Array.from(seen.values()).sort((x, y) => x.localeCompare(y, "fr")));
    });
  }, []);
  return <datalist id="clients">{names.map((n) => <option key={n} value={n} />)}</datalist>;
}
