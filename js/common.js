// ---------------------------------------------------------------------------
// Small fetch wrapper. `credentials: "include"` ensures the httpOnly session
// cookie set by /api/login-verify (or /api/login) is sent on later requests
// like /api/me and /api/logout.
// ---------------------------------------------------------------------------
async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Request failed");
    err.data = data;
    err.status = res.status;
    throw err;
  }
  return data;
}

// ---------------------------------------------------------------------------
// Wires up a row of single-digit OTP <input> boxes: auto-advance on type,
// backspace to go back, and paste-to-fill.
// ---------------------------------------------------------------------------
function wireOtpInputs(container, onComplete) {
  const inputs = Array.from(container.querySelectorAll("input"));
  inputs.forEach((input, i) => {
    input.addEventListener("input", () => {
      input.value = input.value.replace(/[^0-9]/g, "").slice(0, 1);
      if (input.value && i < inputs.length - 1) inputs[i + 1].focus();
      maybeComplete();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !input.value && i > 0) inputs[i - 1].focus();
    });
    input.addEventListener("paste", (e) => {
      e.preventDefault();
      const digits = (e.clipboardData.getData("text") || "").replace(/[^0-9]/g, "").split("");
      inputs.forEach((inp, idx) => (inp.value = digits[idx] || ""));
      (inputs[Math.min(digits.length, inputs.length) - 1] || inputs[0]).focus();
      maybeComplete();
    });
  });

  function maybeComplete() {
    const code = inputs.map((i) => i.value).join("");
    if (code.length === inputs.length && !inputs.some((i) => !i.value)) {
      onComplete(code);
    }
  }

  return {
    clear() { inputs.forEach((i) => (i.value = "")); inputs[0].focus(); },
    setError(hasError) { container.classList.toggle("error", hasError); },
    focus() { inputs[0].focus(); },
  };
}

// ---------------------------------------------------------------------------
// Countdown timer used for both "code expires in mm:ss" and the
// "resend code (00:ss)" cooldown.
// ---------------------------------------------------------------------------
function startCountdown(seconds, { onTick, onDone }) {
  let remaining = seconds;
  onTick(remaining);
  const id = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(id);
      onTick(0);
      onDone && onDone();
      return;
    }
    onTick(remaining);
  }, 1000);
  return () => clearInterval(id);
}

function formatMMSS(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Inline icons (no external icon font / image requests needed).
// ---------------------------------------------------------------------------
const ICONS = {
  shield: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z"/></svg>`,
  shieldAlert: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z"/><line x1="12" y1="8" x2="12" y2="13"/><circle cx="12" cy="16" r="0.5" fill="currentColor"/></svg>`,
  mail: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>`,
  phone: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.24 11 11 0 0 0 3.4.55 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11 11 0 0 0 .55 3.4 1 1 0 0 1-.25 1z"/></svg>`,
  check: `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M8 12.5l2.5 2.5L16 9.5"/></svg>`,
  checkSmall: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>`,
  eye: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>`,
  eyeOff: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C5 20 1 12 1 12a19 19 0 0 1 4.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a19 19 0 0 1-2.44 3.34M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
  user: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>`,
  lock: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>`,
  google: `<svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.5 12.3c0-.85-.07-1.47-.22-2.12H12v3.85h6.5c-.13 1.07-.85 2.68-2.45 3.76l-.02.15 3.56 2.76.25.02c2.27-2.09 3.58-5.17 3.58-8.42"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.93-2.9l-3.78-2.93c-1.02.7-2.4 1.2-4.15 1.2-3.18 0-5.88-2.1-6.84-5.02l-.14.01-3.7 2.87-.05.14C3.26 21.3 7.3 24 12 24"/><path fill="#FBBC05" d="M5.16 14.35A7.6 7.6 0 0 1 4.75 12c0-.82.14-1.6.4-2.35l-.01-.16-3.75-2.9-.12.06A12 12 0 0 0 0 12c0 1.93.46 3.76 1.27 5.35z"/><path fill="#EA4335" d="M12 4.75c2.25 0 3.77.97 4.64 1.78l3.38-3.3C17.94 1.19 15.24 0 12 0 7.3 0 3.26 2.7 1.27 6.65l3.88 3c.96-2.92 3.66-4.9 6.85-4.9"/></svg>`,
};
