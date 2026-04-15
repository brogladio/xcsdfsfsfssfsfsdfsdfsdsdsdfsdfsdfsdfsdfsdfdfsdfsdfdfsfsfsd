require("dotenv").config();
const crypto  = require("crypto");
const path    = require("path");
const fs      = require("fs");
const express = require("express");

const stripe = process.env.STRIPE_SECRET_KEY
  ? require("stripe")(process.env.STRIPE_SECRET_KEY)
  : null;

const app  = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || "*";

// sell.app webhook secret — get from sell.app Dashboard > Settings > Webhooks
const SELLAPP_WEBHOOK_SECRET = process.env.SELLAPP_WEBHOOK_SECRET || "";

// ── Persistent order store ────────────────────────────────────────────────────
const ORDERS_FILE = path.join(__dirname, "orders.json");

function readOrders() {
  try { return JSON.parse(fs.readFileSync(ORDERS_FILE, "utf-8")); }
  catch { return {}; }
}
function writeOrders(data) {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(data, null, 2), "utf-8");
}
function saveOrder(orderId, orderData) {
  const orders = readOrders();
  orders[orderId] = orderData;
  writeOrders(orders);
}
function getOrder(orderId) {
  return readOrders()[orderId] || null;
}
function saveOrderForEmail(email, orderData) {
  const orders = readOrders();
  const k = "email:" + email.toLowerCase().trim();
  if (!orders[k]) orders[k] = [];
  const exists = orders[k].some(o => o.sellapp_order_id === orderData.sellapp_order_id);
  if (!exists) orders[k].unshift(orderData);
  writeOrders(orders);
}
function getOrdersForEmail(email) {
  return readOrders()["email:" + email.toLowerCase().trim()] || [];
}

// ── Key pool ──────────────────────────────────────────────────────────────────
const KEYS_POOL_FILE = path.join(__dirname, "keys-pool.txt");

function readKeyPool() {
  try {
    return fs.readFileSync(KEYS_POOL_FILE, "utf-8")
      .split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));
  } catch { return []; }
}
function removeKeyFromPool(key) {
  try {
    const lines = fs.readFileSync(KEYS_POOL_FILE, "utf-8").split("\n");
    let removed = false;
    const updated = lines.filter(l => {
      if (!removed && l.trim() === key) { removed = true; return false; }
      return true;
    });
    fs.writeFileSync(KEYS_POOL_FILE, updated.join("\n"), "utf-8");
  } catch (err) { console.warn("keys-pool.txt update failed:", err.message); }
}
function takeKey(productName) {
  const pool = readKeyPool();
  if (pool.length > 0) {
    const key = pool[0];
    removeKeyFromPool(key);
    console.log(`Key issued: ${key} (${pool.length - 1} remaining)`);
    return key;
  }
  const prefix = String(productName || "").toLowerCase().includes("legit") ? "FVML" : "FVMR";
  const rand = crypto.randomBytes(10).toString("hex").toUpperCase();
  const key = `${prefix}-${rand.slice(0,5)}-${rand.slice(5,10)}-${rand.slice(10,15)}-${rand.slice(15,20)}`;
  console.warn("Pool empty — fallback key:", key);
  return key;
}

// ── sell.app signature check ──────────────────────────────────────────────────
function verifySellappSignature(rawBody, signature) {
  if (!SELLAPP_WEBHOOK_SECRET) {
    console.warn("SELLAPP_WEBHOOK_SECRET not set — skipping check (unsafe for production)");
    return true;
  }
  const expected = crypto.createHmac("sha256", SELLAPP_WEBHOOK_SECRET)
    .update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature || ""));
  } catch { return false; }
}

// ── Express setup ─────────────────────────────────────────────────────────────
// Raw body for webhook — MUST be before express.json()
app.use("/api/sellapp-webhook", express.raw({ type: "application/json" }));
app.use(express.static(path.join(__dirname)));

app.use((req, res, next) => {
  const origin  = req.get("origin") || "";
  const allowed = FRONTEND_URL === "*" ? (origin || "*") : FRONTEND_URL;
  res.setHeader("Access-Control-Allow-Origin", allowed);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json());

// ── sell.app Webhook endpoint ─────────────────────────────────────────────────
//
// SETUP:
//  1. sell.app Dashboard → Settings → Webhooks → Add Endpoint
//  2. URL: https://your-server.com/api/sellapp-webhook
//  3. Events to subscribe: order.paid
//  4. Copy the webhook secret shown → paste into .env as SELLAPP_WEBHOOK_SECRET
//  5. In sell.app product settings, set Success URL to:
//     https://your-site.com/keys.html?order_id={order_id}
//     (sell.app replaces {order_id} with the actual order uniqid)
//
app.post("/api/sellapp-webhook", (req, res) => {
  const sig  = req.headers["x-sellapp-signature"] || req.headers["x-webhook-signature"] || "";
  const body = req.body; // raw Buffer

  if (!verifySellappSignature(body, sig)) {
    console.warn("Webhook rejected: bad signature");
    return res.status(401).json({ error: "Invalid signature" });
  }

  let event;
  try { event = JSON.parse(body.toString("utf-8")); }
  catch { return res.status(400).json({ error: "Invalid JSON" }); }

  console.log("sell.app webhook:", event.type || event.event);

  const eventType = event.type || event.event || "";
  if (eventType === "order.paid" || eventType === "order.completed") {
    handleSellappOrder(event.data || event);
  }

  res.json({ received: true }); // respond fast so sell.app doesn't retry
});

function handleSellappOrder(data) {
  try {
    const orderId  = String(data.uniqid || data.id || crypto.randomUUID());
    const email    = String(data.customer?.email || data.email || "").toLowerCase().trim();
    const product  = String(data.product?.title  || data.title  || "GhostCheats Product");
    const quantity = Math.max(1, Number(data.quantity) || 1);
    const total    = Number(data.total || data.price || 0);
    const currency = String(data.currency || "USD").toUpperCase();

    if (getOrder(orderId)) {
      console.log(`Order ${orderId} already processed — skipping (idempotent)`);
      return;
    }

    const product_keys = [];
    for (let i = 0; i < quantity; i++) {
      product_keys.push({ product, key: takeKey(product) });
    }

    const order = {
      paid: true, source: "sellapp",
      sellapp_order_id: orderId,
      email, product, quantity,
      amount_total: total, currency,
      product_keys,
      created_at: Date.now(),
    };

    saveOrder(orderId, order);
    if (email) saveOrderForEmail(email, order);

    console.log(`Order ${orderId}: ${product_keys.length} key(s) → ${email || "no email"}`);
  } catch (err) {
    console.error("handleSellappOrder error:", err.message);
  }
}

// ── GET /api/get-order ────────────────────────────────────────────────────────
// Called by keys.html after sell.app redirects back to:
//   /keys.html?order_id=UNIQID
// or by account page to fetch all orders for a logged-in user's email.
app.get("/api/get-order", (req, res) => {
  if (req.query.order_id) {
    const order = getOrder(req.query.order_id);
    if (!order) {
      // Webhook may still be in-flight — tell frontend to retry
      return res.status(202).json({ pending: true, message: "Payment processing, please wait..." });
    }
    return res.json(order);
  }
  if (req.query.email) {
    return res.json({ orders: getOrdersForEmail(req.query.email) });
  }
  res.status(400).json({ error: "Provide order_id or email" });
});

// ── Stripe routes (unchanged) ─────────────────────────────────────────────────
app.post("/api/free-checkout", async (req, res) => {
  const { items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0)
    return res.status(400).json({ error: "Cart is empty" });
  try {
    const orderId = crypto.randomUUID();
    const product_keys = [];
    for (const item of items) {
      for (let i = 0; i < Math.max(1, Number(item.quantity) || 1); i++)
        product_keys.push({ product: item.title, key: takeKey(item.title) });
    }
    const order = {
      paid: true, source: "free", amount_total: 0, currency: "USD",
      line_items: items.map(i => ({ name: i.title, quantity: i.quantity || 1, amount: 0 })),
      product_keys, created_at: Date.now(),
    };
    saveOrder(orderId, order);
    res.json({ order_id: orderId, product_keys });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/verify-order", (req, res) => {
  const order = getOrder(req.query.order_id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  res.json(order);
});

app.post("/api/create-checkout-session", async (req, res) => {
  if (!stripe) return res.status(500).json({ error: "Stripe not configured" });
  const { items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0)
    return res.status(400).json({ error: "Cart is empty" });

  const origin = req.get("origin") || "";
  let base = FRONTEND_URL !== "*" ? FRONTEND_URL.replace(/\/$/, "") : `http://localhost:${PORT}`;
  if (/^https?:\/\//i.test(origin)) base = origin.replace(/\/$/, "");

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: items.map(i => ({
        price_data: {
          currency: "usd",
          product_data: { name: i.title },
          unit_amount: Math.round(Number(i.price) * 100),
        },
        quantity: i.quantity || 1,
      })),
      success_url: `${base}/keys.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${base}/?canceled=true`,
      metadata: { source: "ghostcheats-store" },
    });
    res.json({ url: session.url });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/verify-session", async (req, res) => {
  if (!stripe || !req.query.session_id)
    return res.status(400).json({ error: "Not configured or missing session_id" });
  try {
    const session = await stripe.checkout.sessions.retrieve(req.query.session_id, {
      expand: ["line_items.data.price.product"],
    });
    if (session.payment_status !== "paid")
      return res.status(400).json({ error: "Payment not completed" });

    const items = session.line_items?.data || [];
    const product_keys = items.flatMap(item =>
      Array.from({ length: item.quantity || 1 }, () => ({
        product: item.price?.product?.name || "Item",
        key: takeKey(item.price?.product?.name),
      }))
    );
    res.json({
      paid: true,
      amount_total: session.amount_total / 100,
      currency: session.currency,
      line_items: items.map(i => ({ name: i.price?.product?.name || "Item", quantity: i.quantity, amount: i.amount_total / 100 })),
      product_keys,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Pages ─────────────────────────────────────────────────────────────────────
app.get("/",     (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/keys", (req, res) => res.sendFile(path.join(__dirname, "keys.html")));

app.listen(PORT, () => {
  console.log(`\nGhostCheats running → http://localhost:${PORT}`);
  console.log(`Key pool: ${readKeyPool().length} key(s)`);
  console.log(`sell.app webhook: ${SELLAPP_WEBHOOK_SECRET ? "secret configured ✓" : "⚠ SELLAPP_WEBHOOK_SECRET not set"}`);
  if (!stripe) console.log("Stripe: not configured (sell.app only mode)");
});
