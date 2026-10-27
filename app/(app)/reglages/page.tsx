"use client";
import { useEffect, useState } from "react";
import { Lock, Radio, Bell, BellOff, CheckCircle2, Mail, Send, Smartphone, Share, SquarePlus } from "lucide-react";
import { api } from "@/lib/api";

type Settings = { pushEnabled: boolean; emailEnabled: boolean; emailTo: string; digestHour: number; eventReminder: number; lateAlert: boolean; liveCalendar: string; liveDays: number; liveCategory: string; blockCalendar: string };
type Info = { settings: Settings; vapidPublicKey: string; pushReady: boolean; cronReady: boolean; mailFrom: string; googleConnected: boolean; devices: number; calendars: { id: string; name: string }[]; writableCalendars: { id: string; name: string }[] };

// Clé VAPID (base64url) vers le format attendu par le navigateur
const urlKey = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

const errorText = (e: unknown) => { const raw = (e as Error).message; try { return JSON.parse(raw).error ?? raw; } catch { return raw; } };

export default function Reglages() {
  const [info, setInfo] = useState<Info | null>(null);
  const [s, setS] = useState<Settings | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [env, setEnv] = useState({ supported: true, ios: false, standalone: true, permission: "default" as NotificationPermission | "unsupported" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState("");

  const load = () => api<Info>("notifications").then((r) => { setInfo(r); setS(r.settings); });

  useEffect(() => {
    load();
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setEnv({ supported, ios, standalone, permission: supported ? Notification.permission : "unsupported" });
    if (supported) navigator.serviceWorker.getRegistration().then((r) => r?.pushManager.getSubscription()).then((sub) => setSubscribed(!!sub));
  }, []);

  async function save(next: Settings) {
    setS(next);
    await api("notifications", "POST", next);
  }

  async function enablePush() {
    if (!info?.vapidPublicKey) return;
    setBusy("push"); setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      setEnv((e) => ({ ...e, permission: perm }));
      if (perm !== "granted") throw new Error("Autorisation refusée. Active les notifications pour maderino dans les réglages de ton téléphone.");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlKey(info.vapidPublicKey) }));
      const device = env.ios ? "iPhone" : /android/i.test(navigator.userAgent) ? "Android" : "Ordinateur";
      await api("notifications/subscribe", "POST", { subscription: sub.toJSON(), device });
      setSubscribed(true);
      setMsg({ ok: true, text: "Notifications activées sur cet appareil." });
      load();
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    } finally { setBusy(""); }
  }

  async function disablePush() {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) { await api("notifications/subscribe", "DELETE", { endpoint: sub.endpoint }); await sub.unsubscribe(); }
    setSubscribed(false);
    setMsg({ ok: true, text: "Notifications désactivées sur cet appareil." });
    load();
  }

  async function test(kind: "push" | "email") {
    setBusy(kind); setMsg(null);
    try {
      const r = await api<{ message: string }>("notifications/test", "POST", { kind });
      setMsg({ ok: true, text: r.message });
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    } finally { setBusy(""); }
  }

  if (!info || !s) return <div className="content muted">Chargement…</div>;
  const needsInstall = env.ios && !env.standalone;

  return (
    <div className="content narrow">
      <div className="eyebrow">notifications</div>
      <h1 className="title">ce qui te <span className="accent">prévient.</span></h1>

      {msg && <div className={`notice ${msg.ok ? "ok" : "err"}`} onClick={() => setMsg(null)}>{msg.text}</div>}

      <section className="settings-card">
        <div className="sc-head"><Smartphone size={18} /> <h3>Notifications sur cet appareil</h3></div>
        {!info.pushReady && <p className="muted">Les notifications ne sont pas encore activées côté serveur : il manque les clés <b>VAPID_PUBLIC_KEY</b> et <b>VAPID_PRIVATE_KEY</b> dans Vercel.</p>}
        {info.pushReady && needsInstall && (
          <div className="install-steps">
            <p>Sur iPhone, les notifications ne marchent que si l&apos;app est sur l&apos;écran d&apos;accueil :</p>
            <ol>
              <li>Ouvre ce site dans <b>Safari</b>.</li>
              <li>Touche <Share size={15} /> <b>Partager</b>, puis <SquarePlus size={15} /> <b>Sur l&apos;écran d&apos;accueil</b>.</li>
              <li>Ouvre l&apos;app depuis la nouvelle icône et reviens ici.</li>
            </ol>
          </div>
        )}
        {info.pushReady && !needsInstall && !env.supported && <p className="muted">Ce navigateur ne gère pas les notifications.</p>}
        {info.pushReady && !needsInstall && env.supported && (
          <div className="row">
            {subscribed
              ? <><span className="ok-pill"><CheckCircle2 size={15} /> Activées sur cet appareil</span><button onClick={disablePush}><BellOff size={16} /> Désactiver</button></>
              : <button className="primary" disabled={busy === "push"} onClick={enablePush}><Bell size={16} /> Activer les notifications</button>}
            <button disabled={busy === "push" || !info.devices} onClick={() => test("push")}><Send size={16} /> Envoyer un essai</button>
          </div>
        )}
        <p className="muted small">{info.devices} appareil{info.devices > 1 ? "s" : ""} abonné{info.devices > 1 ? "s" : ""}.</p>

        <label className="check-line"><input id="n-push" type="checkbox" checked={s.pushEnabled} onChange={(e) => save({ ...s, pushEnabled: e.target.checked })} /> Recevoir les notifications</label>
        <label className="field-line">Rappel avant un RDV
          <select id="n-reminder" value={s.eventReminder} onChange={(e) => save({ ...s, eventReminder: Number(e.target.value) })}>
            {[0, 10, 15, 30, 60, 120].map((m) => <option key={m} value={m}>{m === 0 ? "Pas de rappel" : m < 60 ? `${m} min avant` : `${m / 60} h avant`}</option>)}
          </select>
        </label>
        <label className="check-line"><input id="n-late" type="checkbox" checked={s.lateAlert} onChange={(e) => save({ ...s, lateAlert: e.target.checked })} /> Signaler les tâches en retard dans le récap</label>
      </section>

      <section className="settings-card">
        <div className="sc-head"><Mail size={18} /> <h3>Récap du matin par mail</h3></div>
        {info.mailFrom
          ? <p className="muted">Envoyé depuis <b>{info.mailFrom}</b>.</p>
          : <p className="muted">Pour envoyer les mails depuis ton Gmail, {info.googleConnected ? "reconnecte" : "connecte"} ton compte Google et accepte l&apos;autorisation « envoyer des e-mails ». <a className="link" href="/api/google/connect">{info.googleConnected ? "Reconnecter" : "Connecter"} Google</a></p>}
        <label className="check-line"><input id="n-mail" type="checkbox" checked={s.emailEnabled} onChange={(e) => save({ ...s, emailEnabled: e.target.checked })} /> Recevoir le récap par mail</label>
        <label className="field-line">Adresse
          <input id="n-to" type="email" placeholder="toi@gmail.com" defaultValue={s.emailTo} onBlur={(e) => e.target.value !== s.emailTo && save({ ...s, emailTo: e.target.value })} />
        </label>
        <label className="field-line">Heure du récap (mail + notification)
          <select id="n-hour" value={s.digestHour} onChange={(e) => save({ ...s, digestHour: Number(e.target.value) })}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h} h</option>)}
          </select>
        </label>
        <div className="row"><button disabled={busy === "email" || !info.mailFrom} onClick={() => test("email")}><Send size={16} /> Envoyer un mail d&apos;essai</button></div>
      </section>

      <section className="settings-card">
        <div className="sc-head"><Lock size={18} /> <h3>Bloquer les créneaux des tâches</h3></div>
        <p className="muted">Une tâche avec un horaire bloque ce créneau dans l&apos;agenda Google choisi : il apparaît « occupé » et personne ne peut y prendre de RDV. Le créneau suit la tâche (déplacée, modifiée ou supprimée).</p>
        <label className="field-line">Agenda où bloquer
          <select id="n-blockcal" value={s.blockCalendar || info.writableCalendars.find((c) => /maderino/i.test(c.name))?.id || "none"} onChange={(e) => save({ ...s, blockCalendar: e.target.value })}>
            <option value="none">Ne pas bloquer</option>
            {info.writableCalendars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </section>

      <section className="settings-card">
        <div className="sc-head"><Radio size={18} /> <h3>Surveillance des lives</h3></div>
        <p className="muted">Si un des prochains jours n&apos;a aucun live dans cet agenda, une tâche « Mettre à jour le planning de stream » est créée et tu reçois une notification. Un « Day off » ou « Pas de stream » mis dans cet agenda compte comme un jour prévu.</p>
        <label className="field-line">Agenda des lives
          <select id="n-livecal" value={s.liveCalendar || info.calendars.find((c) => /live|stream/i.test(c.name))?.id || ""} onChange={(e) => save({ ...s, liveCalendar: e.target.value })}>
            <option value="">Aucun</option>
            {info.calendars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="field-line">Jours à couvrir
          <select id="n-livedays" value={s.liveDays} onChange={(e) => save({ ...s, liveDays: Number(e.target.value) })}>
            {[0, 1, 2, 3, 4, 5, 7].map((n) => <option key={n} value={n}>{n === 0 ? "Désactivé" : `${n} prochain${n > 1 ? "s" : ""} jour${n > 1 ? "s" : ""}`}</option>)}
          </select>
        </label>
        <label className="field-line">Catégorie de la tâche
          <select id="n-livecat" value={s.liveCategory} onChange={(e) => save({ ...s, liveCategory: e.target.value })}>
            {["Persos", "Gaming", "Clients", "Admin", "Créa persos"].map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
      </section>

      {!info.cronReady && (
        <section className="settings-card warn">
          <p>Les envois automatiques ne sont pas encore programmés : il manque <b>CRON_SECRET</b> dans Vercel.</p>
        </section>
      )}
    </div>
  );
}
