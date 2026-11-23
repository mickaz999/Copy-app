// Champs modifiables d'une facture (brouillon)
export function clean(b: Record<string, any>) {
  const out: Record<string, unknown> = {};
  if ("date" in b && b.date) out.date = new Date(b.date);
  if ("dueDate" in b && b.dueDate) out.dueDate = new Date(b.dueDate);
  if ("client" in b) out.client = String(b.client ?? "");
  if ("note" in b) out.note = String(b.note ?? "");
  if ("buyer" in b) out.buyer = typeof b.buyer === "string" ? b.buyer : JSON.stringify(b.buyer ?? {});
  if ("lines" in b)
    out.lines = JSON.stringify((Array.isArray(b.lines) ? b.lines : []).map((l: any) => ({ label: String(l.label ?? ""), qty: Number(l.qty) || 0, unitPrice: Number(l.unitPrice) || 0 })));
  if ("discount" in b) {
    const d = b.discount;
    const value = Number(d?.value) || 0;
    out.discount = value > 0 ? JSON.stringify({ type: d.type === "pct" ? "pct" : "eur", value: d.type === "pct" ? Math.min(value, 100) : value, label: String(d.label ?? "").trim() || "Remise" }) : "";
  }
  return out;
}
