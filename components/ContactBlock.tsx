import { Mail, MessageCircle } from "lucide-react";

// Contacts maderino production, proposés quand un lien n'est plus valable : boutons WhatsApp et mail (texte explicite)
export default function ContactBlock({ text = "Besoin d'un nouveau lien ? Contacte-moi, je te le renvoie rapidement." }: { text?: string }) {
  return (
    <div className="contact-block">
      <p>{text}</p>
      <div className="contact-icons">
        <a href="https://wa.me/33767135639" target="_blank" rel="noreferrer" className="wa"><MessageCircle size={18} /> M&apos;écrire sur WhatsApp</a>
        <a href="mailto:contact@maderinoprod.com"><Mail size={18} /> M&apos;envoyer un mail</a>
      </div>
    </div>
  );
}
