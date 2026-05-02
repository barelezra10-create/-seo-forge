import { SignJWT, jwtVerify } from "jose";

const SESSION_COOKIE = "seo-forge-session";
const SESSION_TTL_DAYS = 30;

function getSecret(): Uint8Array {
  const secret = process.env.DASHBOARD_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("DASHBOARD_SESSION_SECRET must be set (>=32 chars)");
  }
  return new TextEncoder().encode(secret);
}

export async function issueSession(): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_DAYS * 24 * 60 * 60;
  return await new SignJWT({ sub: "bar" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, getSecret());
    return true;
  } catch {
    return false;
  }
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
