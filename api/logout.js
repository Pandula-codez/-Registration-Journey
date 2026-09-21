const store = require("../lib/store");
const { verifySession, clearSession } = require("../lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const result = verifySession(req, store.findUserById);
  if (result.ok) {
    // Bump tokenVersion so this (and any other still-live) JWT for this
    // user is rejected by /api/me from now on, even before it naturally
    // expires. This is what makes logout a real invalidation rather than
    // just "the browser forgets the cookie".
    result.user.tokenVersion += 1;
  }

  // Clear the cookie client-side regardless, so the browser stops sending it.
  clearSession(res);
  return res.status(200).json({ ok: true });
};
