const { TOTP, Secret } = require("otpauth");
const store = require("../lib/store");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { userId, code } = req.body || {};
  const user = store.findUserById(userId);
  if (!user) return res.status(404).json({ error: "User not found." });

  const entry = store.mfaSecrets.get(userId);
  if (!entry) {
    return res.status(400).json({ error: "No MFA setup in progress. Start setup again.", code: "NO_SETUP" });
  }

  const totp = new TOTP({
    issuer: "SecureID",
    label: user.email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(entry.base32Secret),
  });

  // `window: 1` tolerates minor clock drift (checks the previous/next
  // 30s step too), same as real authenticator-app integrations do.
  const delta = totp.validate({ token: String(code), window: 1 });

  if (delta === null) {
    return res.status(400).json({ error: "Invalid code. Please try again.", code: "WRONG_CODE" });
  }

  entry.verified = true;
  user.mfaEnabled = true;
  user.mfaMethod = "authenticator";

  return res.status(200).json({ ok: true, nextStep: "complete" });
};
