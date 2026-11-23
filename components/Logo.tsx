export default function Logo() {
  return (
    <div className="logo">
      <span className="play" />
      <span className="pt" />
      {/* Texte dans un seul bloc : « maderino » et « production. » partagent la même ligne de base */}
      <span className="logo-txt">maderino <span className="accent">production.</span></span>
    </div>
  );
}
