import Logo from "@/components/Logo";
import ContactBlock from "@/components/ContactBlock";

// Ancien lien (sans le nom) : désactivé, un nouveau lien a été envoyé
export default function DeadLink() {
  return (
    <div className="rdv liv-dark-solo"><div className="rdv-card">
      <a className="logo-link" href="https://maderinoprod.com" target="_blank" rel="noreferrer" aria-label="maderinoprod.com"><Logo /></a>
      <p className="neg">Ce lien n&apos;est plus valide. Demande-moi le nouveau lien.</p>
      <ContactBlock />
    </div></div>
  );
}
