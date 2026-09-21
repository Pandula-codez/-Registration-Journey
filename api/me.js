const store = require("../lib/store");
const { verifySession } = require("../lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  // 1. Read the JWT from the httpOnly cookie (sent automatically by the
  //    browser on every request to this origin — the frontend JS never
  //    touches the token directly).
  // 2. Verify its signature + expiry.
  // 3. Cross-check its tokenVersion against the live user record so a
  //    logged-out session is rejected even if the JWT hasn't expired yet.
  const result = verifySession(req, store.findUserById);

  if (!result.ok) {
    return res.status(401).json({ error: "Not authenticated.", reason: result.reason });
  }

  const { user } = result;
  return res.status(200).json({
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    mobile: user.mobile,
    mfaEnabled: user.mfaEnabled,
    mfaMethod: user.mfaMethod,
  });
};
