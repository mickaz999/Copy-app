"use client";

// Copie dans le presse-papiers, avec repli pour les navigateurs mobiles (iOS, onglets non sécurisés, webviews)
export async function copyText(text: string) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;font-size:16px";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    ta.remove();
    if (ok) return true;
  } catch {}
  // Dernier recours : feuille de partage du téléphone
  try { if (navigator.share) { await navigator.share({ url: text }); return true; } } catch {}
  return false;
}
