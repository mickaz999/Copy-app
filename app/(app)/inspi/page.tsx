"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LayoutGrid, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";

type Board = { id: string; name: string; data: string; updatedAt: string };

export default function Espaces() {
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [name, setName] = useState("");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  useEffect(() => { api<Board[]>("boards").then(setBoards); }, []);

  async function create() {
    const b = await api<Board>("boards", "POST", { name: name.trim() || "Nouvel espace" });
    window.location.href = `/inspi/${b.id}`;
  }
  async function remove(id: string) {
    setBoards((bs) => bs!.filter((b) => b.id !== id));
    await api(`boards/${id}`, "DELETE");
  }
  const count = (b: Board) => { try { return JSON.parse(b.data).nodes.length as number; } catch { return 0; } };

  return (
    <div className="content">
      <div className="eyebrow">inspi</div>
      <h1 className="title">ce qu&apos;on <span className="accent">imagine.</span></h1>

      <section className="settings-card" style={{ marginBottom: 18 }}>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input id="board-name" placeholder="Nom du nouvel espace (ex : Clip Super Clever, Colo cinéma…)" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} style={{ flex: 1, minWidth: 0 }} />
          <button className="primary" onClick={create}><Plus size={16} /> Créer</button>
        </div>
      </section>

      {boards && !boards.length && <div className="empty-music"><LayoutGrid size={28} /><p>Crée ton premier espace d&apos;inspiration.</p></div>}
      <div className="boards-grid">
        {boards?.map((b) => (
          <div key={b.id} className="card board-card">
            <Link href={`/inspi/${b.id}`} className="board-link">
              <LayoutGrid size={20} className="board-ic" />
              <h3>{b.name}</h3>
              <span className="muted small">{count(b)} bloc{count(b) > 1 ? "s" : ""} · modifié le {new Date(b.updatedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
            </Link>
            {confirmDel === b.id
              ? <div className="row"><button className="ghost neg" onClick={() => remove(b.id)}>Supprimer ?</button><button className="ghost" onClick={() => setConfirmDel(null)}>Non</button></div>
              : <button className="ghost board-del" title="Supprimer l'espace" onClick={() => setConfirmDel(b.id)}><Trash2 size={15} /></button>}
          </div>
        ))}
      </div>
    </div>
  );
}
