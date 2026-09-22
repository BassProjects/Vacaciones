import crypto from "crypto";
import runtimeConfig from "./runtimeConfig.cjs";

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export const SESSION_COOKIE_NAME = "vac_session";
export const SESSION_MAX_AGE_SECONDS = SESSION_DURATION_MS / 1000;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

export function verifyPassword(password, salt, hash) {
  const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(candidate, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function sign(payload) {
  return crypto.createHmac("sha256", runtimeConfig.sessionSecret()).update(payload).digest("hex");
}

export function createSessionToken(userId) {
  const expires = Date.now() + SESSION_DURATION_MS;
  const payload = `${userId}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token) {
  if (typeof token !== "string" || token.length > 512) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expires, sig] = parts;
  if (!userId || !/^\d+$/.test(expires) || !Number.isSafeInteger(Number(expires)) ||
      Number(expires) <= Date.now() || !/^[a-f0-9]{64}$/.test(sig)) return null;
  const payload = `${userId}.${expires}`;
  const expectedSig = sign(payload);
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expectedSig, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (Date.now() > Number(expires)) return null;
  return userId;
}
