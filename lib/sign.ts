import { createHmac, timingSafeEqual } from "crypto";

// Signature d'un élément Frame.io montré au client d'une livraison : seuls les éléments signés peuvent être ouverts
const key = () => process.env.AUTH_SECRET || "dev-secret";
export const signItem = (token: string, id: string) => createHmac("sha256", key()).update(`${token}:${id}`).digest("base64url").slice(0, 22);
export function checkItem(token: string, id: string, sig: string) {
  const a = Buffer.from(signItem(token, id)), b = Buffer.from(sig || "");
  return a.length === b.length && timingSafeEqual(a, b);
}
