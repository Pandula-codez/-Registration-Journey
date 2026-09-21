const jwt = require("jsonwebtoken");
const cookie = require("cookie");
const bcrypt = require("bcryptjs");

// In a real deployment this MUST come from an environment variable
// (Vercel > Project Settings > Environment Variables). We fall back to a
// dev-only value so the app still runs locally out of the box.
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-secret-change-me";
const ACCESS_TOKEN_TTL = "15m"; // short-lived access token, IAM best practice
const COOKIE_NAME = "sid";

/* ---------------------------- Passwords --------------------------------- */

async function hashPassword(plain) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plain, salt);
}

function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// Mirrors the checklist shown in the Registration UI:
// at least 8 chars, 1 uppercase, 1 number, 1 special character.
function evaluatePasswordStrength(password = "") {
  const checks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
  const score = Object.values(checks).filter(Boolean).length;

  let label = "Weak";
  if (score === 4) label = "Strong";
  else if (score >= 2) label = "Medium";

  return {
    checks,
    score, // 0-4
    label, // Weak | Medium | Strong
    valid: score === 4, // registration is blocked unless every rule passes
  };
}

/* ------------------------------- OTP ------------------------------------- */

function generateOtp(digits = 6) {
  const min = 10 ** (digits - 1);
  const max = 10 ** digits - 1;
  return String(Math.floor(min + Math.random() * (max - min + 1)));
}

/* --------------------------- JWT / Session -------------------------------- */

/**
 * Issues a short-lived JWT "access token" carrying the user id and a
 * tokenVersion. tokenVersion is how we invalidate sessions on logout without
 * needing a server-side token blacklist: every JWT is checked against the
 * user's CURRENT tokenVersion, and logout simply bumps that number, so any
 * previously issued token instantly fails verification even though the JWT
 * itself is technically still cryptographically valid until it expires.
 */
function issueSession(res, user) {
  const token = jwt.sign(
    { sub: user.id, tv: user.tokenVersion },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL }
  );

  const serialized = cookie.serialize(COOKIE_NAME, token, {
    httpOnly: true, // not readable by client-side JS -> mitigates XSS token theft
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // CSRF mitigation
    path: "/",
    maxAge: 15 * 60, // seconds, matches JWT expiry
  });
  res.setHeader("Set-Cookie", serialized);
  return token;
}

function clearSession(res) {
  const serialized = cookie.serialize(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  res.setHeader("Set-Cookie", serialized);
}

function readSessionToken(req) {
  const header = req.headers.cookie;
  if (!header) return null;
  const parsed = cookie.parse(header);
  return parsed[COOKIE_NAME] || null;
}

/**
 * Verifies the JWT signature/expiry AND checks tokenVersion against the
 * live user record, so a logged-out (or password-changed) token is
 * rejected immediately rather than staying valid until its natural
 * expiry.
 */
function verifySession(req, findUserById) {
  const token = readSessionToken(req);
  if (!token) return { ok: false, reason: "no_token" };

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return { ok: false, reason: "invalid_or_expired" };
  }

  const user = findUserById(payload.sub);
  if (!user) return { ok: false, reason: "user_not_found" };
  if (user.tokenVersion !== payload.tv) {
    return { ok: false, reason: "session_invalidated" };
  }

  return { ok: true, user };
}

module.exports = {
  hashPassword,
  comparePassword,
  evaluatePasswordStrength,
  generateOtp,
  issueSession,
  clearSession,
  verifySession,
  readSessionToken,
};
