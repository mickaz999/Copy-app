"use client";
import { useEffect, useState } from "react";
import { Car, Plus } from "lucide-react";

// Calculateur de prix (repris de l'outil Pricing de maderinoprod.com) : chaque bloc ajoute une ligne au devis.
type Line = { label: string; qty: number; unitPrice: number };

const OFFRES = [
  { nom: "Vidéo découverte", sous: "1 vidéo", prix: 199, videos: 1, tournage: 1, nbTournages: 1, call: 0,
    inclus: ["1 vidéo RS courte (≤ 30 s)", "Tournage 1 h", "Lyon + proche périphérie (15 km) uniquement"],
    tag: "199 € déduits si le client prend l'offre 2 ou 3 sous 30 jours · hors zone 15 km : pas de vidéo découverte" },
  { nom: "Offre 1", sous: "2 vidéos", prix: 379, videos: 2, tournage: 2.5, nbTournages: 1, inclus: ["2 vidéos RS courtes", "Tournage 2 h 30", "Call brief 30 min"] },
  { nom: "Offre 2", sous: "5 vidéos", prix: 699, videos: 5, tournage: 4, nbTournages: 1, inclus: ["5 vidéos RS courtes", "½ journée de tournage (4 h)", "Call brief 30 min"] },
  { nom: "Offre 3", sous: "10 vidéos", prix: 1390, videos: 10, tournage: 8, nbTournages: 2, inclus: ["10 vidéos RS courtes", "2 × ½ journée de tournage", "Call brief 30 min"] },
];
const H_CALL = 0.5, H_MONTAGE = 2, H_DEPLACEMENT = 1;
const hoursOf = (o: (typeof OFFRES)[number]) => (o.call ?? H_CALL) + o.tournage + o.nbTournages * H_DEPLACEMENT + o.videos * H_MONTAGE;
const MONTAGES = [
  { nom: "Reel ultra simple", desc: "Coupes, rythme, sous-titres", prix: 20, h: 0.5 },
  { nom: "Reel simple", desc: "Plusieurs plans, habillage, musique", prix: 40, h: 1 },
  { nom: "Reel poussé / ads", desc: "Motion design, format publicitaire", prix: 80, h: 2 },
];
const Y_STYLES = [{ nom: "Face caméra", ratio: 10 }, { nom: "Vlog / tuto", ratio: 20 }, { nom: "Dynamique", ratio: 40 }];

const eur = (v: number) => Math.round(v).toLocaleString("fr-FR") + " €";
const fmtH = (h: number) => (Math.round(h * 100) / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " h";
const fmtMin = (m: number) => (m >= 60 ? Math.floor(m / 60) + " h" + (m % 60 ? " " + String(m % 60).padStart(2, "0") : "") : m + " min");
const tx = (v: number) => v.toFixed(1).replace(".", ",") + " €/h";

const DEFAULTS = {
  taux: 40, pMin: 60, pSub: false, mRush: 2, mFilm: 30, mTeaser: false, mCeremonie: false,
  yStyle: 1, yRush: 1, yDur: 10, ySub: false, yMini: false,
  tTour: 2, tInst: 1, tTaux: 60, dKm: 0, dSeuil: 15, dPrixKm: 0.5, dTemps: 0,
};
type S = typeof DEFAULTS;
const KEY = "copy-pricing-v1";

export default function PricingCalc({ onAdd, destination }: { onAdd: (l: Line) => void; destination: string }) {
  const [s, setS] = useState<S>(DEFAULTS);
  const [dTo, setDTo] = useState("");
  const [dInfo, setDInfo] = useState("");
  const [dBusy, setDBusy] = useState(false);
  useEffect(() => { try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); if (v) setS({ ...DEFAULTS, ...v }); } catch {} }, []);
  const set = (p: Partial<S>) => setS((x) => { const n = { ...x, ...p }; try { localStorage.setItem(KEY, JSON.stringify(n)); } catch {} return n; });
  const t = s.taux;

  // Podcast : 30 min → 2 h, 1 h → 3,5 h (synchro + 3 min de montage par minute), minimum 2 h ; sous-titres : 1 h par heure
  const pH = Math.max(2, 0.5 + s.pMin * 0.05) + (s.pSub ? s.pMin / 60 : 0);
  const pPrix = Math.round(pH * t);
  // Mariage : dérush 20 min / h de rushes, film 2 h + 20 min / min finale, teaser 2 h, cérémonie 2,5 h
  const mDer = s.mRush / 3, mFilmH = s.mFilm ? 2 + s.mFilm / 3 : 0, mOpt = (s.mTeaser ? 2 : 0) + (s.mCeremonie ? 2.5 : 0);
  const mH = mDer + mFilmH + mOpt, mPrix = Math.round(mH * t);
  // YouTube : 30 min de base + dérush 20 min / h de rushes + montage selon le style
  const yDer = 0.5 + s.yRush / 3, yMont = (s.yDur * Y_STYLES[s.yStyle].ratio) / 60, yOpt = (s.ySub ? (s.yDur * 5) / 60 : 0) + (s.yMini ? 1 : 0);
  const yH = yDer + yMont + yOpt, yPrix = Math.round(yH * t);
  // Tournage à la carte
  const tTx = s.tTaux || t, tTot = (s.tTour + s.tInst) * tTx;
  // Déplacement : km au-delà de la zone incluse, aller-retour, + temps de route
  const kmFact = Math.max(0, s.dKm - s.dSeuil) * 2, dKmPrix = kmFact * s.dPrixKm, dTempsPrix = s.dTemps * t, dTot = dKmPrix + dTempsPrix;

  async function calcKm() {
    const to = dTo.trim() || destination;
    if (!to) { setDInfo("Indique le lieu du tournage (ou l'adresse du client)."); return; }
    setDBusy(true); setDInfo("");
    try {
      const res = await fetch(`/api/quotes/travel?to=${encodeURIComponent(to)}`);
      const b = await res.json();
      if (!res.ok) throw new Error(b.error);
      set({ dKm: b.km });
      if (!dTo.trim()) setDTo(to);
      setDInfo(`${b.km} km en voiture jusqu'à ${String(b.to).split(",").slice(0, 2).join(",")}`);
    } catch (e) { setDInfo(String((e as Error).message)); }
    setDBusy(false);
  }

  const card = { cursor: "default" } as const;
  const stat = (label: string, v: string, low = false) => <div className="muted small">{label}<br /><b style={{ color: low ? "var(--red, #d33)" : undefined }}>{v}</b></div>;
  const Range = ({ k, min, max, step, out }: { k: keyof S; min: number; max: number; step: number; out: string }) => (
    <label className="muted small" style={{ display: "grid", gap: 2 }}>
      <span className="row" style={{ justifyContent: "space-between" }}><span>{({ pMin: "Durée de l'épisode", mRush: "Rushes", mFilm: "Durée du film", yRush: "Rushes", yDur: "Durée finale" } as Record<string, string>)[k]}</span><b>{out}</b></span>
      <input type="range" min={min} max={max} step={step} value={s[k] as number} onChange={(e) => set({ [k]: Number(e.target.value) } as Partial<S>)} style={{ padding: 0, accentColor: "var(--accent)" }} />
    </label>
  );
  const Check = ({ k, label }: { k: keyof S; label: string }) => (
    <label className="check small"><input type="checkbox" checked={!!s[k]} onChange={(e) => set({ [k]: e.target.checked } as Partial<S>)} /> {label}</label>
  );
  const Num = ({ k, label, step = 1, w = 80 }: { k: keyof S; label: string; step?: number; w?: number }) => (
    <label className="muted small row">{label}<input type="number" min={0} step={step} style={{ width: w }} value={s[k] as number} onChange={(e) => set({ [k]: Number(e.target.value) } as Partial<S>)} /></label>
  );
  const Add = ({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) => (
    <button type="button" className="primary small" disabled={disabled} onClick={onClick}><Plus size={14} /> Ajouter au devis</button>
  );

  return (
    <div>
      <div className="row" style={{ marginTop: 14 }}>
        <div className="eyebrow" style={{ flex: 1 }}>calculateur</div>
        {Num({ k: "taux", label: "Mon taux horaire (€/h)" })}
      </div>

      <div className="eyebrow" style={{ marginTop: 10 }}>offres tournage + montage</div>
      <div className="calc-grid">
        {OFFRES.map((o) => {
          const h = hoursOf(o), reel = o.prix / h;
          return (
            <div key={o.nom} className="card" style={card}>
              <div className="row" style={{ justifyContent: "space-between" }}><b>{o.nom} <span className="muted small">· {o.sous}</span></b><b style={{ color: "var(--accent)" }}>{eur(o.prix)}</b></div>
              <ul className="muted small" style={{ margin: "6px 0", paddingLeft: 18 }}>{o.inclus.map((i) => <li key={i}>{i}</li>)}</ul>
              {o.tag && <div className="tag" style={{ display: "inline-block", marginBottom: 6 }}>{o.tag}</div>}
              <div className="row" style={{ justifyContent: "space-between" }}>{stat("Temps", fmtH(h))}{stat(`Coût à ${t} €/h`, eur(h * t))}{stat("Taux réel", tx(reel), reel < t)}{stat("Par vidéo", eur(o.prix / o.videos))}</div>
              <div style={{ marginTop: 8 }}>{Add({ onClick: () => onAdd({ label: `${o.nom} : ${o.sous} (${o.inclus.join(", ")})`, qty: 1, unitPrice: o.prix }) })}</div>
            </div>
          );
        })}
      </div>
      <button type="button" className="ghost small" onClick={() => onAdd({ label: "Déduction vidéo découverte déjà réalisée", qty: 1, unitPrice: -199 })}>− Déduire la vidéo découverte (199 €)</button>

      <div className="eyebrow" style={{ marginTop: 14 }}>montage seul</div>
      <div className="calc-grid">
        {MONTAGES.map((m) => {
          const reel = m.prix / m.h;
          return (
            <div key={m.nom} className="card" style={card}>
              <div className="row" style={{ justifyContent: "space-between" }}><b>{m.nom}</b><b style={{ color: "var(--accent)" }}>{eur(m.prix)}</b></div>
              <div className="muted small">{m.desc}</div>
              <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>{stat("Temps", fmtH(m.h))}{stat(`Coût à ${t} €/h`, eur(m.h * t))}{stat("Taux réel", tx(reel), reel < t)}</div>
              <div style={{ marginTop: 8 }}>{Add({ onClick: () => onAdd({ label: `${m.nom} : montage seul (${m.desc.toLowerCase()})`, qty: 1, unitPrice: m.prix }) })}</div>
            </div>
          );
        })}
      </div>

      <div className="calc-grid" style={{ marginTop: 14 }}>
        <div className="card" style={card}>
          <div className="eyebrow">podcast</div>
          {Range({ k: "pMin", min: 15, max: 180, step: 5, out: fmtMin(s.pMin) })}
          {Check({ k: "pSub", label: "Sous-titres" })}
          <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>{stat("Temps", fmtH(pH))}{stat("Par minute", (pPrix / s.pMin).toFixed(2).replace(".", ",") + " €")}<b style={{ fontSize: 20 }}>{eur(pPrix)}</b></div>
          <div style={{ marginTop: 8 }}>{Add({ onClick: () => onAdd({ label: `Montage podcast : ${fmtMin(s.pMin)}${s.pSub ? " + sous-titres" : ""}`, qty: 1, unitPrice: pPrix }) })}</div>
        </div>

        <div className="card" style={card}>
          <div className="eyebrow">mariage</div>
          {Range({ k: "mRush", min: 1, max: 12, step: 0.5, out: fmtH(s.mRush) })}
          {Range({ k: "mFilm", min: 0, max: 60, step: 1, out: s.mFilm ? `${s.mFilm} min` : "pas de film" })}
          <div className="row">{Check({ k: "mTeaser", label: "Teaser 60 s" })}{Check({ k: "mCeremonie", label: "Cérémonie" })}</div>
          <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>{stat("Dérush", fmtH(mDer))}{stat("Film", fmtH(mFilmH))}{stat("Options", fmtH(mOpt))}{stat("Total", fmtH(mH))}<b style={{ fontSize: 20 }}>{eur(mPrix)}</b></div>
          <div style={{ marginTop: 8 }}>{Add({ disabled: !mH, onClick: () => onAdd({ label: `Montage mariage : ${[s.mFilm ? `film ${s.mFilm} min` : "", s.mTeaser ? "teaser 60 s" : "", s.mCeremonie ? "cérémonie" : ""].filter(Boolean).join(" + ")} (${fmtH(s.mRush)} de rushes)`, qty: 1, unitPrice: mPrix }) })}</div>
        </div>

        <div className="card" style={card}>
          <div className="eyebrow">youtube</div>
          <div className="row" style={{ gap: 6, marginBottom: 6 }}>
            {Y_STYLES.map((y, i) => <button key={y.nom} type="button" className={`small ${i === s.yStyle ? "primary" : "ghost"}`} onClick={() => set({ yStyle: i })}>{y.nom}</button>)}
          </div>
          {Range({ k: "yRush", min: 0.5, max: 24, step: 0.5, out: fmtH(s.yRush) })}
          {Range({ k: "yDur", min: 1, max: 180, step: 1, out: fmtMin(s.yDur) })}
          <div className="row">{Check({ k: "ySub", label: "Sous-titres" })}{Check({ k: "yMini", label: "Miniature" })}</div>
          <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>{stat("Dérush", fmtH(yDer))}{stat("Montage", fmtH(yMont))}{stat("Options", fmtH(yOpt))}{stat("Total", fmtH(yH))}<b style={{ fontSize: 20 }}>{eur(yPrix)}</b></div>
          <div style={{ marginTop: 8 }}>{Add({ onClick: () => onAdd({ label: `Montage YouTube : ${[Y_STYLES[s.yStyle].nom.toLowerCase(), fmtMin(s.yDur), s.ySub ? "sous-titres" : "", s.yMini ? "miniature" : ""].filter(Boolean).join(" · ")}`, qty: 1, unitPrice: yPrix }) })}</div>
        </div>

        <div className="card" style={card}>
          <div className="eyebrow">tournage à la carte</div>
          <div className="row">{Num({ k: "tTour", label: "Tournage (h)", step: 0.5, w: 70 })}{Num({ k: "tInst", label: "Installation (h)", step: 0.5, w: 70 })}{Num({ k: "tTaux", label: "€/h", w: 70 })}</div>
          <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>{stat("Temps", `${fmtH(s.tTour + s.tInst)} à ${tTx} €/h`)}<b style={{ fontSize: 20 }}>{eur(tTot)}</b></div>
          <div style={{ marginTop: 8 }}>{Add({ disabled: !tTot, onClick: () => onAdd({ label: `Tournage : ${s.tTour.toLocaleString("fr-FR")} h (+ ${s.tInst.toLocaleString("fr-FR")} h d'installation)`, qty: 1, unitPrice: Math.round(tTot) }) })}</div>
        </div>

        <div className="card" style={card}>
          <div className="eyebrow">déplacement</div>
          <div className="row">
            <input style={{ flex: 1 }} placeholder="Lieu du tournage (vide = adresse du client)" value={dTo} onChange={(e) => setDTo(e.target.value)} />
            <button type="button" className="ghost small" disabled={dBusy} onClick={calcKm}><Car size={14} /> {dBusy ? "Calcul…" : "Calculer les km"}</button>
          </div>
          <div className="row" style={{ marginTop: 6 }}>{Num({ k: "dKm", label: "Km depuis Lyon (aller)", w: 70 })}{Num({ k: "dSeuil", label: "Zone incluse (km)", w: 60 })}{Num({ k: "dPrixKm", label: "€/km", step: 0.01, w: 70 })}{Num({ k: "dTemps", label: "Temps de route (h)", step: 0.25, w: 70 })}</div>
          {dInfo && <div className="muted small">{dInfo}</div>}
          <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
            <span className="muted small">{!s.dKm ? "Saisis la distance" : !dTot ? "Dans la zone : inclus" : [kmFact ? `${kmFact} km facturés (${eur(dKmPrix)})` : "", s.dTemps ? `${fmtH(s.dTemps)} de route (${eur(dTempsPrix)})` : ""].filter(Boolean).join(" + ")}</span>
            <b style={{ fontSize: 20 }}>{eur(dTot)}</b>
          </div>
          <div style={{ marginTop: 8 }}>{Add({ disabled: !dTot, onClick: () => onAdd({ label: `Déplacement : ${s.dKm} km de Lyon${dTo.trim() ? ` (${dTo.trim()})` : ""}, ${kmFact} km facturés aller-retour${s.dTemps ? ` + ${fmtH(s.dTemps)} de route` : ""}`, qty: 1, unitPrice: Math.round(dTot) }) })}</div>
        </div>
      </div>
    </div>
  );
}
