# GhostCheats — Games & More

A smooth store for buying games and everything. Cart, filters, and **Stripe Checkout** for real payments.

## Logo

Put your GhostCheats logo image at **`assets/logo.png`**. The header will show it next to the name. If the file is missing, only the text "GhostCheats" will show.

## Run with payment (recommended)

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Stripe keys**  
   Get your keys at [dashboard.stripe.com/apikeys](https://dashboard.stripe.com/apikeys) (use Test mode for development).

3. **Create `.env`** (copy from `.env.example`):
   ```
   STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxxxx
   PORT=3000
   ```

4. **Start the server**
   ```bash
   npm start
   ```

5. Open **http://localhost:3000**. Add games to the cart and click **Pay with Stripe** — you’ll be sent to Stripe’s payment page. Use test card `4242 4242 4242 4242`.
6. After successful payment, Stripe redirects to **`/keys.html?session_id=...`** where product keys are shown and can be copied.

## Production payment setup

To let real customers pay online:

1. Deploy this project to a host that supports Node.js (Render, Railway, VPS, etc.).
2. Add environment variables on the host:
   - `STRIPE_SECRET_KEY=sk_live_...` (live key from Stripe)
   - `PORT=3000` (or host default)
   - `FRONTEND_URL=https://your-site.netlify.app` (if frontend is on Netlify)
3. In Stripe Dashboard, switch to **Live mode** and configure:
   - Business info
   - Payout bank account
   - Webhook endpoint (optional, recommended for robust order handling)
4. Use your deployed domain for checkout (the app builds success/cancel URLs from frontend origin / `FRONTEND_URL`).
5. Keep secret keys server-side only. Never expose them in frontend files.

## Netlify workaround (frontend on Netlify + payments on backend)

Netlify static hosting cannot run your Stripe secret backend code by itself.

Use this setup:

1. Deploy this repo's Node server (`server.js`) to Render/Railway/VPS.
2. On that backend host, set:
   - `STRIPE_SECRET_KEY=sk_live_...`
   - `FRONTEND_URL=https://your-site.netlify.app`
3. In this repo, edit `config.js` and set:
   - `apiBaseUrl: "https://your-backend-domain.com"`
4. Redeploy frontend to Netlify.

Then checkout works like this:
- Netlify frontend calls your backend `/api/create-checkout-session`
- Stripe payment happens on Stripe hosted page
- User is redirected back to Netlify `keys.html`
- `keys.html` calls backend `/api/verify-session` to show product keys

## Run without payment (static only)

Open `index.html` in a browser or run:

```bash
npx serve .
```

Checkout will show an error until you run the Node server with Stripe configured (see above).

## Features

- **Branding** — GhostCheats name and logo (place `assets/logo.png`)
- **Catalog** — Game cards, platform, price, sale badges, add to cart
- **Filters** — All, FiveM
- **Cart** — Slide-out drawer, persisted in `localStorage`, remove items, live total
- **Checkout** — Stripe Checkout; redirects to Stripe, then to `/keys` with generated product keys
- **Keys page** — Shows purchased keys after payment and lets users copy each key
- **Newsletter** — Email signup (demo)
- **Responsive** — Mobile and desktop

## Customize

- Edit `GAMES` in `script.js` to add products or connect an API.
- Colors and fonts: `:root` in `styles.css`.
- Replace game images with your own URLs.
