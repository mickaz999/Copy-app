import { Mail, MessageCircle, Instagram, Globe } from "lucide-react";

// Contacts maderino production (ceux du site maderinoprod.com), proposés quand un lien n'est plus valable
export default function ContactBlock({ text = "Besoin d'un nouveau lien ? Contacte-moi, je te le renvoie rapidement." }: { text?: string }) {
  return (
    <div className="contact-block">
      <p>{text}</p>
      <div className="contact-links">
        <a href="https://wa.me/33767135639" target="_blank" rel="noreferrer" className="primary-link"><MessageCircle size={16} /> WhatsApp</a>
        <a href="mailto:contact@maderinoprod.com"><Mail size={16} /> contact@maderinoprod.com</a>
        <a href="https://www.instagram.com/maderino_prod/" target="_blank" rel="noreferrer"><Instagram size={16} /> @maderino_prod</a>
        <a href="https://maderinoprod.com" target="_blank" rel="noreferrer"><Globe size={16} /> maderinoprod.com</a>
      </div>
    </div>
  );
}
