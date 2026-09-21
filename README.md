# SecureID — Registration & Login Journey

A working implementation of the Registration and Login journeys from the assignment
mockups, with a real backend behind the UI (JWT sessions, OTP flows, and genuine
TOTP-based authenticator MFA) — not just a front-end mock.

## Run it locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000 (login) or http://localhost:3000/register.html.

There's no email/SMS provider wired up (no API keys needed to run this), so OTP
codes are shown directly on screen in a "Demo mode — your code is ######" banner,
and also logged to the server console. This is called out in the code with
`DEMO ONLY` comments everywhere it applies — swap that for a real provider
(SES/SendGrid, Twilio, etc.) for production use.

## Deploying to Vercel

1. Push this folder to a GitHub repo.
2. Import the repo in Vercel (vercel.com → Add New → Project).
3. No build step or environment variables are required to demo it, though you
   should set a real `JWT_SECRET` env var for anything beyond a demo.
4. Vercel auto-detects the `/api/*.js` files as serverless functions and
   serves everything else (`index.html`, `register.html`, `css/`, `js/`)
   as static files — no `vercel.json` needed.

## Project structure

```
api/            One file per endpoint (Vercel serverless functions)
lib/auth.js     JWT/session issuing+verification, password hashing/strength, OTP generation
lib/store.js    In-memory "database" (users, OTPs, MFA secrets)
index.html      Login journey (all 6 states from the mockup)
register.html   Registration journey (all 7 steps from the mockup)
dashboard.html  Minimal protected page — demonstrates GET /api/me + logout
css/styles.css  Shared styling matching the SecureID mockups
js/             Front-end logic per page + shared helpers (js/common.js)
server.js       Local-only dev server (mounts the same /api handlers via Express)
```

## The IAM concepts this demonstrates (for the Part 2 video)

**Session lifecycle (login → /api/me → logout):**
1. `POST /api/login` checks the password (bcrypt-hashed, never stored in plaintext).
   If the account has MFA enabled, **no session is issued yet** — the response
   only says `mfaRequired: true`. This is the key IAM point: authentication
   (proving who you are) and session issuance (being trusted to act) are two
   separate steps, and MFA sits *between* them.
2. `POST /api/login-verify` checks the second factor (TOTP code from an
   authenticator app, or an emailed/texted OTP). Only on success does it call
   `issueSession()`.
3. `issueSession()` signs a short-lived (15 min) JWT containing the user id
   and a `tokenVersion`, and sets it as an **httpOnly, SameSite=Lax** cookie —
   never exposed to client-side JS, which limits damage from XSS.
4. `GET /api/me` is the protected route: it reads the cookie, verifies the
   JWT signature/expiry, and — importantly — cross-checks the token's
   `tokenVersion` against the live user record.
5. `POST /api/logout` **increments `tokenVersion`** on the user and clears
   the cookie. Because `/api/me` checks `tokenVersion`, this instantly
   invalidates the session server-side, even though the JWT itself hasn't
   technically expired yet. Without this, "logout" would just be the browser
   forgetting a cookie — the old token would still work if someone had a
   copy of it.

**MFA (Authenticator App option):**
- Uses `otpauth` to generate a real RFC 6238 TOTP secret and a scannable QR
  code (via `qrcode`) — this is the same standard Google Authenticator, Authy,
  and 1Password all implement, so you can actually scan it and generate valid
  6-digit codes with a real app.
- `window: 1` tolerance in verification accounts for minor clock drift
  between server and phone, same as production integrations do.

**OTP flows (email/mobile verification, SMS/Email MFA):**
- Codes expire after a fixed TTL, are single-use (deleted after a correct
  verify), and lock out after a max-attempts count — mirroring the
  "Code expired" / "Maximum attempts reached" states in the mockup.
- The login endpoint returns a **generic** "Invalid email or password" error
  regardless of whether the email exists or the password was wrong — this
  prevents account enumeration.

## Known limitations (worth mentioning if asked)

- **In-memory data store.** There's no real database, so data resets if the
  server restarts. On Vercel this also means state isn't guaranteed to
  survive between "cold" serverless invocations — fine for a live demo /
  video walkthrough, but a real deployment needs Postgres/Mongo/etc.
- **No real email/SMS sending.** OTPs are echoed back in the API response
  and printed to the server console instead of actually being emailed/texted.
- **"Continue with Google" is decorative** — there's no real OAuth flow
  wired up, since that requires registering an app with Google.
