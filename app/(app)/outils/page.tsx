"use client";
import { useEffect, useState } from "react";
import { Calculator, ExternalLink, RefreshCw } from "lucide-react";

// Outils du site maderinoprod.com, affichés dans l'app
const TOOLS = [
  { id: "pricing", label: "Pricing", url: "https://maderinoprod.com/outils/pricing", icon: Calculator },
];

export default function Outils() {
  const [active, setActive] = useState(TOOLS[0].id);
  const [key, setKey] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const tool = TOOLS.find((t) => t.id === active)!;

  // Si la page ne s'affiche pas au bout de quelques secondes (site qui refuse l'intégration), on propose de l'ouvrir à part
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setLoaded(false); setSlow(false);
    const t = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(t);
  }, [active, key]);

  return (
    <div className="content wide outils">
      <div className="eyebrow">outils</div>
      <h1 className="title">ce qui nous <span className="accent">aide.</span></h1>

      <div className="row" style={{ marginBottom: 14 }}>
        {TOOLS.map((t) => (
          <button key={t.id} className={active === t.id ? "primary" : ""} onClick={() => setActive(t.id)}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button className="ghost" title="Recharger" onClick={() => setKey((k) => k + 1)}><RefreshCw size={16} /></button>
        <a className="gbutton" href={tool.url} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Ouvrir en plein écran</a>
      </div>

      <div className="tool-frame card">
        {!loaded && (
          <div className="tool-loading muted">
            {slow ? <>La page met du temps à s&apos;afficher. <a className="link" href={tool.url} target="_blank" rel="noreferrer">Ouvre-la dans un nouvel onglet</a>.</> : "Chargement de l'outil…"}
          </div>
        )}
        <iframe key={`${active}-${key}`} src={tool.url} title={tool.label} onLoad={() => setLoaded(true)} />
      </div>
    </div>
  );
}
