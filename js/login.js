(function () {
  // ---- Icon injection -------------------------------------------------
  document.querySelectorAll(".brand-panel .brand-icon, .mobile-header .brand-icon")
    .forEach((el) => (el.innerHTML = ICONS.shield));
  document.getElementById("login-icon").innerHTML = ICONS.shield;
  document.querySelectorAll(".status-icon.neutral").forEach((el) => {
    if (!el.innerHTML.trim()) el.innerHTML = ICONS.shield;
  });
  document.querySelector("#field-identifier .icon-left").innerHTML = ICONS.user;
  document.querySelector("#field-password .icon-left").innerHTML = ICONS.lock;
  document.getElementById("toggle-login-password").innerHTML = ICONS.eye;
  document.getElementById("google-login").innerHTML = `${ICONS.google} Continue with Google`;

  let passwordVisible = false;
  document.getElementById("toggle-login-password").addEventListener("click", () => {
    passwordVisible = !passwordVisible;
    const input = document.getElementById("login-password");
    input.type = passwordVisible ? "text" : "password";
    document.getElementById("toggle-login-password").innerHTML = passwordVisible ? ICONS.eyeOff : ICONS.eye;
  });

  document.getElementById("google-login").addEventListener("click", () => {
    alert("Google sign-in isn't wired up in this demo — this button is here to match the UI.");
  });
  document.getElementById("forgot-password").addEventListener("click", (e) => {
    e.preventDefault();
    alert("Password reset isn't implemented in this demo.");
  });

  // ---- Screen switching -------------------------------------------------
  function showScreen(id) {
    document.querySelectorAll(".card").forEach((c) => c.classList.add("hidden"));
    document.getElementById(id).classList.remove("hidden");
  }
  document.querySelectorAll("[data-back-to]").forEach((btn) => {
    btn.addEventListener("click", () => showScreen(btn.dataset.backTo));
  });

  // ---- State --------------------------------------------------------------
  let loginState = { userId: null, method: null, destination: null };
  let cancelTimer = null;
  let cancelResendTimer = null;

  // ---- SCREEN 1: Login form ------------------------------------------------
  const loginForm = document.getElementById("login-form");
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearLoginErrors();

    const identifier = document.getElementById("identifier").value.trim();
    const password = document.getElementById("login-password").value;

    const submitBtn = document.getElementById("login-submit");
    submitBtn.disabled = true;
    submitBtn.textContent = "Logging in...";

    try {
      const data = await api("/api/login", { method: "POST", body: { identifier, password } });

      if (data.mfaRequired) {
        loginState.userId = data.userId;
        loginState.method = data.method;
        beginMfa(data.method);
      } else {
        window.location.href = "dashboard.html";
      }
    } catch (err) {
      showLoginError();
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Login";
    }
  });

  function showLoginError() {
    document.getElementById("login-banner").classList.remove("hidden");
    document.getElementById("field-identifier").classList.add("has-error");
    document.getElementById("field-password").classList.add("has-error");
  }
  function clearLoginErrors() {
    document.getElementById("login-banner").classList.add("hidden");
    document.getElementById("field-identifier").classList.remove("has-error");
    document.getElementById("field-password").classList.remove("has-error");
  }

  // ---- SCREEN 2: Choose method (only rendered if account had >1 option;
  // here we show the account's enrolled method plus the others disabled,
  // matching the mockup's 3-card layout) --------------------------------
  const METHOD_META = {
    email: { name: "Email OTP", desc: "Receive a code on your email", icon: ICONS.mail },
    sms: { name: "SMS OTP", desc: "Receive a code on your mobile", icon: ICONS.phone },
    authenticator: { name: "Authenticator App", desc: "Use code from authenticator app", icon: ICONS.shield },
  };

  function beginMfa(enrolledMethod) {
    const list = document.getElementById("login-method-list");
    list.innerHTML = "";
    let selected = enrolledMethod;

    Object.entries(METHOD_META).forEach(([key, meta]) => {
      const enabled = key === enrolledMethod;
      const card = document.createElement("label");
      card.className = "method-card" + (key === selected ? " selected" : "") + (enabled ? "" : " disabled");
      card.innerHTML = `
        <span class="method-icon">${meta.icon}</span>
        <span class="method-text">
          <span class="name">${meta.name}</span>
          <span class="desc">${enabled ? meta.desc : "Not set up for this account"}</span>
        </span>
        <input type="radio" name="login-method" value="${key}" ${key === selected ? "checked" : ""} ${enabled ? "" : "disabled"} />
      `;
      if (enabled) {
        card.addEventListener("click", () => {
          selected = key;
          list.querySelectorAll(".method-card").forEach((c) => c.classList.remove("selected"));
          card.classList.add("selected");
        });
      }
      list.appendChild(card);
    });

    const continueBtn = document.getElementById("choose-method-continue");
    continueBtn.disabled = false;
    continueBtn.onclick = () => {
      loginState.method = selected;
      if (selected === "authenticator") {
        showScreen("screen-login-authenticator");
        wireAuthenticatorInputs();
      } else {
        startLoginOtp(selected);
      }
    };

    showScreen("screen-choose-method");
  }

  // ---- SCREEN 3: Email/SMS OTP for login ------------------------------------
  async function startLoginOtp(method) {
    const purpose = method === "email" ? "login-email" : "login-sms";
    document.getElementById("login-otp-title").textContent =
      method === "email" ? "Email Verification" : "SMS Verification";
    document.getElementById("login-otp-icon").innerHTML = ICONS.mail;
    document.getElementById("login-otp-icon").className = "status-icon neutral";
    document.getElementById("login-otp-banner").classList.add("hidden");
    document.getElementById("login-otp-inputs").classList.remove("error");

    try {
      const data = await api("/api/otp-send", { method: "POST", body: { userId: loginState.userId, purpose } });
      document.getElementById("login-otp-dev").textContent = data.devOtp
        ? `Demo mode — your code is ${data.devOtp} (no real email/SMS is sent in this assignment build).`
        : "";
      showScreen("screen-login-otp");
      runOtpTimers(data.expiresInSeconds || 180, "login");
      const otpHandle = wireOtpInputs(document.getElementById("login-otp-inputs"), (code) => verifyLoginOtp(purpose, code, otpHandle));
      otpHandle.focus();
    } catch (err) {
      alert(err.message);
    }
  }

  async function verifyLoginOtp(purpose, code, otpHandle) {
    const method = purpose === "login-email" ? "email" : "sms";
    try {
      await api("/api/login-verify", { method: "POST", body: { userId: loginState.userId, method, code } });
      window.location.href = "dashboard.html";
    } catch (err) {
      handleOtpError(err, "login", otpHandle);
    }
  }

  function handleOtpError(err, prefix, otpHandle) {
    const banner = document.getElementById(`${prefix}-otp-banner`);
    const inputs = document.getElementById(`${prefix}-otp-inputs`);
    const icon = document.getElementById(`${prefix}-otp-icon`);

    if (err.data && err.data.code === "EXPIRED") {
      banner.textContent = "This code has expired.";
      icon.className = "status-icon error";
      icon.innerHTML = ICONS.mail;
      inputs.classList.add("error");
      document.getElementById(`${prefix}-otp-timer`).classList.add("hidden");
    } else if (err.data && err.data.code === "MAX_ATTEMPTS") {
      banner.textContent = "Maximum attempts reached. Please request a new code.";
      inputs.classList.add("error");
    } else {
      const left = err.data && typeof err.data.attemptsLeft === "number" ? err.data.attemptsLeft : null;
      banner.textContent = left !== null
        ? `Incorrect code. Please try again. You have ${left} attempt${left === 1 ? "" : "s"} left.`
        : "Incorrect code. Please try again.";
      icon.className = "status-icon error";
      icon.innerHTML = ICONS.mail;
      inputs.classList.add("error");
    }
    banner.classList.remove("hidden");
    otpHandle.clear();
  }

  function runOtpTimers(expirySeconds, prefix) {
    cancelTimer && cancelTimer();
    cancelResendTimer && cancelResendTimer();

    const timerEl = document.getElementById(`${prefix}-otp-timer`);
    timerEl.classList.remove("hidden");
    cancelTimer = startCountdown(expirySeconds, {
      onTick: (s) => (timerEl.innerHTML = `Code expires in <strong>${formatMMSS(s)}</strong>`),
      onDone: () => {
        timerEl.classList.add("hidden");
        const banner = document.getElementById(`${prefix}-otp-banner`);
        const icon = document.getElementById(`${prefix}-otp-icon`);
        banner.textContent = "Code expired.";
        banner.classList.remove("hidden");
        icon.className = "status-icon error";
        icon.innerHTML = ICONS.mail;
      },
    });

    const resendBtn = document.getElementById(`${prefix}-otp-resend`);
    resendBtn.disabled = true;
    cancelResendTimer = startCountdown(30, {
      onTick: (s) => (resendBtn.textContent = s > 0 ? `Resend code (${formatMMSS(s)})` : "Resend code"),
      onDone: () => (resendBtn.disabled = false),
    });
  }

  document.getElementById("login-otp-resend").addEventListener("click", async () => {
    const purpose = document.getElementById("login-otp-title").textContent.includes("Email") ? "login-email" : "login-sms";
    await startLoginOtp(purpose === "login-email" ? "email" : "sms");
  });

  // ---- Authenticator code entry (login) ------------------------------------
  function wireAuthenticatorInputs() {
    document.getElementById("login-auth-banner").classList.add("hidden");
    const container = document.getElementById("login-auth-inputs");
    container.classList.remove("error");
    container.querySelectorAll("input").forEach((i) => (i.value = ""));
    const handle = wireOtpInputs(container, async (code) => {
      try {
        await api("/api/login-verify", { method: "POST", body: { userId: loginState.userId, method: "authenticator", code } });
        window.location.href = "dashboard.html";
      } catch (err) {
        document.getElementById("login-auth-banner").textContent = err.message;
        document.getElementById("login-auth-banner").classList.remove("hidden");
        container.classList.add("error");
        handle.clear();
      }
    });
    handle.focus();
  }
})();
