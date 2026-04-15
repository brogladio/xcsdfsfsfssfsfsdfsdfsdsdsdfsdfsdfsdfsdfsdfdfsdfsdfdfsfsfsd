// GhostCheats — Auth System
// Handles: sign up, login, Google OAuth (popup), session persistence,
// account management, saved cart sync, order history

const AUTH_STORAGE_KEY = "ghostcheats-auth-user";
const ORDERS_STORAGE_KEY = "ghostcheats-orders";

// ── Utility ──────────────────────────────────────────────────────────────────

function hashPassword(password) {
  // Simple deterministic hash for demo (in production use bcrypt on server)
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    hash = ((hash << 5) - hash) + password.charCodeAt(i);
    hash |= 0;
  }
  return "hashed_" + Math.abs(hash).toString(16);
}

function getAllUsers() {
  try {
    return JSON.parse(localStorage.getItem("ghostcheats-users") || "{}");
  } catch { return {}; }
}

function saveAllUsers(users) {
  localStorage.setItem("ghostcheats-users", JSON.stringify(users));
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ── Session ──────────────────────────────────────────────────────────────────

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || "null");
  } catch { return null; }
}

function setCurrentUser(user) {
  if (user) {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }
  updateHeaderAuthUI();
}

// ── Auth Actions ─────────────────────────────────────────────────────────────

function signUp(email, password, displayName) {
  const users = getAllUsers();
  const key = email.toLowerCase().trim();
  if (users[key]) {
    return { error: "An account with this email already exists." };
  }
  const user = {
    id: generateId(),
    email: key,
    displayName: displayName || email.split("@")[0],
    avatar: null,
    provider: "email",
    createdAt: Date.now(),
  };
  users[key] = { ...user, passwordHash: hashPassword(password) };
  saveAllUsers(users);
  setCurrentUser(user);
  return { user };
}

function signIn(email, password) {
  const users = getAllUsers();
  const key = email.toLowerCase().trim();
  const stored = users[key];
  if (!stored) return { error: "No account found with this email." };
  if (stored.passwordHash !== hashPassword(password)) {
    return { error: "Incorrect password." };
  }
  const { passwordHash, ...user } = stored;
  setCurrentUser(user);
  return { user };
}

async function signInWithGoogle() {
  // Real Firebase Google OAuth:
  // 1. Create a project at https://console.firebase.google.com
  // 2. Enable Authentication > Sign-in method > Google
  // 3. Add Firebase SDK script to your HTML:
  //    <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"></script>
  //    <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js"></script>
  // 4. Create firebase-config.js with:
  //    window.FIREBASE_CONFIG = { apiKey:"...", authDomain:"...", projectId:"..." };
  //    firebase.initializeApp(window.FIREBASE_CONFIG);
  // 5. Add your domain to Firebase > Authentication > Authorized domains

  if (window.FIREBASE_CONFIG && typeof firebase !== "undefined" && firebase.auth) {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      const result = await firebase.auth().signInWithPopup(provider);
      const fbUser = result.user;
      const user = {
        id: fbUser.uid,
        email: fbUser.email,
        displayName: fbUser.displayName || fbUser.email.split("@")[0],
        avatar: fbUser.photoURL,
        provider: "google",
        createdAt: Date.now(),
      };
      const users = getAllUsers();
      users[user.email] = user;
      saveAllUsers(users);
      setCurrentUser(user);
      return { user };
    } catch (err) {
      return { error: err.message || "Google sign-in failed." };
    }
  }

  // Dev fallback — no Firebase configured yet
  return new Promise((resolve) => {
    const email = prompt("Dev mode: enter your email to simulate Google sign-in:");
    if (!email || !email.includes("@")) { resolve({ error: "Cancelled." }); return; }
    const name = email.split("@")[0];
    const user = {
      id: "google_" + generateId(),
      email: email.toLowerCase().trim(),
      displayName: name.charAt(0).toUpperCase() + name.slice(1),
      avatar: null,
      provider: "google",
      createdAt: Date.now(),
    };
    const users = getAllUsers();
    if (!users[user.email]) { users[user.email] = user; saveAllUsers(users); }
    const { passwordHash, ...savedUser } = users[user.email];
    setCurrentUser(savedUser);
    resolve({ user: savedUser });
  });
}

function signOut() {
  setCurrentUser(null);
  closeAuthModal();
  closeAccountDrawer();
}

function updateProfile(changes) {
  const user = getCurrentUser();
  if (!user) return;
  const users = getAllUsers();
  const stored = users[user.email] || {};
  const updated = { ...user, ...changes };
  users[user.email] = { ...stored, ...updated };
  saveAllUsers(users);
  setCurrentUser(updated);
}

// ── Orders ────────────────────────────────────────────────────────────────────

function getOrders() {
  const user = getCurrentUser();
  if (!user) return [];
  try {
    const all = JSON.parse(localStorage.getItem(ORDERS_STORAGE_KEY) || "{}");
    return all[user.id] || [];
  } catch { return []; }
}

function saveOrder(orderData) {
  const user = getCurrentUser();
  if (!user) return;
  try {
    const all = JSON.parse(localStorage.getItem(ORDERS_STORAGE_KEY) || "{}");
    if (!all[user.id]) all[user.id] = [];
    all[user.id].unshift({ ...orderData, id: generateId(), date: Date.now() });
    localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(all));
  } catch {}
}

// ── Modal ─────────────────────────────────────────────────────────────────────

let authModal = null;
let authMode = "login"; // login | signup | forgot

function openAuthModal(mode = "login") {
  authMode = mode;
  if (!authModal) buildAuthModal();
  setAuthMode(mode);
  authModal.style.display = "flex";
  document.body.style.overflow = "hidden";
  setTimeout(() => {
    authModal.querySelector(".auth-panel").classList.add("auth-panel--open");
    const firstInput = authModal.querySelector("input");
    if (firstInput) firstInput.focus();
  }, 10);
}

function closeAuthModal() {
  if (!authModal) return;
  authModal.querySelector(".auth-panel").classList.remove("auth-panel--open");
  setTimeout(() => {
    if (authModal) authModal.style.display = "none";
    document.body.style.overflow = "";
    // After modal closes, fire any pending checkout action
    if (getCurrentUser() && window._pendingCheckout) {
      const fn = window._pendingCheckout;
      window._pendingCheckout = null;
      fn();
    }
  }, 300);
}

function setAuthMode(mode) {
  authMode = mode;
  if (!authModal) return;

  const loginForm = authModal.querySelector("#authLoginForm");
  const signupForm = authModal.querySelector("#authSignupForm");
  const forgotForm = authModal.querySelector("#authForgotForm");
  const title = authModal.querySelector("#authTitle");
  const subtitle = authModal.querySelector("#authSubtitle");
  const tabLogin = authModal.querySelector("#authTabLogin");
  const tabSignup = authModal.querySelector("#authTabSignup");
  const errorEl = authModal.querySelector("#authError");

  errorEl.textContent = "";
  loginForm.style.display = "none";
  signupForm.style.display = "none";
  forgotForm.style.display = "none";

  if (mode === "login") {
    loginForm.style.display = "flex";
    title.textContent = "Welcome back";
    subtitle.textContent = "Sign in to your account";
    tabLogin.classList.add("active");
    tabSignup.classList.remove("active");
  } else if (mode === "signup") {
    signupForm.style.display = "flex";
    title.textContent = "Create account";
    subtitle.textContent = "Start your journey";
    tabSignup.classList.add("active");
    tabLogin.classList.remove("active");
  } else if (mode === "forgot") {
    forgotForm.style.display = "flex";
    title.textContent = "Reset password";
    subtitle.textContent = "We'll send a link to your email";
  }
}

function buildAuthModal() {
  authModal = document.createElement("div");
  authModal.className = "auth-overlay";
  authModal.innerHTML = `
    <div class="auth-backdrop"></div>
    <div class="auth-panel">
      <button class="auth-close" id="authClose" aria-label="Close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>

      <div class="auth-logo">
        <span class="auth-logo-text">GhostCheats</span>
      </div>

      <div class="auth-tabs">
        <button class="auth-tab active" id="authTabLogin">Sign In</button>
        <button class="auth-tab" id="authTabSignup">Sign Up</button>
      </div>

      <h2 class="auth-title" id="authTitle">Welcome back</h2>
      <p class="auth-subtitle" id="authSubtitle">Sign in to your account</p>

      <p class="auth-error" id="authError"></p>

      <!-- Login Form -->
      <form class="auth-form" id="authLoginForm" autocomplete="on">
        <div class="auth-field">
          <label>Email</label>
          <input type="email" name="email" placeholder="you@example.com" required autocomplete="email" />
        </div>
        <div class="auth-field">
          <label>Password</label>
          <input type="password" name="password" placeholder="••••••••" required autocomplete="current-password" />
        </div>
        <button type="button" class="auth-link auth-forgot-link" id="authForgotLink">Forgot password?</button>
        <button type="submit" class="auth-btn-primary">Sign In</button>
      </form>

      <!-- Signup Form -->
      <form class="auth-form" id="authSignupForm" style="display:none" autocomplete="on">
        <div class="auth-field">
          <label>Display name</label>
          <input type="text" name="displayName" placeholder="Your name" autocomplete="name" />
        </div>
        <div class="auth-field">
          <label>Email</label>
          <input type="email" name="email" placeholder="you@example.com" required autocomplete="email" />
        </div>
        <div class="auth-field">
          <label>Password</label>
          <input type="password" name="password" placeholder="At least 8 characters" required autocomplete="new-password" minlength="8" />
        </div>
        <button type="submit" class="auth-btn-primary">Create Account</button>
      </form>

      <!-- Forgot Password Form -->
      <form class="auth-form" id="authForgotForm" style="display:none">
        <div class="auth-field">
          <label>Email</label>
          <input type="email" name="email" placeholder="you@example.com" required />
        </div>
        <button type="submit" class="auth-btn-primary">Send Reset Link</button>
        <button type="button" class="auth-link" id="authBackToLogin">Back to sign in</button>
      </form>

      <div class="auth-divider"><span>or</span></div>

      <button class="auth-google-btn" id="authGoogleBtn">
        <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
        Continue with Google
      </button>

      <p class="auth-footer-note">By continuing, you agree to our Terms of Service.</p>
    </div>
  `;

  document.body.appendChild(authModal);

  // Events
  authModal.querySelector("#authClose").addEventListener("click", closeAuthModal);
  authModal.querySelector(".auth-backdrop").addEventListener("click", closeAuthModal);
  authModal.querySelector("#authTabLogin").addEventListener("click", () => setAuthMode("login"));
  authModal.querySelector("#authTabSignup").addEventListener("click", () => setAuthMode("signup"));
  authModal.querySelector("#authForgotLink").addEventListener("click", () => setAuthMode("forgot"));
  authModal.querySelector("#authBackToLogin").addEventListener("click", () => setAuthMode("login"));

  authModal.querySelector("#authLoginForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const result = signIn(fd.get("email"), fd.get("password"));
    if (result.error) {
      authModal.querySelector("#authError").textContent = result.error;
    } else {
      closeAuthModal();
    }
  });

  authModal.querySelector("#authSignupForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const result = signUp(fd.get("email"), fd.get("password"), fd.get("displayName"));
    if (result.error) {
      authModal.querySelector("#authError").textContent = result.error;
    } else {
      closeAuthModal();
    }
  });

  authModal.querySelector("#authForgotForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    authModal.querySelector("#authError").style.color = "#4caf50";
    authModal.querySelector("#authError").textContent = `Reset link sent to ${fd.get("email")} (demo mode — check console)`;
    console.log("Password reset requested for:", fd.get("email"));
  });

  authModal.querySelector("#authGoogleBtn").addEventListener("click", async () => {
    const btn = authModal.querySelector("#authGoogleBtn");
    btn.disabled = true;
    btn.textContent = "Signing in...";
    const result = await signInWithGoogle();
    btn.disabled = false;
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg> Continue with Google`;
    if (result.error) {
      authModal.querySelector("#authError").textContent = result.error === "Cancelled." ? "" : result.error;
    } else {
      closeAuthModal();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && authModal.style.display === "flex") closeAuthModal();
  });
}

// ── Account Drawer ────────────────────────────────────────────────────────────

let accountDrawer = null;

function openAccountDrawer() {
  if (!accountDrawer) buildAccountDrawer();
  refreshAccountDrawer();
  accountDrawer.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeAccountDrawer() {
  if (!accountDrawer) return;
  accountDrawer.classList.remove("open");
  document.body.style.overflow = "";
}

function buildAccountDrawer() {
  accountDrawer = document.createElement("aside");
  accountDrawer.className = "account-drawer";
  accountDrawer.innerHTML = `
    <div class="account-backdrop"></div>
    <div class="account-panel">
      <div class="account-panel-header">
        <h2>My Account</h2>
        <button class="btn-close" id="accountClose" aria-label="Close">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="account-content" id="accountContent"></div>
    </div>
  `;
  document.body.appendChild(accountDrawer);
  accountDrawer.querySelector("#accountClose").addEventListener("click", closeAccountDrawer);
  accountDrawer.querySelector(".account-backdrop").addEventListener("click", closeAccountDrawer);
}

function refreshAccountDrawer() {
  const user = getCurrentUser();
  if (!user || !accountDrawer) return;
  const orders = getOrders();
  const history = (() => {
    try { return JSON.parse(localStorage.getItem("ghostcheats-key-history") || "[]"); } catch { return []; }
  })();

  const initials = (user.displayName || user.email || "?").slice(0, 2).toUpperCase();

  accountDrawer.querySelector("#accountContent").innerHTML = `
    <!-- Profile -->
    <section class="acc-section">
      <div class="acc-profile-row">
        <div class="acc-avatar">${initials}</div>
        <div>
          <p class="acc-name" id="accDisplayName">${escHtml(user.displayName || "")}</p>
          <p class="acc-email">${escHtml(user.email)}</p>
          ${user.provider === "google" ? '<span class="acc-badge acc-badge--google">Google</span>' : ""}
        </div>
      </div>
    </section>

    <!-- Edit Profile -->
    <section class="acc-section">
      <h3 class="acc-section-title">Edit Profile</h3>
      <form class="acc-form" id="accProfileForm">
        <div class="acc-field">
          <label>Display name</label>
          <input type="text" name="displayName" value="${escHtml(user.displayName || "")}" placeholder="Your name" />
        </div>
        ${user.provider !== "google" ? `
        <div class="acc-field">
          <label>New password</label>
          <input type="password" name="password" placeholder="Leave blank to keep current" minlength="8" />
        </div>` : ""}
        <button type="submit" class="acc-btn-save">Save Changes</button>
        <p class="acc-save-msg" id="accSaveMsg"></p>
      </form>
    </section>

    <!-- Order / Key History -->
    <section class="acc-section">
      <h3 class="acc-section-title">Key History</h3>
      ${history.length === 0
        ? '<p class="acc-empty">No keys yet. Complete a purchase to see them here.</p>'
        : history.slice(0, 10).map(entry => `
          <div class="acc-key-row">
            <div>
              <p class="acc-key-product">${escHtml(entry.product)}</p>
              <code class="acc-key-value">${escHtml(entry.key)}</code>
              <small class="acc-key-date">${new Date(entry.created_at || Date.now()).toLocaleDateString()}</small>
            </div>
            <button class="acc-copy-btn" data-key="${escHtml(entry.key)}">Copy</button>
          </div>`).join("")
      }
    </section>

    <!-- Sign out -->
    <section class="acc-section">
      <button class="acc-signout-btn" id="accSignOut">Sign Out</button>
    </section>
  `;

  accountDrawer.querySelector("#accProfileForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const changes = {};
    if (fd.get("displayName").trim()) changes.displayName = fd.get("displayName").trim();
    if (fd.get("password") && fd.get("password").length >= 8) {
      const users = getAllUsers();
      if (users[user.email]) users[user.email].passwordHash = hashPassword(fd.get("password"));
      saveAllUsers(users);
    }
    updateProfile(changes);
    const msg = accountDrawer.querySelector("#accSaveMsg");
    msg.textContent = "Saved!";
    msg.style.color = "#4caf50";
    setTimeout(() => { msg.textContent = ""; }, 2000);
    refreshAccountDrawer();
  });

  accountDrawer.querySelectorAll(".acc-copy-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.key);
        btn.textContent = "Copied!";
        setTimeout(() => { btn.textContent = "Copy"; }, 1200);
      } catch { btn.textContent = "Failed"; }
    });
  });

  accountDrawer.querySelector("#accSignOut").addEventListener("click", signOut);
}

function escHtml(val) {
  return String(val || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ── Header UI ─────────────────────────────────────────────────────────────────

function updateHeaderAuthUI() {
  const user = getCurrentUser();
  const authContainer = document.querySelector(".header-auth");
  if (!authContainer) return;

  if (user) {
    const initials = (user.displayName || user.email || "?").slice(0, 2).toUpperCase();
    authContainer.innerHTML = `
      <button type="button" class="btn-icon" id="headerAuthBtn" title="${user.displayName || user.email}" style="border:none; padding:0; border-radius:50%; background:transparent;">
        <span class="header-avatar">${initials}</span>
      </button>
    `;
    const authBtn = document.getElementById("headerAuthBtn");
    if (authBtn) authBtn.onclick = openAccountDrawer;
  } else {
    authContainer.innerHTML = `
      <span>Existing user?</span>
      <a href="#" id="signInLink">Sign In</a>
      <a href="#" class="btn-signup" id="signUpLink">Sign Up</a>
    `;
    const signInLink = document.getElementById("signInLink");
    const signUpLink = document.getElementById("signUpLink");
    if (signInLink) signInLink.onclick = (e) => { e.preventDefault(); openAuthModal("login"); };
    if (signUpLink) signUpLink.onclick = (e) => { e.preventDefault(); openAuthModal("signup"); };
  }
}

// ── Inject CSS ────────────────────────────────────────────────────────────────

(function injectAuthStyles() {
  const style = document.createElement("style");
  style.textContent = `
/* ─ Auth overlay ─ */
.auth-overlay {
  position: fixed; inset: 0; z-index: 500;
  display: none; align-items: center; justify-content: center;
}
.auth-backdrop {
  position: absolute; inset: 0;
  background: rgba(0,0,0,0.75);
  backdrop-filter: blur(6px);
}
.auth-panel {
  position: relative; z-index: 1;
  width: 100%; max-width: 420px; margin: 1rem;
  background: #141011;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 20px;
  padding: 2rem;
  transform: translateY(16px) scale(0.97);
  opacity: 0;
  transition: transform 0.25s cubic-bezier(0.4,0,0.2,1), opacity 0.25s;
}
.auth-panel--open { transform: translateY(0) scale(1); opacity: 1; }
.auth-close {
  position: absolute; top: 1rem; right: 1rem;
  background: none; border: none; color: rgba(255,255,255,0.4);
  cursor: pointer; padding: 4px; border-radius: 8px;
  transition: 0.2s;
}
.auth-close:hover { color: #ece8e8; background: rgba(255,255,255,0.06); }
.auth-logo { text-align: center; margin-bottom: 1.25rem; }
.auth-logo-text {
  font-family: 'Outfit', sans-serif;
  font-size: 1.1rem; font-weight: 700; letter-spacing: 0.05em;
  color: #e63946;
}
.auth-tabs {
  display: flex; background: rgba(255,255,255,0.04);
  border-radius: 10px; padding: 3px; margin-bottom: 1.5rem;
}
.auth-tab {
  flex: 1; background: none; border: none;
  color: rgba(255,255,255,0.45); font-family: 'Outfit', sans-serif;
  font-size: 0.9rem; font-weight: 500; padding: 8px;
  border-radius: 8px; cursor: pointer; transition: 0.2s;
}
.auth-tab.active {
  background: rgba(230,57,70,0.18);
  color: #e63946;
}
.auth-title {
  margin: 0 0 2px; font-size: 1.35rem; font-weight: 700;
  color: #ece8e8;
}
.auth-subtitle {
  margin: 0 0 1.25rem; font-size: 0.88rem;
  color: rgba(255,255,255,0.45);
}
.auth-error {
  min-height: 1.2rem; margin: 0 0 0.75rem;
  font-size: 0.85rem; color: #ff6b6b;
}
.auth-form { display: flex; flex-direction: column; gap: 0.75rem; }
.auth-field { display: flex; flex-direction: column; gap: 6px; }
.auth-field label {
  font-size: 0.82rem; font-weight: 500;
  color: rgba(255,255,255,0.55);
}
.auth-field input {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px; padding: 10px 14px;
  color: #ece8e8; font-family: 'Outfit', sans-serif;
  font-size: 0.95rem; outline: none;
  transition: border-color 0.2s;
}
.auth-field input:focus { border-color: rgba(230,57,70,0.6); }
.auth-field input::placeholder { color: rgba(255,255,255,0.2); }
.auth-btn-primary {
  background: #e63946; color: #fff;
  border: none; border-radius: 10px;
  padding: 11px; font-family: 'Outfit', sans-serif;
  font-size: 0.95rem; font-weight: 600;
  cursor: pointer; transition: 0.2s; margin-top: 4px;
}
.auth-btn-primary:hover { background: #ff4757; }
.auth-btn-primary:active { transform: scale(0.98); }
.auth-link {
  background: none; border: none;
  color: rgba(255,255,255,0.4); font-size: 0.82rem;
  cursor: pointer; text-align: left; padding: 0;
  text-decoration: underline; transition: 0.2s;
}
.auth-link:hover { color: #e63946; }
.auth-forgot-link { align-self: flex-end; }
.auth-divider {
  display: flex; align-items: center; gap: 1rem;
  margin: 1.25rem 0; color: rgba(255,255,255,0.2); font-size: 0.8rem;
}
.auth-divider::before, .auth-divider::after {
  content: ""; flex: 1; height: 1px;
  background: rgba(255,255,255,0.08);
}
.auth-google-btn {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  width: 100%; background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px; padding: 10px;
  color: #ece8e8; font-family: 'Outfit', sans-serif;
  font-size: 0.95rem; font-weight: 500;
  cursor: pointer; transition: 0.2s;
}
.auth-google-btn:hover { background: rgba(255,255,255,0.09); border-color: rgba(255,255,255,0.18); }
.auth-footer-note {
  text-align: center; font-size: 0.75rem;
  color: rgba(255,255,255,0.2); margin: 1rem 0 0;
}

/* ─ Header avatar ─ */
.header-avatar {
  display: flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; border-radius: 50%;
  background: rgba(230,57,70,0.2); color: #e63946;
  font-size: 0.78rem; font-weight: 700; font-family: 'Outfit', sans-serif;
  border: 1.5px solid rgba(230,57,70,0.4);
}

/* ─ Account Drawer ─ */
.account-drawer {
  position: fixed; inset: 0; z-index: 300;
  pointer-events: none; visibility: hidden;
  transition: visibility 0s 0.3s;
}
.account-drawer.open {
  pointer-events: auto; visibility: visible;
  transition: visibility 0s;
}
.account-backdrop {
  position: absolute; inset: 0;
  background: rgba(0,0,0,0.6);
  backdrop-filter: blur(4px);
  opacity: 0; transition: opacity 0.3s;
}
.account-drawer.open .account-backdrop { opacity: 1; }
.account-panel {
  position: absolute; top: 0; right: 0; bottom: 0;
  width: 100%; max-width: 400px;
  background: #141011;
  border-left: 1px solid rgba(255,255,255,0.06);
  transform: translateX(100%);
  transition: transform 0.3s cubic-bezier(0.4,0,0.2,1);
  overflow-y: auto;
  display: flex; flex-direction: column;
}
.account-drawer.open .account-panel { transform: translateX(0); }
.account-panel-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  position: sticky; top: 0;
  background: #141011; z-index: 1;
}
.account-panel-header h2 {
  margin: 0; font-size: 1.1rem; font-weight: 600; color: #ece8e8;
}
.account-content { flex: 1; padding: 0.5rem 0; }
.acc-section {
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}
.acc-section:last-child { border-bottom: none; }
.acc-section-title {
  margin: 0 0 1rem; font-size: 0.78rem; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.08em;
  color: rgba(255,255,255,0.35);
}
.acc-profile-row { display: flex; align-items: center; gap: 1rem; }
.acc-avatar {
  width: 48px; height: 48px; border-radius: 50%;
  background: rgba(230,57,70,0.15);
  border: 2px solid rgba(230,57,70,0.3);
  display: flex; align-items: center; justify-content: center;
  font-size: 1rem; font-weight: 700; color: #e63946;
  flex-shrink: 0;
}
.acc-name { margin: 0 0 2px; font-weight: 600; color: #ece8e8; font-size: 1rem; }
.acc-email { margin: 0; font-size: 0.85rem; color: rgba(255,255,255,0.45); }
.acc-badge {
  display: inline-block; padding: 2px 8px;
  border-radius: 6px; font-size: 0.72rem; font-weight: 600;
  margin-top: 4px;
}
.acc-badge--google { background: rgba(66,133,244,0.15); color: #4285F4; }
.acc-form { display: flex; flex-direction: column; gap: 0.75rem; }
.acc-field { display: flex; flex-direction: column; gap: 6px; }
.acc-field label { font-size: 0.82rem; color: rgba(255,255,255,0.45); }
.acc-field input {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px; padding: 9px 12px;
  color: #ece8e8; font-family: 'Outfit', sans-serif;
  font-size: 0.92rem; outline: none; transition: 0.2s;
}
.acc-field input:focus { border-color: rgba(230,57,70,0.5); }
.acc-btn-save {
  background: rgba(230,57,70,0.15);
  border: 1px solid rgba(230,57,70,0.3);
  border-radius: 10px; padding: 9px;
  color: #e63946; font-family: 'Outfit', sans-serif;
  font-size: 0.9rem; font-weight: 600; cursor: pointer;
  transition: 0.2s;
}
.acc-btn-save:hover { background: rgba(230,57,70,0.25); }
.acc-save-msg { margin: 0; font-size: 0.82rem; min-height: 1.2rem; }
.acc-empty { font-size: 0.88rem; color: rgba(255,255,255,0.3); margin: 0; }
.acc-key-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 1rem; padding: 0.75rem 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.acc-key-row:last-child { border-bottom: none; }
.acc-key-product { margin: 0 0 2px; font-size: 0.85rem; color: rgba(255,255,255,0.6); }
.acc-key-value {
  display: block; font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem; color: #e63946;
  word-break: break-all; margin-bottom: 2px;
}
.acc-key-date { color: rgba(255,255,255,0.25); font-size: 0.72rem; }
.acc-copy-btn {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px; padding: 6px 12px;
  color: rgba(255,255,255,0.6); font-size: 0.78rem;
  cursor: pointer; transition: 0.2s; white-space: nowrap; flex-shrink: 0;
}
.acc-copy-btn:hover { background: rgba(255,255,255,0.1); color: #ece8e8; }
.acc-signout-btn {
  width: 100%; background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px; padding: 10px;
  color: rgba(255,255,255,0.45); font-family: 'Outfit', sans-serif;
  font-size: 0.9rem; cursor: pointer; transition: 0.2s;
}
.acc-signout-btn:hover { background: rgba(255,107,107,0.1); color: #ff6b6b; border-color: rgba(255,107,107,0.2); }
  `;
  document.head.appendChild(style);
})();

// ── Checkout Gate ─────────────────────────────────────────────────────────────
// Call this instead of triggering Stripe/sell.app directly.
// If user is signed in → proceeds. If not → shows auth modal, then continues.

function requireAuthThenCheckout(proceedFn) {
  const user = getCurrentUser();
  if (user) {
    proceedFn();
    return;
  }
  // Show modal; after successful sign-in, fire the checkout
  openAuthModal("login");
  window._pendingCheckout = proceedFn;
}

// Pending checkout is checked inside the real closeAuthModal (defined above).
// No duplicate needed here.

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  updateHeaderAuthUI();

  // Intercept checkout button on index.html
  const checkoutBtn = document.getElementById("checkoutBtn");
  if (checkoutBtn) {
    checkoutBtn.addEventListener("click", (e) => {
      const user = getCurrentUser();
      if (!user) {
        e.stopImmediatePropagation();
        e.preventDefault();
        openAuthModal("login");
        // After login, simulate a click on the actual sell.app button
        window._pendingCheckout = () => { checkoutBtn.click(); };
      }
      // If signed in, event bubbles normally to sell.app handler
    }, true); // capture phase so we run before sell.app's listener
  }
});

// Expose globally
window.GCAuth = {
  openAuthModal,
  closeAuthModal,
  openAccountDrawer,
  closeAccountDrawer,
  getCurrentUser,
  signOut,
  saveOrder,
  requireAuthThenCheckout,
};
