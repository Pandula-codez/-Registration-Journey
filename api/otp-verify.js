const store = require("../lib/store");
const { issueSession } = require("../lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { userId, purpose, code } = req.body || {};
  if (!userId || !purpose || !code) {
    return res.status(400).json({ error: "Invalid request." });
  }

  const user = store.findUserById(userId);
  if (!user) return res.status(404).json({ error: "User not found." });

  const record = store.getOtp(userId, purpose);
  if (!record) {
    return res.status(400).json({ error: "No active code. Please request a new one.", code: "NO_CODE" });
  }

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
    return res.status(400).json({
      error: "Incorrect code. Please try again.",
      code: "WRONG_CODE",
      attemptsLeft,
    });
  }

  // Correct code — consume it (OTPs are single-use).
  store.clearOtp(userId, purpose);

  switch (purpose) {
    case "email":
      user.emailVerified = true;
      return res.status(200).json({ ok: true, nextStep: "verify-mobile" });

    case "mobile":
      user.mobileVerified = true;
      return res.status(200).json({ ok: true, nextStep: "setup-mfa" });

    case "mfa-sms":
    case "mfa-email":
      user.mfaEnabled = true;
      user.mfaMethod = purpose;
      return res.status(200).json({ ok: true, nextStep: "complete" });

    case "login-email":
    case "login-sms": {
      // MFA step of login succeeded -> now actually establish the session.
      issueSession(res, user);
      return res.status(200).json({ ok: true, sessionIssued: true });
    }

    default:
      return res.status(400).json({ error: "Unknown verification purpose." });
  }
};
