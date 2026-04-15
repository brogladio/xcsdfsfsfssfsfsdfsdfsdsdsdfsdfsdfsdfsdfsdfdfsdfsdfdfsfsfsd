// GhostCheats catalog — cheats, spoofers, keys
const GAMES = [
  {
    id: 1,
    title: "FiveM Rage (Lifetime)",
    platform: "FiveM",
    category: "fivem",
    price: 25,
    oldPrice: 49.99,
    image: "assets/Screenshot 2026-02-27 180053.png",
    badge: "Sale",
  },
  {
    id: 2,
    title: "FiveM Legit (Lifetime)",
    platform: "FiveM",
    category: "fivem",
    price: 35,
    image: "assets/fivem-legit.png",
  },
  {
    id: 3,
    title: "Ghost Executor (Lifetime)",
    platform: "Roblox",
    category: "roblox",
    price: 15,
    image: "assets/pikzels_e5c7a895-cff6-41ea-b166-5bbca0fc6f45_17735227323603787800314.png",
  },
  {
    id: 4,
    title: "Fortnite Rage (Lifetime)",
    platform: "Fortnite",
    category: "fortnite",
    price: 30,
    image: "assets/fortnite.jpg",
  },
  {
    id: 5,
    title: "Roblox Multi-Tool (Lifetime)",
    platform: "Roblox",
    category: "roblox",
    price: 10,
    image: "assets/roblox.png",
  },
  {
    id: 6,
    title: "FiveM Internal (Lifetime)",
    platform: "FiveM",
    category: "fivem",
    price: 45,
    image: "assets/fivem-legit.png",
  },
  {
    id: 7,
    title: "Fortnite Esp (Lifetime)",
    platform: "Fortnite",
    category: "fortnite",
    price: 20,
    image: "assets/fortnite.jpg",
  },
  {
    id: 8,
    title: "Roblox Script Pack (Lifetime)",
    platform: "Roblox",
    category: "roblox",
    price: 5,
    image: "assets/roblox.png",
  },
  {
    id: 9,
    title: "Ghost Spoofer (Lifetime)",
    platform: "Windows",
    category: "spoof",
    price: 25,
    image: "assets/hwid.png",
    badge: "New",
  },
];

let cart = [];
let currentCategory = "fivem";

const catalogGrid = document.getElementById("catalogGrid");
const cartDrawer = document.getElementById("cartDrawer");
const cartBtn = document.getElementById("cartBtn");
const cartClose = document.getElementById("cartClose");
const cartBackdrop = document.getElementById("cartBackdrop");
const cartItems = document.getElementById("cartItems");
const cartTotal = document.getElementById("cartTotal");
const cartCount = document.getElementById("cartCount");
const checkoutBtn = document.getElementById("checkoutBtn");
const newsletterForm = document.getElementById("newsletterForm");
const apiBaseUrl = window.APP_CONFIG && window.APP_CONFIG.apiBaseUrl
  ? String(window.APP_CONFIG.apiBaseUrl).replace(/\/$/, "")
  : "";

const KEY_POOL_STORAGE = "ghostcheats-key-pool";
const KEY_HISTORY_STORAGE = "ghostcheats-key-history";
const USED_KEYS_STORAGE = "ghostcheats-used-keys";

function getApiUrl(path) {
  return `${apiBaseUrl}${path}`;
}

function readArrayFromStorage(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function writeArrayToStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function normalizeKeys(list) {
  return (Array.isArray(list) ? list : [])
    .map((key) => (typeof key === "string" ? key.trim() : ""))
    .filter((key) => key.length > 0);
}

function syncKeyPool() {
  const runtimePools = window.KEY_POOL || {};
  const storedPools = readArrayFromStorage(KEY_POOL_STORAGE) || {};
  const usedKeys = new Set(normalizeKeys(readArrayFromStorage(USED_KEYS_STORAGE)));

  const finalPools = {};

  // Products to sync (by title or ID)
  const products = GAMES.map(g => g.title);
  
  products.forEach(title => {
    const rPool = normalizeKeys(runtimePools[title] || []);
    const sPool = normalizeKeys(storedPools[title] || []);
    
    let pool = sPool.filter((key) => !usedKeys.has(key));
    const poolSet = new Set(pool);

    rPool.forEach((key) => {
      if (!poolSet.has(key) && !usedKeys.has(key)) {
        pool.push(key);
        poolSet.add(key);
      }
    });
    finalPools[title] = pool;
  });

  window.KEY_POOL = finalPools;
  localStorage.setItem(KEY_POOL_STORAGE, JSON.stringify(finalPools));
  return finalPools;
}

function generateFallbackKey(productTitle) {
  const prefix = String(productTitle || "").toLowerCase().includes("legit") ? "FVML" : "FVMR";
  const length = 20;
  let randomHex = "";
  if (window.crypto && window.crypto.getRandomValues) {
    const bytes = new Uint8Array(length);
    window.crypto.getRandomValues(bytes);
    randomHex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  } else {
    randomHex = Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16))
      .join("")
      .toUpperCase();
  }
  return `${prefix}-${randomHex.slice(0, 4)}${randomHex.slice(4, 8)}-${randomHex.slice(8, 12)}-${randomHex.slice(12, 16)}-${randomHex.slice(16, 20)}`;
}

function takeKey(productTitle) {
  const pools = syncKeyPool();
  const pool = pools[productTitle] || [];
  
  if (pool.length === 0) {
    const fallback = generateFallbackKey(productTitle);
    const used = readArrayFromStorage(USED_KEYS_STORAGE);
    used.push(fallback);
    writeArrayToStorage(USED_KEYS_STORAGE, used);
    return fallback;
  }

  const [key, ...rest] = pool;
  window.KEY_POOL[productTitle] = rest;
  localStorage.setItem(KEY_POOL_STORAGE, JSON.stringify(window.KEY_POOL));

  const usedKeys = readArrayFromStorage(USED_KEYS_STORAGE);
  usedKeys.push(key);
  writeArrayToStorage(USED_KEYS_STORAGE, usedKeys);
  return key;
}

function appendKeysToHistory(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return;
  const history = readArrayFromStorage(KEY_HISTORY_STORAGE);
  const timestamp = Date.now();
  entries.forEach((entry) => {
    if (entry && entry.key) {
      history.unshift({
        product: entry.product || "GhostCheats Product",
        key: entry.key,
        created_at: timestamp,
      });
    }
  });
  // Keep last 100 entries to avoid unbounded growth
  writeArrayToStorage(KEY_HISTORY_STORAGE, history.slice(0, 100));
}

syncKeyPool();

// Load cart from localStorage
function loadCart() {
  try {
    const saved = localStorage.getItem("ghostcheats-cart");
    if (saved) {
      const parsed = JSON.parse(saved);
      cart = Array.isArray(parsed)
        ? parsed.filter((item) => GAMES.some((game) => game.id === item.id))
        : [];
    }
  } catch (_) {}
  renderCartUI();
}

function saveCart() {
  localStorage.setItem("ghostcheats-cart", JSON.stringify(cart));
  renderCartUI();
}

function formatPrice(n) {
  return "$" + Number(n).toFixed(2);
}

async function readJsonResponse(response) {
  const raw = await response.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (_) {
    throw new Error("Server returned an invalid response. Check your backend logs.");
  }
}

function getFilteredGames() {
  if (currentCategory === "all") return GAMES;
  return GAMES.filter((g) => g.category === currentCategory);
}

function renderCatalog() {
  const games = getFilteredGames();
  catalogGrid.innerHTML = games
    .map((game, i) => {
      const inCart = cart.some((c) => c.id === game.id);
      const priceBlock =
        game.oldPrice != null
          ? `<span class="game-card-price old">${formatPrice(game.oldPrice)}</span><span class="game-card-price">${formatPrice(game.price)}</span>`
          : `<span class="game-card-price">${formatPrice(game.price)}</span>`;
      const badge = game.badge ? `<span class="game-card-badge">${game.badge}</span>` : "";
      return `
        <article class="game-card" data-id="${game.id}" style="animation-delay: ${i * 0.05}s">
          <div class="game-card-image">
            <img src="${game.image}" alt="${game.title}" loading="lazy" />
            <div class="game-card-overlay">
              ${badge}
              <div class="game-card-content">
                <div class="game-card-platform">${game.platform}</div>
                <h3 class="game-card-title">${game.title}</h3>
                <div class="game-card-actions">
                  <div class="game-card-price-group">${priceBlock}</div>
                  <button type="button" class="game-card-add ${inCart ? "added" : ""}" data-id="${game.id}" ${inCart ? "disabled" : ""}>
                    ${inCart ? "In cart" : "Add to cart"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  catalogGrid.querySelectorAll(".game-card-add").forEach((btn) => {
    btn.addEventListener("click", () => addToCart(Number(btn.dataset.id)));
  });
}

function addToCart(id) {
  const game = GAMES.find((g) => g.id === id);
  if (!game || cart.some((c) => c.id === id)) return;
  cart.push({ id: game.id, title: game.title, price: game.price, image: game.image });
  saveCart();
  renderCatalog();
  cartDrawer.classList.add("open");
  document.body.style.overflow = "hidden";
}

function removeFromCart(id) {
  cart = cart.filter((c) => c.id !== id);
  saveCart();
  renderCatalog();
}

function renderCartUI() {
  cartCount.textContent = cart.length;

  if (cart.length === 0) {
    cartItems.innerHTML = '<p class="cart-empty">Your cart is empty. Add cheats or spoofers above.</p>';
    cartTotal.textContent = "$0.00";
    checkoutBtn.disabled = true;
    return;
  }

  const total = cart.reduce((sum, c) => sum + c.price, 0);
  cartTotal.textContent = formatPrice(total);
  checkoutBtn.disabled = false;

  // Ensure the main Buy Now button always points to the first item in the cart
  const firstItem = cart[0];
  if (firstItem && checkoutBtn) {
    checkoutBtn.setAttribute("data-sell-store", "74802");
    checkoutBtn.setAttribute("data-sell-theme", "");
    checkoutBtn.setAttribute("data-sell-darkmode", "true");
      if (firstItem.id === 1) {
        checkoutBtn.setAttribute("data-sell-product", "352940");
      } else if (firstItem.id === 2) {
        checkoutBtn.setAttribute("data-sell-product", "352938");
      } else if (firstItem.id === 3) {
        checkoutBtn.setAttribute("data-sell-product", "353267");
        checkoutBtn.setAttribute("data-sell-darkmode", "true");
      }
  }

  cartItems.innerHTML = cart
    .map(
      (item) => `
      <div class="cart-item" data-id="${item.id}">
        <div class="cart-item-image">
          <img src="${item.image}" alt="${item.title}" />
        </div>
        <div class="cart-item-details">
          <div class="cart-item-title">${item.title}</div>
          <div class="cart-item-price">${formatPrice(item.price)}</div>
        </div>
        <button type="button" class="cart-item-remove" data-id="${item.id}" aria-label="Remove">✕</button>
      </div>
    `
    )
    .join("");

  cartItems.querySelectorAll(".cart-item-remove").forEach((btn) => {
    btn.addEventListener("click", () => removeFromCart(Number(btn.dataset.id)));
  });
}

function closeCart() {
  cartDrawer.classList.remove("open");
  document.body.style.overflow = "";
}

// Filters
const categoryCards = document.querySelectorAll(".category-card");
categoryCards.forEach((card) => {
  card.addEventListener("click", () => {
    document.querySelector(".category-card.active").classList.remove("active");
    card.classList.add("active");
    currentCategory = card.dataset.category;
    renderCatalog();
  });
});

// Cart open/close
cartBtn.addEventListener("click", () => {
  cartDrawer.classList.add("open");
  document.body.style.overflow = "hidden";
});
cartClose.addEventListener("click", closeCart);
cartBackdrop.addEventListener("click", closeCart);

// Newsletter
newsletterForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const input = newsletterForm.querySelector('input[type="email"]');
  const email = input.value.trim();
  if (!email) return;
  alert("Thanks! We'll send deals to " + email);
  input.value = "";
});

// Payment success/cancel from Stripe redirect
const urlParams = new URLSearchParams(window.location.search);
const successBanner = document.getElementById("successBanner");
const successBannerText = document.getElementById("successBannerText");
const successBannerClose = document.getElementById("successBannerClose");

if (urlParams.get("success") === "true") {
  const sessionId = urlParams.get("session_id");
  cart = [];
  saveCart();
  renderCatalog();
  window.history.replaceState({}, document.title, window.location.pathname);

  if (successBanner && successBannerText) {
    successBanner.hidden = false;
    successBannerText.textContent = "Your order is complete. Check your email for the receipt.";
    if (sessionId) {
      fetch(getApiUrl("/api/verify-session?session_id=" + encodeURIComponent(sessionId)))
        .then((r) => r.json())
        .then((data) => {
          if (data.paid && data.line_items && data.line_items.length) {
            const list = data.line_items.map((i) => i.name + (i.quantity > 1 ? " × " + i.quantity : "")).join(", ");
            successBannerText.textContent = "You bought: " + list + ". Total: $" + data.amount_total.toFixed(2) + ".";
          }
        })
        .catch(() => {});
    }
  }
}
if (urlParams.get("canceled") === "true") {
  window.history.replaceState({}, document.title, window.location.pathname);
}

if (successBannerClose && successBanner) {
  successBannerClose.addEventListener("click", () => {
    successBanner.hidden = true;
  });
}

// Init
loadCart();
renderCatalog();

// Close cart on Escape
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && cartDrawer.classList.contains("open")) closeCart();
});
