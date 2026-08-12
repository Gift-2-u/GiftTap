/**
 * HMAC-SHA256 session JWT for Gift Tap custom auth.
 * Secret: SESSION_JWT_SECRET (Supabase Edge secrets only — never Vite).
 */

const enc = new TextEncoder();

function b64url(data: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof data === "string") {
    bytes = enc.encode(data);
  } else if (data instanceof Uint8Array) {
    bytes = data;
  } else {
    bytes = new Uint8Array(data);
  }
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlJson(obj: unknown): string {
  return b64url(JSON.stringify(obj));
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export type SessionClaims = {
  sub: string;
  username: string;
  iat: number;
  exp: number;
};

export function getSessionSecret(): string {
  const s = Deno.env.get("SESSION_JWT_SECRET") || Deno.env.get("JWT_SECRET") || "";
  if (!s || s.length < 16) {
    throw new Error(
      "SESSION_JWT_SECRET missing or too short (set in Supabase Edge Function secrets, min 16 chars).",
    );
  }
  return s;
}

/** Default session lifetime: 90 days — players close/reopen, not re-login daily */
export const DEFAULT_TTL_SEC = 60 * 60 * 24 * 90;

/**
 * After exp, still allow silent refresh for this long so a player who
 * opens the game after a long break gets a new JWT without typing a password.
 */
export const REFRESH_GRACE_SEC = 60 * 60 * 24 * 30; // 30 days after exp

export async function mintSessionJwt(
  playerId: string,
  username: string,
  ttlSec: number = DEFAULT_TTL_SEC,
): Promise<{ token: string; expires_at: string; exp: number }> {
  const secret = getSessionSecret();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + Math.max(60, ttlSec);
  const header = { alg: "HS256", typ: "JWT" };
  const payload: SessionClaims = {
    sub: String(playerId),
    username: String(username || ""),
    iat: now,
    exp,
  };
  const body = `${b64urlJson(header)}.${b64urlJson(payload)}`;
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  const token = `${body}.${b64url(sig)}`;
  return {
    token,
    expires_at: new Date(exp * 1000).toISOString(),
    exp,
  };
}

async function parseAndVerifySignature(token: string): Promise<SessionClaims> {
  const secret = getSessionSecret();
  const parts = String(token || "").trim().split(".");
  if (parts.length !== 3) throw new Error("Invalid session token");
  const [h, p, s] = parts;
  const body = `${h}.${p}`;
  const key = await importHmacKey(secret);
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const sig = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) sig[i] = bin.charCodeAt(i);
  const ok = await crypto.subtle.verify("HMAC", key, sig, enc.encode(body));
  if (!ok) throw new Error("Invalid session signature");

  const padP = p.length % 4 === 0 ? "" : "=".repeat(4 - (p.length % 4));
  const payloadJson = atob(p.replace(/-/g, "+").replace(/_/g, "/") + padP);
  const claims = JSON.parse(payloadJson) as SessionClaims;
  if (!claims?.sub) throw new Error("Session missing subject");
  return claims;
}

export async function verifySessionJwt(token: string): Promise<SessionClaims> {
  const claims = await parseAndVerifySignature(token);
  const now = Math.floor(Date.now() / 1000);
  if (claims.exp && now >= claims.exp) {
    throw new Error("Session expired — log in again");
  }
  return claims;
}

/**
 * Accept valid JWTs, or expired ones still inside the silent-refresh grace window.
 * Used only by auth-refresh so close/reopen never forces a password.
 */
export async function verifySessionJwtForRefresh(
  token: string,
  graceSec: number = REFRESH_GRACE_SEC,
): Promise<SessionClaims> {
  const claims = await parseAndVerifySignature(token);
  const now = Math.floor(Date.now() / 1000);
  if (claims.exp && now >= claims.exp + Math.max(0, graceSec)) {
    throw new Error("Session fully expired — log in once to continue");
  }
  return claims;
}

/** Extract Bearer token from Request */
export function bearerFromRequest(req: Request): string | null {
  const h = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}

export async function requirePlayerFromRequest(req: Request): Promise<SessionClaims> {
  const token = bearerFromRequest(req);
  if (!token) throw new Error("Not authenticated (missing Bearer token)");
  return verifySessionJwt(token);
}
