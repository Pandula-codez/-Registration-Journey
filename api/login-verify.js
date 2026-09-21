const { TOTP, Secret } = require("otpauth");
const store = require("../lib/store");
const { issueSession } = require("../lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { userId, method, code } = req.body || {};
  const user = store.findUserById(userId);
  if (!user) return res.status(404).json({ error: "User not found." });

  if (method === "authenticator") {
    const entry = store.mfaSecrets.get(userId);
    if (!entry) return res.status(400).json({ error: "Authenticator is not set up for this account." });

    const totp = new TOTP({
      issuer: "SecureID",
      label: user.email,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(entry.base32Secret),
    });

    const delta = totp.validate({ token: String(code), window: 1 });
    if (delta === null) {
      return res.status(400).json({ error: "Invalid code. Please try again.", code: "WRONG_CODE" });
    }

    issueSession(res, user);
    return res.status(200).json({ ok: true, sessionIssued: true });
  }

  if (method === "email" || method === "sms") {
    const purpose = method === "email" ? "login-email" : "login-sms";
    const record = store.getOtp(userId, purpose);

    if (!record) return res.status(400).json({ error: "No active code. Please request a new one.", code: "NO_CODE" });
    if (Date.now() > record.expiresAt) {
      store.clearOtp(userId, purpose);
      return res.status(400).json({ error: "This code has expired.", code: "EXPIRED" });
    }
    if (record.attempts >= record.maxAttempts) {
      store.clearOtp(userId, purpose);
      return res.status(429).json({ error: "Maximum attempts reached. Please request a new code.", code: "MAX_ATTEMPTS" });
    }
    if (record.code !== String(code)) {
      record.attempts += 1;
      const attemptsLeft = record.maxAttempts - record.attempts;
      if (attemptsLeft <= 0) {
        store.clearOtp(userId, purpose);
        return res.status(429).json({ error: "Maximum attempts reached. Please request a new code.", code: "MAX_ATTEMPTS" });
      }
      return res.status(400).json({ error: "Incorrect code. Please try again.", code: "WRONG_CODE", attemptsLeft });
    }

    store.clearOtp(userId, purpose);
    issueSession(res, user);
    return res.status(200).json({ ok: true, sessionIssued: true });
  }

  return res.status(400).json({ error: "Unsupported method." });
};
