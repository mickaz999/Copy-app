import { Mail, MessageCircle } from "lucide-react";

// Contacts maderino production, proposés quand un lien n'est plus valable : icônes WhatsApp et mail
export default function ContactBlock({ text = "Besoin d'un nouveau lien ? Contacte-moi, je te le renvoie rapidement." }: { text?: string }) {
  return (
    <div className="contact-block">
      <p>{text}</p>
      <div className="contact-icons">
        <a href="https://wa.me/33767135639" target="_blank" rel="noreferrer" aria-label="WhatsApp" title="WhatsApp" className="wa"><MessageCircle size={24} /></a>
        <a href="mailto:contact@maderinoprod.com" aria-label="E-mail" title="contact@maderinoprod.com"><Mail size={24} /></a>
      </div>
    </div>
  );
}
