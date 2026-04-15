// Keys page — reads order from localStorage (no server needed)

const subtitleEl = document.getElementById("keysSubtitle");
const loadingEl = document.getElementById("keysLoading");
const errorEl = document.getElementById("keysError");
const contentEl = document.getElementById("keysContent");
const keysListEl = document.getElementById("keysList");
const keysTotalEl = document.getElementById("keysTotal");
const keysCurrencyEl = document.getElementById("keysCurrency");
const historySectionEl = document.getElementById("keysHistory");
const historyListEl = document.getElementById("keysHistoryList");
const historyEmptyEl = document.getElementById("keysHistoryEmpty");

const KEY_HISTORY_STORAGE = "ghostcheats-key-history";

function formatMoney(amount) {
  return "$" + Number(amount || 0).toFixed(2);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function showError(message) {
  loadingEl.hidden = true;
  contentEl.hidden = true;
  errorEl.hidden = false;
  errorEl.textContent = message;
  subtitleEl.textContent = "We could not load keys for this session.";
}

function renderKeys(data) {
  const keys = Array.isArray(data.product_keys) ? data.product_keys : [];

  if (!keys.length) {
    showError("No product keys were found for this order.");
    return;
  }

  keysTotalEl.textContent = formatMoney(data.amount_total);
  keysCurrencyEl.textContent = String(data.currency || "usd").toUpperCase();
  subtitleEl.textContent = `Payment confirmed. ${keys.length} key${keys.length === 1 ? "" : "s"} ready to use.`;

  keysListEl.innerHTML = keys
    .map(
      (entry) => `
      <div class="key-item">
        <div>
          <p class="key-product">${escapeHtml(entry.product)}</p>
          <code class="key-value">${escapeHtml(entry.key)}</code>
        </div>
        <button type="button" class="copy-key-btn" data-key="${escapeHtml(entry.key)}">Copy Key</button>
      </div>
    `
    )
    .join("");

  loadingEl.hidden = true;
  errorEl.hidden = true;
  contentEl.hidden = false;
}

function renderHistory() {
  if (!historySectionEl) return;
  try {
    const raw = localStorage.getItem(KEY_HISTORY_STORAGE);
    const history = raw ? JSON.parse(raw) : [];
    const entries = Array.isArray(history) ? history : [];

    if (entries.length === 0) {
      historyEmptyEl.hidden = false;
      historyListEl.innerHTML = "";
      return;
    }

    historyEmptyEl.hidden = true;
    historyListEl.innerHTML = entries
      .map(
        (entry) => `
        <div class="key-item">
          <div>
            <p class="key-product">${escapeHtml(entry.product)}</p>
            <code class="key-value">${escapeHtml(entry.key)}</code>
            <small class="key-meta">${new Date(entry.created_at || Date.now()).toLocaleString()}</small>
          </div>
          <button type="button" class="copy-key-btn" data-key="${escapeHtml(entry.key)}">Copy Key</button>
        </div>
      `
      )
      .join("");
  } catch (err) {
    console.error("Failed to load key history", err);
    historyEmptyEl.hidden = false;
    historyEmptyEl.textContent = "Could not load key history.";
  }
}

const apiBaseUrl = window.APP_CONFIG && window.APP_CONFIG.apiBaseUrl
  ? String(window.APP_CONFIG.apiBaseUrl).replace(/\/$/, "")
  : "";

function getApiUrl(path) { return apiBaseUrl + path; }

// Poll /api/get-order until the webhook has delivered keys (max ~30s)
async function pollForOrder(orderId, attempts) {
  if (attempts <= 0) {
    showError("Payment confirmed but keys are taking longer than expected. Refresh in 30 seconds or contact support.");
    return;
  }
  try {
    const res  = await fetch(getApiUrl("/api/get-order?order_id=" + encodeURIComponent(orderId)));
    const data = await res.json();

    if (data.pending || !data.paid) {
      // Webhook not arrived yet — wait and retry
      loadingEl.textContent = "Confirming payment" + ".".repeat(4 - (attempts % 4));
      setTimeout(() => pollForOrder(orderId, attempts - 1), 3000);
      return;
    }

    // Got order — save to localStorage so history works, then render
    const orderForStorage = {
      product_keys: data.product_keys,
      amount_total: data.amount_total,
      currency: data.currency,
    };
    localStorage.setItem("ghostcheats-last-order", JSON.stringify(orderForStorage));
    appendKeysToHistory(data.product_keys);
    renderKeys(orderForStorage);
    renderHistory();
  } catch (err) {
    showError("Could not reach server: " + (err.message || "Unknown error"));
  }
}

function appendKeysToHistory(keys) {
  if (!Array.isArray(keys) || keys.length === 0) return;
  const KEY_HISTORY_STORAGE = "ghostcheats-key-history";
  const history = (() => {
    try { return JSON.parse(localStorage.getItem(KEY_HISTORY_STORAGE) || "[]"); } catch { return []; }
  })();
  const ts = Date.now();
  keys.forEach(entry => {
    if (entry && entry.key) history.unshift({ product: entry.product || "GhostCheats Product", key: entry.key, created_at: ts });
  });
  localStorage.setItem(KEY_HISTORY_STORAGE, JSON.stringify(history.slice(0, 100)));
}

function loadKeys() {
  const params  = new URLSearchParams(window.location.search);
  const orderId = params.get("order_id");    // sell.app redirect
  const sessionId = params.get("session_id"); // Stripe redirect

  // ── sell.app redirect: poll server until webhook delivers keys ──
  if (orderId) {
    window.history.replaceState({}, document.title, window.location.pathname);
    loadingEl.textContent = "Confirming payment...";
    pollForOrder(orderId, 10); // 10 attempts × 3s = 30s max
    return;
  }

  // ── Stripe redirect: already handled by verify-session ──
  if (sessionId) {
    window.history.replaceState({}, document.title, window.location.pathname);
    fetch(getApiUrl("/api/verify-session?session_id=" + encodeURIComponent(sessionId)))
      .then(r => r.json())
      .then(data => {
        if (!data.paid) { showError("Payment not confirmed by Stripe."); return; }
        const orderForStorage = { product_keys: data.product_keys, amount_total: data.amount_total, currency: data.currency };
        localStorage.setItem("ghostcheats-last-order", JSON.stringify(orderForStorage));
        appendKeysToHistory(data.product_keys);
        renderKeys(orderForStorage);
        renderHistory();
      })
      .catch(err => showError("Server error: " + err.message));
    return;
  }

  // ── No redirect params — read from localStorage (returning user) ──
  try {
    const raw = localStorage.getItem("ghostcheats-last-order");
    if (!raw) {
      showError("No order found. Complete a purchase first to view your keys.");
      return;
    }
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.product_keys) || data.product_keys.length === 0) {
      showError("No keys found in your last order.");
      return;
    }
    renderKeys(data);
    renderHistory();
  } catch (err) {
    showError("Could not load keys: " + (err.message || "Unknown error"));
  }
}

document.addEventListener("click", async (event) => {
  const button = event.target.closest(".copy-key-btn");
  if (!button) return;

  const key = button.dataset.key;
  if (!key) return;

  try {
    await navigator.clipboard.writeText(key);
    const originalText = button.textContent;
    button.textContent = "Copied";
    button.classList.add("copied");
    setTimeout(() => {
      button.textContent = originalText;
      button.classList.remove("copied");
    }, 1200);
  } catch (_) {
    button.textContent = "Copy failed";
  }
});

loadKeys();
