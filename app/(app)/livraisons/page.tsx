"use client";
import { useEffect, useState } from "react";
import { Clapperboard, Link2 } from "lucide-react";
import { api } from "@/lib/api";

type Project = { accountId: string; account: string; workspace: string; id: string; name: string };
type Info = { configured: boolean; connected: boolean; projects: Project[]; error?: string; check?: { idEnd: string; idLength: number; secretStart: string; secretLength: number } };

export default function Livraisons() {
  const [info, setInfo] = useState<Info | null>(null);
  useEffect(() => { api<Info>("frameio/projects").then(setInfo).catch((e) => setInfo({ configured: true, connected: true, projects: [], error: (e as Error).message })); }, []);

  return (
    <div className="content narrow">
      <div className="eyebrow">livraisons</div>
      <h1 className="title">tes <span className="accent">livraisons.</span></h1>

      <section className="settings-card">
        <div className="sc-head"><Clapperboard size={18} /> <h3>Frame.io</h3></div>
        {!info && <p className="muted">Chargement…</p>}
        {info && !info.configured && <p className="muted">Il manque <b>FRAMEIO_CLIENT_ID</b> et <b>FRAMEIO_CLIENT_SECRET</b> dans les variables Vercel.</p>}
        {info?.configured && !info.connected && (
          <>
            <p className="muted">Connecte ton compte Frame.io (connexion Adobe) pour livrer tes vidéos depuis l&apos;app.</p>
            {info.check && <p className="muted small">Vérif. Vercel : Client ID …{info.check.idEnd} ({info.check.idLength} car.) · Secret « {info.check.secretStart}… » ({info.check.secretLength} car.)</p>}
            <div className="row"><a href="/api/connect/frameio"><button className="primary"><Link2 size={16} /> Connecter Frame.io</button></a></div>
          </>
        )}
        {info?.connected && (
          <>
            {info.error
              ? <p className="neg">{info.error}</p>
              : <p className="muted">Connecté ✅ · {info.projects.length} projet{info.projects.length > 1 ? "s" : ""} trouvé{info.projects.length > 1 ? "s" : ""}.</p>}
            {info.projects.map((p) => <div key={p.id} className="appt-links"><span>{p.name}</span><span className="muted small">{p.workspace}</span></div>)}
            <div className="row"><a href="/api/connect/frameio"><button><Link2 size={16} /> Reconnecter</button></a></div>
          </>
        )}
      </section>
    </div>
  );
}
