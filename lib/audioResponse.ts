// Réponse audio compatible iPhone : Safari exige la lecture par morceaux (en-tête Range → 206)
export function audioResponse(req: Request, data: Uint8Array, mime: string) {
  const size = data.length;
  const base = { "Content-Type": mime, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=86400" };
  const m = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  if (!m) return new Response(data as unknown as BodyInit, { headers: { ...base, "Content-Length": String(size) } });
  let start = m[1] ? Number(m[1]) : size - Number(m[2] || 0);
  let end = m[1] && m[2] ? Number(m[2]) : size - 1;
  if (!m[1] && !m[2]) { start = 0; end = size - 1; }
  if (start >= size || start > end) return new Response(null, { status: 416, headers: { ...base, "Content-Range": `bytes */${size}` } });
  end = Math.min(end, size - 1);
  return new Response(data.slice(start, end + 1) as unknown as BodyInit, { status: 206, headers: { ...base, "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${size}` } });
}
