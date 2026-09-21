const store = require("../lib/store");
const { hashPassword, evaluatePasswordStrength, generateOtp } = require("../lib/auth");

const OTP_TTL_MS = 3 * 60 * 1000; // 3 minutes, matches "Code expires in 02:45" style UI

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { fullName, email, mobile, password } = req.body || {};

  if (!fullName || !email || !mobile || !password) {
    return res.status(400).json({ error: "All fields are required." });
  }

  if (store.findUserByEmail(email)) {
    return res.status(409).json({ error: "An account with this email already exists." });
  }

  // Server-side password policy enforcement — never trust the client alone.
  const strength = evaluatePasswordStrength(password);
  if (!strength.valid) {
    return res.status(400).json({
      error: "Password does not meet the minimum strength requirement.",
      strength,
    });
  }

  const passwordHash = await hashPassword(password);
  const user = store.createUser({ fullName, email, mobile, passwordHash });

  const code = generateOtp();
  store.setOtp(user.id, "email", { code, ttlMs: OTP_TTL_MS });

  // DEMO ONLY: no real email provider is configured for this assignment, so
  // we echo the OTP back in the response (and log it) instead of sending a
  // real email. In production this line would be replaced by a call to an
  // email provider (SES/SendGrid/etc.) and `devOtp` would be removed.
  console.log(`[DEV] Email OTP for ${user.email}: ${code}`);

  return res.status(201).json({
    userId: user.id,
    fullName: user.fullName,
    email: user.email,
    mobile: user.mobile,
    nextStep: "verify-email",
    devOtp: code,
  });
};
