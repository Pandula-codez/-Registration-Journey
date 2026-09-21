const store = require("../lib/store");
const { generateOtp } = require("../lib/auth");

const OTP_TTL_MS = 3 * 60 * 1000;
const VALID_PURPOSES = ["email", "mobile", "mfa-sms", "mfa-email", "login-email", "login-sms"];

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { userId, purpose } = req.body || {};
  if (!userId || !VALID_PURPOSES.includes(purpose)) {
    return res.status(400).json({ error: "Invalid request." });
  }

  const user = store.findUserById(userId);
  if (!user) return res.status(404).json({ error: "User not found." });

  const code = generateOtp();
  const record = store.setOtp(user.id, purpose, { code, ttlMs: OTP_TTL_MS });

  const destination = purpose.includes("sms") || purpose === "mobile" ? user.mobile : user.email;
  console.log(`[DEV] OTP (${purpose}) for ${destination}: ${code}`);

  return res.status(200).json({
    ok: true,
    purpose,
    expiresInSeconds: Math.round((record.expiresAt - Date.now()) / 1000),
    devOtp: code, // demo only — see note in api/register.js
  });
};
