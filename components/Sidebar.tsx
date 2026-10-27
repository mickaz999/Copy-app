"use client";
import Link from "next/link";
import { Workflow, Calculator, Music2, Bell, CalendarDays, ChevronDown, ChevronRight, FileText, LogOut, Menu, Plus, Trash2, Wallet, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import Logo from "@/components/Logo";

type Page = { id: string; title: string; icon: string; parentId: string | null };

export default function Sidebar() {
  const [pages, setPages] = useState<Page[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // Menu tiroir sur téléphone, refermé à chaque changement de page
  const [menuOpen, setMenuOpen] = useState(false);
  const path = usePathname();
  const router = useRouter();

  useEffect(() => setMenuOpen(false), [path]);

  const load = () => api<Page[]>("pages").then(setPages);
  useEffect(() => {
    load();
    window.addEventListener("pages-changed", load);
    return () => window.removeEventListener("pages-changed", load);
  }, []);

  async function add(parentId: string | null) {
    const p = await api<Page>("pages", "POST", { parentId });
    if (parentId) setOpen((o) => ({ ...o, [parentId]: true }));
    await load();
    router.push(`/p/${p.id}`);
  }

  async function remove(id: string) {
    if (!confirm("Supprimer cette page et ses sous-pages ?")) return;
    await api(`pages/${id}`, "DELETE");
    await load();
    if (path === `/p/${id}`) router.push("/planning");
  }

  function tree(parentId: string | null, depth: number): React.ReactNode {
    return pages
      .filter((p) => p.parentId === parentId)
      .map((p) => {
        const hasKids = pages.some((c) => c.parentId === p.id);
        return (
          <div key={p.id}>
            <Link href={`/p/${p.id}`} className={`navitem ${path === `/p/${p.id}` ? "active" : ""}`} style={{ paddingLeft: 8 + depth * 14 }}>
              <span
                className="muted"
                style={{ width: 12, visibility: hasKids ? "visible" : "hidden" }}
                onClick={(e) => { e.preventDefault(); setOpen((o) => ({ ...o, [p.id]: !o[p.id] })); }}
              >
                {open[p.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
              <FileText size={16} className="nav-ic" />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{p.title || "Sans titre"}</span>
              <span className="actions">
                <button title="Sous-page" onClick={(e) => { e.preventDefault(); add(p.id); }}><Plus size={14} /></button>
                <button title="Supprimer" onClick={(e) => { e.preventDefault(); remove(p.id); }}><Trash2 size={14} /></button>
              </span>
            </Link>
            {open[p.id] && tree(p.id, depth + 1)}
          </div>
        );
      });
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <>
      <header className="topbar">
        <Link href="/planning"><Logo /></Link>
        <button className="ghost burger" aria-label="Menu" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={24} /> : <Menu size={24} />}</button>
      </header>
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}
    <nav className={`sidebar ${menuOpen ? "open" : ""}`}>
      <Logo />
      <Link href="/planning" className={`navitem ${path === "/planning" ? "active" : ""}`}><CalendarDays size={17} className="nav-ic" /> Planning</Link>
      <Link href="/compta" className={`navitem ${path === "/compta" ? "active" : ""}`}><Wallet size={17} className="nav-ic" /> Compta EI</Link>
      <Link href="/reglages" className={`navitem ${path === "/reglages" ? "active" : ""}`}><Bell size={17} className="nav-ic" /> Notifications</Link>
      <Link href="/musique" className={`navitem ${path === "/musique" ? "active" : ""}`}><Music2 size={17} className="nav-ic" /> Musique inspi</Link>
      <Link href="/inspi" className={`navitem ${path.startsWith("/inspi") ? "active" : ""}`}><Workflow size={17} className="nav-ic" /> Espaces inspi</Link>
      <Link href="/outils" className={`navitem ${path === "/outils" ? "active" : ""}`}><Calculator size={17} className="nav-ic" /> Outils</Link>
      <div className="section">
        Pages
        <button className="ghost" title="Nouvelle page" onClick={() => add(null)}><Plus size={15} /></button>
      </div>
      {tree(null, 0)}
      <div style={{ marginTop: "auto" }}>
        <div className="navitem muted" onClick={logout}><LogOut size={16} className="nav-ic" /> Déconnexion</div>
      </div>
    </nav>
    </>
  );
}
