const QRCode = require("qrcode");
const { TOTP, Secret } = require("otpauth");
const store = require("../lib/store");
const { generateOtp } = require("../lib/auth");

const OTP_TTL_MS = 3 * 60 * 1000;
const ISSUER = "SecureID";

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { userId, method } = req.body || {};
  const user = store.findUserById(userId);
  if (!user) return res.status(404).json({ error: "User not found." });

  if (method === "authenticator") {
    // Generate a fresh TOTP secret (RFC 6238 — same standard Google
    // Authenticator / Authy / 1Password use).
    const secret = new Secret({ size: 20 });
    const totp = new TOTP({
      issuer: ISSUER,
      label: user.email,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret,
    });

    store.mfaSecrets.set(user.id, { base32Secret: secret.base32, verified: false });

    const otpauthUrl = totp.toString(); // otpauth://totp/SecureID:user@email?secret=...
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);

    return res.status(200).json({
      method: "authenticator",
      qrDataUrl,
      manualEntryKey: secret.base32, // "Can't scan? Enter setup key" fallback
      otpauthUrl,
    });
  }

  if (method === "sms" || method === "email") {
    const purpose = method === "sms" ? "mfa-sms" : "mfa-email";
    const code = generateOtp();
    const record = store.setOtp(user.id, purpose, { code, ttlMs: OTP_TTL_MS });
    const destination = method === "sms" ? user.mobile : user.email;
    console.log(`[DEV] MFA setup OTP (${method}) for ${destination}: ${code}`);

    return res.status(200).json({
      method,
      expiresInSeconds: Math.round((record.expiresAt - Date.now()) / 1000),
      devOtp: code, // demo only
    });
  }

  return res.status(400).json({ error: "Unsupported MFA method." });
};
