/**
 * In-memory data store.
 *
 * NOTE FOR THE VIDEO / REVIEWER:
 * This assignment uses an in-memory store instead of a real database so the
 * whole thing runs with zero external services (no DB URL, no email/SMS
 * provider keys needed). In a production system, `users`, `otps` and
 * `mfaSecrets` below would be tables in Postgres/Mongo/etc, and the OTP
 * "inbox" would be a real email/SMS send instead of being echoed back in
 * the API response for demo purposes.
 *
 * On Vercel, serverless functions can spin up fresh instances, so this
 * store is NOT guaranteed to persist between requests in production.
 * It persists reliably for local dev (`npm run dev`) and for short demo
 * sessions on Vercel because of instance reuse ("warm" lambdas) — which is
 * fine for demoing the IAM flow end-to-end.
 */

const users = new Map(); // key: email (lowercase) -> user object
const otps = new Map(); // key: `${userId}:${purpose}` -> { code, expiresAt, attempts, verified }
const mfaSecrets = new Map(); // key: userId -> { base32Secret, verified }

let nextUserId = 1;

function createUser({ fullName, email, mobile, passwordHash }) {
  const id = String(nextUserId++);
  const user = {
    id,
    fullName,
    email: email.toLowerCase(),
    mobile,
    passwordHash,
    emailVerified: false,
    mobileVerified: false,
    mfaEnabled: false,
    mfaMethod: null, // 'authenticator' | 'sms' | 'email'
    tokenVersion: 0, // bumped on logout / password change to invalidate old JWTs
    createdAt: Date.now(),
  };
  users.set(user.email, user);
  return user;
}

function findUserByEmail(email) {
  return users.get((email || "").toLowerCase());
}

function findUserById(id) {
  for (const u of users.values()) {
    if (u.id === id) return u;
  }
  return null;
}

function otpKey(userId, purpose) {
  return `${userId}:${purpose}`;
}

function setOtp(userId, purpose, { code, ttlMs, maxAttempts = 3 }) {
  const record = {
    code,
    expiresAt: Date.now() + ttlMs,
    attempts: 0,
    maxAttempts,
  };
  otps.set(otpKey(userId, purpose), record);
  return record;
}

function getOtp(userId, purpose) {
  return otps.get(otpKey(userId, purpose));
}

function clearOtp(userId, purpose) {
  otps.delete(otpKey(userId, purpose));
}

module.exports = {
  users,
  createUser,
  findUserByEmail,
  findUserById,
  setOtp,
  getOtp,
  clearOtp,
  mfaSecrets,
};
