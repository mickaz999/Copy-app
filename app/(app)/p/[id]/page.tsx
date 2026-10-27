"use client";
import { useEffect, useRef, useState } from "react";
import { ExternalLink, FileText, Trash2 } from "lucide-react";
import { api } from "@/lib/api";

type Block = { id: string; type: string; text: string; checked?: boolean; url?: string };

const TYPES: Record<string, string> = {
  p: "Texte", h1: "Titre 1", h2: "Titre 2", todo: "To-do", bullet: "Liste", quote: "Citation", code: "Code", link: "Lien",
};
// Raccourcis markdown en début de ligne
const SHORTCUTS: Record<string, string> = { "#": "h1", "##": "h2", "[]": "todo", "-": "bullet", ">": "quote", "```": "code" };

const uid = () => Math.random().toString(36).slice(2, 10);
const URL_RE = /^https?:\/\/\S+$/;
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

export default function PageEditor({ params }: { params: { id: string } }) {
  const [title, setTitle] = useState("");
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [focus, setFocus] = useState<{ id: string; atEnd: boolean } | null>(null);
  const refs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    api(`pages/${params.id}`).then((p) => {
      setTitle(p.title);
      const b = JSON.parse(p.content || "[]");
      setBlocks(b.length ? b : [{ id: uid(), type: "p", text: "" }]);
    });
  }, [params.id]);

  function save(patch: object, refreshNav = false) {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await api(`pages/${params.id}`, "PATCH", patch);
      if (refreshNav) window.dispatchEvent(new Event("pages-changed"));
    }, 400);
  }

  function update(next: Block[]) {
    setBlocks(next);
    save({ content: JSON.stringify(next) });
  }

  useEffect(() => {
    if (!focus) return;
    const el = refs.current[focus.id];
    if (el) {
      el.focus();
      const pos = focus.atEnd ? el.value.length : 0;
      el.setSelectionRange(pos, pos);
    }
    setFocus(null);
  }, [focus]);

  if (!blocks) return <div className="content narrow muted">Chargement…</div>;

  const patch = (i: number, p: Partial<Block>) => update(blocks.map((b, j) => (j === i ? { ...b, ...p } : b)));

  async function makeLink(i: number, url: string) {
    const id = blocks![i].id;
    const nb = { id: uid(), type: "p", text: "" };
    const next = [...blocks!.slice(0, i), { id, type: "link", url, text: "" }, nb, ...blocks!.slice(i + 1)];
    update(next);
    setFocus({ id: nb.id, atEnd: false });
    const { title } = await api(`preview?url=${encodeURIComponent(url)}`);
    if (title) setBlocks((bs) => {
      const out = bs!.map((b) => (b.id === id && !b.text ? { ...b, text: title } : b));
      save({ content: JSON.stringify(out) });
      return out;
    });
  }

  function onChange(i: number, text: string) {
    if (URL_RE.test(text.trim()) && blocks![i].type === "p" && !blocks![i].text) return makeLink(i, text.trim());
    const m = text.match(/^(#{1,2}|\[\]|-|>|```) /);
    if (m && blocks![i].type === "p") return patch(i, { type: SHORTCUTS[m[1]], text: text.slice(m[0].length) });
    patch(i, { text });
  }

  function onKey(i: number, e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const b = blocks![i];
    if (e.key === "Enter" && !e.shiftKey && b.type !== "code") {
      e.preventDefault();
      const keepType = ["todo", "bullet"].includes(b.type) && b.text ? b.type : "p";
      if (!b.text && b.type !== "p") return patch(i, { type: "p" });
      const nb = { id: uid(), type: keepType, text: "" };
      update([...blocks!.slice(0, i + 1), nb, ...blocks!.slice(i + 1)]);
      setFocus({ id: nb.id, atEnd: false });
    } else if (e.key === "Backspace" && e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0) {
      if (b.type !== "p") { e.preventDefault(); return patch(i, { type: "p" }); }
      if (i === 0) return;
      e.preventDefault();
      const prev = blocks![i - 1];
      update(blocks!.filter((_, j) => j !== i).map((x) => (x.id === prev.id ? { ...x, text: x.text + b.text } : x)));
      setFocus({ id: prev.id, atEnd: true });
    } else if (e.key === "ArrowUp" && i > 0 && e.currentTarget.selectionStart === 0) {
      setFocus({ id: blocks![i - 1].id, atEnd: true });
    } else if (e.key === "ArrowDown" && i < blocks!.length - 1 && e.currentTarget.selectionStart === b.text.length) {
      setFocus({ id: blocks![i + 1].id, atEnd: false });
    }
  }

  let n = 0;
  return (
    <div className="content narrow">
      <FileText size={34} strokeWidth={1.5} className="page-ic" />
      <input
        className="title"
        value={title}
        placeholder="Sans titre"
        onChange={(e) => { setTitle(e.target.value); save({ title: e.target.value }, true); }}
        style={{ fontSize: 36, fontWeight: 700, border: "none", width: "100%", padding: 0, margin: "8px 0 20px", outline: "none" }}
      />
      {blocks.map((b, i) => {
        n = b.type === "bullet" ? n + 1 : 0;
        return (
          <div key={b.id} className={`block ${b.type} ${b.checked ? "done" : ""}`}>
            <span className="handle">
              <select value={b.type} title="Type de bloc" onChange={(e) => patch(i, { type: e.target.value })}>
                {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </span>
            {b.type === "todo" && <input type="checkbox" checked={!!b.checked} onChange={(e) => patch(i, { checked: e.target.checked })} />}
            {b.type === "bullet" && <span className="bullet">•</span>}
            {b.type === "link" ? (
              <div className="bookmark">
                {b.url && <a href={b.url} target="_blank" rel="noreferrer" className="bm-open">
                  <img src={`https://www.google.com/s2/favicons?domain=${host(b.url)}&sz=32`} alt="" width={16} height={16} />
                  <span>{b.text || host(b.url)}</span>
                  <span className="muted row" style={{ gap: 4 }}>{host(b.url)} <ExternalLink size={13} /></span>
                </a>}
                <div className="row bm-edit">
                  <input placeholder="https://…" value={b.url ?? ""} onChange={(e) => patch(i, { url: e.target.value })} />
                  <input placeholder="Titre (optionnel)" value={b.text} onChange={(e) => patch(i, { text: e.target.value })} />
                  <button className="ghost" title="Supprimer le lien" onClick={() => update(blocks.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
                </div>
              </div>
            ) : (
            <textarea
              ref={(el) => {
                refs.current[b.id] = el;
                if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; }
              }}
              rows={1}
              value={b.text}
              placeholder={i === 0 && blocks.length === 1 ? "Écris quelque chose… (# titre, - liste, [] to-do, > citation, colle un lien)" : ""}
              onChange={(e) => onChange(i, e.target.value)}
              onKeyDown={(e) => onKey(i, e)}
            />
            )}
          </div>
        );
      })}
    </div>
  );
}
