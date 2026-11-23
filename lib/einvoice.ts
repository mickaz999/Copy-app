// Facturation électronique : facultative par facture jusqu'à la date d'obligation d'émission
// (PME et micro-entreprises : 1er septembre 2027), puis automatique pour les clients entreprises.
export const EINVOICE_MANDATORY = "2027-09-01";
export const einvoiceMandatory = (date: string | Date) => (typeof date === "string" ? date.slice(0, 10) : date.toISOString().slice(0, 10)) >= EINVOICE_MANDATORY;
