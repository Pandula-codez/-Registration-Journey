(function () {
  // ---- Icon injection -------------------------------------------------
  document.querySelectorAll(".brand-panel .brand-icon, .mobile-header .brand-icon")
    .forEach((el) => (el.innerHTML = ICONS.shield));
  document.getElementById("toggle-reg-password").innerHTML = ICONS.eye;
  document.getElementById("success-icon").innerHTML = ICONS.check;
  document.querySelectorAll(".status-icon.neutral").forEach((el) => {
    if (!el.innerHTML.trim()) el.innerHTML = ICONS.shield;
  });
  document.getElementById("email-otp-icon").innerHTML = ICONS.mail;
  document.getElementById("mobile-otp-icon").innerHTML = ICONS.phone;

  let passwordVisible = false;
  document.getElementById("toggle-reg-password").addEventListener("click", () => {
    passwordVisible = !passwordVisible;
    const input = document.getElementById("reg-password");
    input.type = passwordVisible ? "text" : "password";
    document.getElementById("toggle-reg-password").innerHTML = passwordVisible ? ICONS.eyeOff : ICONS.eye;
  });

  // ---- Step indicator -------------------------------------------------
  const STEPS = ["screen-details", "screen-email-otp", "screen-mobile-otp", "screen-mfa-choose", "screen-success"];
  function renderStepIndicator(activeIndex) {
    const el = document.getElementById("step-indicator");
    el.innerHTML = "";
    STEPS.forEach((_, i) => {
      const dot = document.createElement("div");
      dot.className = "dot" + (i < activeIndex ? " done" : i === activeIndex ? " active" : "");
      dot.textContent = i < activeIndex ? "✓" : i + 1;
      el.appendChild(dot);
      if (i < STEPS.length - 1) {
        const line = document.createElement("div");
        line.className = "line" + (i < activeIndex ? " done" : "");
        el.appendChild(line);
      }
    });
  }

  function showScreen(id, stepIndex) {
    document.querySelectorAll(".card").forEach((c) => c.classList.add("hidden"));
    document.getElementById(id).classList.remove("hidden");
    if (typeof stepIndex === "number") renderStepIndicator(stepIndex);
  }
  document.querySelectorAll("[data-back-to]").forEach((btn) => {
    btn.addEventListener("click", () => showScreen(btn.dataset.backTo));
  });
  renderStepIndicator(0);

  // ---- Password strength (live, client-side mirror of server rule) --------
  function evaluate(password) {
    const checks = {
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[^A-Za-z0-9]/.test(password),
    };
    const score = Object.values(checks).filter(Boolean).length;
    let label = "Weak";
    if (score === 4) label = "Strong";
    else if (score >= 2) label = "Medium";
    return { checks, score, label, valid: score === 4 };
  }

  const pwInput = document.getElementById("reg-password");
  pwInput.addEventListener("input", () => {
    const result = evaluate(pwInput.value);
    Object.entries(result.checks).forEach(([key, met]) => {
      const row = document.querySelector(`.req[data-check="${key}"]`);
      row.classList.toggle("met", met);
      row.querySelector(".dot").innerHTML = met ? ICONS.checkSmall : "";
    });
    const meter = document.getElementById("strength-meter");
    meter.className = "strength-meter " + result.label.toLowerCase();
    document.getElementById("strength-value").textContent = result.label;
  });

  // ---- SCREEN 1: Details form -----------------------------------------
  let regState = { userId: null, email: null, mobile: null };

  document.getElementById("details-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const banner = document.getElementById("details-banner");
    banner.classList.add("hidden");
    document.getElementById("field-email").classList.remove("has-error");

    const fullName = document.getElementById("fullName").value.trim();
    const email = document.getElementById("email").value.trim();
    const mobile = document.getElementById("country-code").value + " " + document.getElementById("mobile").value.trim();
    const password = pwInput.value;
    const agreed = document.getElementById("agree-terms").checked;

    const strength = evaluate(password);
    if (!strength.valid) {
      banner.textContent = "Password does not meet the minimum strength requirement.";
      banner.classList.remove("hidden");
      return;
    }
    if (!agreed) {
      banner.textContent = "Please agree to the Terms & Conditions to continue.";
      banner.classList.remove("hidden");
      return;
    }

    const submitBtn = document.getElementById("details-submit");
    submitBtn.disabled = true;
    submitBtn.textContent = "Creating account...";

    try {
      const data = await api("/api/register", { method: "POST", body: { fullName, email, mobile, password } });
      regState.userId = data.userId;
      regState.email = data.email;
      regState.mobile = data.mobile;

      document.getElementById("email-otp-destination").textContent = data.email;
      document.getElementById("email-otp-dev").textContent = data.devOtp
        ? `Demo mode — your code is ${data.devOtp} (no real email is sent in this assignment build).`
        : "";
      showScreen("screen-email-otp", 1);
      startOtpFlow("email", "email", regState.userId, onEmailVerified, 180);
    } catch (err) {
      if (err.status === 409) {
        document.getElementById("field-email").classList.add("has-error");
      }
      banner.textContent = err.message;
      banner.classList.remove("hidden");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Create Account";
    }
  });

  // ---- Generic OTP screen engine (shared by email / mobile / mfa setup) ---
  const otpCancels = {};

  function startOtpFlow(prefix, purpose, userId, onVerified, expirySeconds) {
    const inputsEl = document.getElementById(`${prefix}-otp-inputs`);
    const bannerEl = document.getElementById(`${prefix}-otp-banner`);
    const iconEl = document.getElementById(`${prefix}-otp-icon`);
    const timerEl = document.getElementById(`${prefix}-otp-timer`);
    const resendBtn = document.getElementById(`${prefix}-otp-resend`);

    bannerEl.classList.add("hidden");
    inputsEl.classList.remove("error");
    inputsEl.querySelectorAll("input").forEach((i) => (i.value = ""));
    timerEl.classList.remove("hidden");

    const handle = wireOtpInputs(inputsEl, async (code) => {
      try {
        const res = await api("/api/otp-verify", { method: "POST", body: { userId, purpose, code } });
        onVerified(res);
      } catch (err) {
        if (err.data && err.data.code === "EXPIRED") {
          bannerEl.textContent = "This code has expired.";
          timerEl.classList.add("hidden");
        } else if (err.data && err.data.code === "MAX_ATTEMPTS") {
          bannerEl.textContent = "Maximum attempts reached. Please request a new code.";
        } else {
          const left = err.data && typeof err.data.attemptsLeft === "number" ? err.data.attemptsLeft : null;
          bannerEl.textContent = left !== null
            ? `Incorrect code. Please try again. You have ${left} attempt${left === 1 ? "" : "s"} left.`
            : "Incorrect code. Please try again.";
        }
        iconEl.className = "status-icon error";
        inputsEl.classList.add("error");
        bannerEl.classList.remove("hidden");
        handle.clear();
      }
    });
    handle.focus();

    if (otpCancels[prefix]) otpCancels[prefix]();
    const cancelExpiry = startCountdown(expirySeconds, {
      onTick: (s) => (timerEl.innerHTML = `Code expires in <strong>${formatMMSS(s)}</strong>`),
      onDone: () => {
        timerEl.classList.add("hidden");
        bannerEl.textContent = "This code has expired.";
        bannerEl.classList.remove("hidden");
        iconEl.className = "status-icon error";
      },
    });
    resendBtn.disabled = true;
    const cancelResend = startCountdown(30, {
      onTick: (s) => (resendBtn.textContent = s > 0 ? `Resend code (${formatMMSS(s)})` : "Resend code"),
      onDone: () => (resendBtn.disabled = false),
    });
    otpCancels[prefix] = () => { cancelExpiry(); cancelResend(); };

    resendBtn.onclick = async () => {
      const data = await api("/api/otp-send", { method: "POST", body: { userId, purpose } });
      document.getElementById(`${prefix}-otp-dev`).textContent = data.devOtp
        ? `Demo mode — your code is ${data.devOtp} (no real email/SMS is sent in this assignment build).`
        : "";
      iconEl.className = "status-icon neutral";
      startOtpFlow(prefix, purpose, userId, onVerified, data.expiresInSeconds || 180);
    };
  }

  function onEmailVerified() {
    document.getElementById("mobile-otp-destination").textContent = regState.mobile;
    showScreen("screen-mobile-otp", 2);
    api("/api/otp-send", { method: "POST", body: { userId: regState.userId, purpose: "mobile" } }).then((data) => {
      document.getElementById("mobile-otp-dev").textContent = data.devOtp
        ? `Demo mode — your code is ${data.devOtp} (no real SMS is sent in this assignment build).`
        : "";
      startOtpFlow("mobile", "mobile", regState.userId, onMobileVerified, data.expiresInSeconds || 180);
    });
  }

  function onMobileVerified() {
    showScreen("screen-mfa-choose", 3);
    renderMfaChoices();
  }

  // ---- SCREEN 4: choose MFA method -----------------------------------
  const MFA_META = {
    authenticator: { name: "Authenticator App", desc: "Google Authenticator / Authy", icon: ICONS.shield },
    sms: { name: "SMS Authentication", desc: "Receive codes on your mobile", icon: ICONS.phone },
    email: { name: "Email Authentication", desc: "Receive codes on your email", icon: ICONS.mail },
  };

  function renderMfaChoices() {
    const list = document.getElementById("mfa-method-list");
    list.innerHTML = "";
    let selected = "authenticator";

    Object.entries(MFA_META).forEach(([key, meta]) => {
      const card = document.createElement("label");
      card.className = "method-card" + (key === selected ? " selected" : "");
      card.innerHTML = `
        <span class="method-icon">${meta.icon}</span>
        <span class="method-text"><span class="name">${meta.name}</span><span class="desc">${meta.desc}</span></span>
        <input type="radio" name="mfa-method" value="${key}" ${key === selected ? "checked" : ""} />
      `;
      card.addEventListener("click", () => {
        selected = key;
        list.querySelectorAll(".method-card").forEach((c) => c.classList.remove("selected"));
        card.classList.add("selected");
      });
      list.appendChild(card);
    });

    document.getElementById("mfa-choose-continue").onclick = async () => {
      if (selected === "authenticator") {
        const data = await api("/api/mfa-setup", { method: "POST", body: { userId: regState.userId, method: "authenticator" } });
        document.getElementById("mfa-qr-image").src = data.qrDataUrl;
        document.getElementById("mfa-setup-key").textContent = data.manualEntryKey;
        showScreen("screen-mfa-authenticator-setup");
      } else {
        const data = await api("/api/mfa-setup", { method: "POST", body: { userId: regState.userId, method: selected } });
        document.getElementById("mfa-otp-title").textContent = selected === "sms" ? "SMS Verification" : "Email Verification";
        document.getElementById("mfa-otp-icon").innerHTML = selected === "sms" ? ICONS.phone : ICONS.mail;
        document.getElementById("mfa-otp-icon").className = "status-icon neutral";
        document.getElementById("mfa-otp-destination").textContent = selected === "sms" ? regState.mobile : regState.email;
        document.getElementById("mfa-otp-dev").textContent = data.devOtp
          ? `Demo mode — your code is ${data.devOtp} (no real email/SMS is sent in this assignment build).`
          : "";
        showScreen("screen-mfa-otp", 3);
        startOtpFlow("mfa", selected === "sms" ? "mfa-sms" : "mfa-email", regState.userId, onMfaComplete, data.expiresInSeconds || 180);
      }
    };
  }

  document.getElementById("mfa-authenticator-continue").addEventListener("click", () => {
    showScreen("screen-mfa-verify");
    const container = document.getElementById("mfa-verify-inputs");
    container.classList.remove("error");
    container.querySelectorAll("input").forEach((i) => (i.value = ""));
    document.getElementById("mfa-verify-banner").classList.add("hidden");
    const handle = wireOtpInputs(container, async (code) => {
      try {
        await api("/api/mfa-verify", { method: "POST", body: { userId: regState.userId, code } });
        onMfaComplete();
      } catch (err) {
        document.getElementById("mfa-verify-banner").textContent = err.message;
        document.getElementById("mfa-verify-banner").classList.remove("hidden");
        container.classList.add("error");
        document.getElementById("mfa-verify-icon").className = "status-icon error";
        handle.clear();
      }
    });
    handle.focus();
  });

  function onMfaComplete() {
    showScreen("screen-success", 4);
  }

  document.getElementById("go-to-login").addEventListener("click", () => {
    window.location.href = "index.html";
  });
})();
