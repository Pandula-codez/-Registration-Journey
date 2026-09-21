const store = require("../lib/store");
const { comparePassword, issueSession } = require("../lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { identifier, password } = req.body || {};
  if (!identifier || !password) {
    return res.status(400).json({ error: "Invalid email or password." });
  }

  const user = store.findUserByEmail(identifier);

  // Deliberately generic error — never reveal whether the email exists.
  const genericError = () => res.status(401).json({ error: "Invalid email or password." });

  if (!user) return genericError();

  const passwordOk = await comparePassword(password, user.passwordHash);
  if (!passwordOk) return genericError();

  if (!user.mfaEnabled) {
    // No MFA on this account — establish the session immediately.
    issueSession(res, user);
    return res.status(200).json({ ok: true, mfaRequired: false, sessionIssued: true });
  }

  // Credentials are correct, but the session is NOT issued yet — the user
  // is only "half-authenticated" until they clear the second factor. This
  // is the core of the IAM two-step: authentication (password) is
  // separate from the trust decision that actually creates a session.
  return res.status(200).json({
    ok: true,
    mfaRequired: true,
    userId: user.id,
    method: user.mfaMethod, // the single method this account is enrolled with
  });
};
