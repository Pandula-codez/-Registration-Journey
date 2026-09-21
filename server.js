// Local development server. On Vercel, everything in /api is auto-deployed
// as serverless functions and the root files are served statically — this
// file is NOT used in production, it just lets you run the exact same
// handlers locally with `npm run dev`.
const express = require("express");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

function mount(routePath, filePath) {
  const handler = require(filePath);
  app.all(routePath, (req, res) => handler(req, res));
}

mount("/api/register", "./api/register");
mount("/api/login", "./api/login");
mount("/api/login-verify", "./api/login-verify");
mount("/api/logout", "./api/logout");
mount("/api/me", "./api/me");
mount("/api/otp-send", "./api/otp-send");
mount("/api/otp-verify", "./api/otp-verify");
mount("/api/mfa-setup", "./api/mfa-setup");
mount("/api/mfa-verify", "./api/mfa-verify");

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SecureID demo running at http://localhost:${PORT}`);
});
