"use client";
import { useEffect, useState } from "react";

// Écran de chargement des pages client : logo animé, barre lumineuse et messages qui défilent
const STEPS = ["Préparation de ta livraison", "Récupération des fichiers", "Création des aperçus", "Presque prêt"];

export default function LivLoader({ steps = STEPS }: { steps?: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((n) => Math.min(n + 1, steps.length - 1)), 1800); return () => clearInterval(t); }, []);
  return (
    <div className="ldr">
      <div className="ldr-glow" />
      {/* Symbole du logo maderino (triangle lecture + point) animé */}
      <svg className="ldr-logo" viewBox="0 0 120 80" aria-hidden>
        <path className="ldr-tri" d="M14 12 L62 40 L14 68 Z" />
        <circle className="ldr-dot" cx="84" cy="40" r="8" />
      </svg>
      <div className="ldr-brand">maderino <em>production.</em></div>
      <div className="ldr-bar"><i /></div>
      <p key={i} className="ldr-step">{steps[i]}…</p>
    </div>
  );
}

// Version compacte du symbole animé, pour les chargements dans une page
export function MiniLoader({ label = "Chargement" }: { label?: string }) {
  return (
    <div className="ldr-inline">
      <svg className="ldr-logo sm" viewBox="0 0 120 80" aria-hidden>
        <path className="ldr-tri" d="M14 12 L62 40 L14 68 Z" />
        <circle className="ldr-dot" cx="84" cy="40" r="8" />
      </svg>
      <span>{label}…</span>
    </div>
  );
}
