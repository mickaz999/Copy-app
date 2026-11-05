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
      <div className="ldr-mark"><span className="ldr-play" /><span className="ldr-ring" /></div>
      <div className="ldr-brand">maderino <em>production.</em></div>
      <div className="ldr-bar"><i /></div>
      <p key={i} className="ldr-step">{steps[i]}…</p>
    </div>
  );
}
