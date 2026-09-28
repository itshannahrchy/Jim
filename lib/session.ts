// Signed "remember this device" cookie. Uses Web Crypto so it works both in
// middleware (edge runtime) and in API routes (Node runtime).

export const SESSION_COOKIE = "jim_session";
export const SESSION_MAX_AGE_S = 365 * 24 * 60 * 60; // about a year

const encoder = new TextEncoder();

function signingSecret(): string {
  const s = process.env.SESSION_SECRET || process.env.APP_PASSCODE;
  if (!s) throw new Error("APP_PASSCODE is not set");
  // Mixing in the passcode means changing the passcode logs out every device.
  return `jim-session-v1|${s}|${process.env.APP_PASSCODE ?? ""}`;
}

function toBase64Url(buf: ArrayBuffer): string {
  let bin = "";
  for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toBase64Url(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(): Promise<string> {
  const issued = Date.now().toString();
  return `${issued}.${await hmac(issued)}`;
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const [issued, sig] = token.split(".");
  if (!issued || !sig || !/^\d+$/.test(issued)) return false;
  const age = Date.now() - Number(issued);
  if (age < -60_000 || age > SESSION_MAX_AGE_S * 1000) return false;
  try {
    return safeEqual(sig, await hmac(issued));
  } catch {
    return false;
  }
}
