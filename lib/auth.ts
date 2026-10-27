import { SignJWT, jwtVerify } from "jose";

export const COOKIE = "session";
const key = () => new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret");

export async function createToken() {
  return new SignJWT({ ok: true })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("30d")
    .sign(key());
}

export async function verifyToken(token?: string) {
  if (!token) return false;
  try {
    await jwtVerify(token, key());
    return true;
  } catch {
    return false;
  }
}
