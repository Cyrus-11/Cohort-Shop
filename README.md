# Cohort Shop

A small fashion shop built with Next.js (App Router, TypeScript). Supabase provides Google sign-in and the PostgreSQL database, Paystack hosts checkout (test mode), and Mailgun sends order confirmation emails.

Flow: browse → sign in with Google → add to cart (saved in the database) → pay on Paystack → return to a result page where the server verifies the payment → order is marked paid → a confirmation email is sent. A signed Paystack webhook confirms the payment too, in case the customer never returns.

## Prerequisites

- Node.js 24 or newer and npm 11 or newer
- A Supabase project, a Google Cloud project (OAuth client), a Paystack account (test keys), and a Mailgun account
- For `npm test`: PostgreSQL 16 tools (`initdb`, `pg_ctl`, `psql`) on `PATH`, or set `SHOP_PG_BIN` to their folder

## Installation

```powershell
npm ci
copy .env.example .env.local
```

Fill `.env.local` (git-ignored). Never commit real values, and only `NEXT_PUBLIC_` variables reach the browser.

| Variable | What it is |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase project URL and publishable key |
| `SUPABASE_SECRET_KEY` | Supabase secret (server-only) key |
| `SUPABASE_DB_URL` | Optional; only for applying migrations from the command line |
| `APP_URL` | `http://localhost:3000` locally; used for redirects and the same-origin check |
| `PAYSTACK_SECRET_KEY`, `PAYSTACK_MODE` | Paystack **test** secret key (`sk_test_…`) and `test` |
| `MAILGUN_API_KEY`, `MAILGUN_DOMAIN` | Mailgun key and sending (or sandbox) domain |
| `MAILGUN_FROM` | Sender with a name before the `@`, e.g. `Cohort Shop <postmaster@your-domain>` |
| `MAILGUN_API_URL` | `https://api.mailgun.net` (US) or `https://api.eu.mailgun.net` (EU) |

## Database: migrations and seed

Apply once to an empty project, in order, in the Supabase SQL Editor or with `psql`:

1. `supabase/migrations/202609300001_shop_schema.sql`
2. `supabase/migrations/202609300002_order_operations.sql`
3. `supabase/migrations/202610020001_delivery_details.sql`
4. `supabase/migrations/202610030001_cart_sync.sql`
5. `supabase/seed.sql` (safe to repeat; it does not overwrite existing products)

```powershell
psql -v ON_ERROR_STOP=1 -d $env:SUPABASE_DB_URL -f supabase/migrations/202609300001_shop_schema.sql
psql -v ON_ERROR_STOP=1 -d $env:SUPABASE_DB_URL -f supabase/migrations/202609300002_order_operations.sql
psql -v ON_ERROR_STOP=1 -d $env:SUPABASE_DB_URL -f supabase/migrations/202610020001_delivery_details.sql
psql -v ON_ERROR_STOP=1 -d $env:SUPABASE_DB_URL -f supabase/migrations/202610030001_cart_sync.sql
psql -v ON_ERROR_STOP=1 -d $env:SUPABASE_DB_URL -f supabase/seed.sql
```

Or run `node scripts/apply-migrations.mjs` (needs `psql` and `SUPABASE_DB_URL` in `.env`/`.env.local`). It refuses to run if the shop tables already exist. Do not apply the two create-table migrations twice to the same database.

Because the seed never overwrites rows, a database seeded before the photo update keeps old product names and images. Update those rows by hand, or delete the six products and re-run the seed.

For an existing shop database, apply only `202610020001_delivery_details.sql` before deploying the delivery/history update. It adds a nullable delivery snapshot for compatibility with old orders and a new server-only checkout function signature. Old orders remain readable without an address; the old checkout function remains for rollback compatibility. Do not rerun either base migration. This migration was applied and verified on the configured hosted project on 2026-10-03.

## Provider setup

**Google sign-in**
1. In Supabase, open Authentication → Sign In / Providers → Google and copy the callback URL.
2. In Google Cloud Console, configure the OAuth consent screen (External; add your Gmail as a test user while in Testing mode) and create a **Web application** OAuth client. Authorized JavaScript origin: `http://localhost:3000`. Authorized redirect URI: the Supabase callback URL.
3. Paste the client ID and secret into Supabase's Google provider and enable it.
4. In Supabase Authentication → URL Configuration, set Site URL to `http://localhost:3000` and add `http://localhost:3000/auth/callback` to Redirect URLs.

**Paystack** — use test keys. Hosted checkout sends the customer back to `/checkout/result`. For the webhook, Paystack cannot reach localhost, so start an HTTPS tunnel (for example `cloudflared tunnel --url http://localhost:3000`) and set the Paystack test webhook URL to `<tunnel-url>/api/paystack/webhook`.

**Mailgun** — the app sends a branded HTML payment receipt and a matching plain-text version. Click/open tracking is disabled for these transactional emails. HTML styling does not fix sender authentication or guarantee inbox placement.

For sandbox testing, authorize the recipient in Mailgun and have them accept the invitation. The sandbox is restricted to authorized recipients; production delivery still needs your own sending domain.

For better delivery:

1. Add a domain you own to Mailgun (a sending subdomain such as `mail.your-domain` keeps sending configuration separate).
2. Publish the exact SPF/DKIM records shown in Mailgun and wait for verification. Keep only one SPF TXT record per hostname; merge authorized senders if a record already exists. Preserve existing mailbox MX records unless you intentionally configure Mailgun to receive mail.
3. Add DMARC for the sender domain, initially with a monitoring policy such as `p=none`, and check that the visible From domain aligns with the SPF or DKIM domain. Follow your DNS provider's hostname conventions.
4. Set `MAILGUN_DOMAIN` to the verified sending domain and `MAILGUN_FROM` to `Cohort Shop <orders@your-verified-domain>`. Do not use a Gmail/Yahoo address as the From address. Update these settings locally and in Vercel, then redeploy.
5. Make one controlled Paystack test purchase and inspect Mailgun delivery logs and the recipient's message headers (`SPF=pass`, `DKIM=pass`, `DMARC=pass`). Check inbox placement separately: Mailgun acceptance is not delivery, and authentication does not guarantee inbox placement.

References: [Mailgun domain verification](https://documentation.mailgun.com/docs/mailgun/user-manual/domains/domains-verify), [Gmail sender guidelines](https://support.google.com/mail/answer/81126?hl=en).

## Run

```powershell
npm run dev
```

Open http://localhost:3000. Do not run `npm run build` or `npm start` while `npm run dev` is running; they share the `.next` folder and the dev server will start returning 404s. If that happens, stop the server, delete `.next`, and start it again.

## Test and check

```powershell
npm test            # database suite + mocked payment/email/webhook suite
npm run lint
npm run typecheck
npm run build
```

- `tests/database` runs against an isolated temporary PostgreSQL cluster: RLS and ownership, constraints, invalid quantities, server pricing and tampered totals, checkout retries, concurrent cart writes, payment finalization, and competing email claims.
- `tests/app` uses in-memory fakes and a mocked Paystack `fetch`: unfinished and failed payments, wrong amount/currency/reference/test-live domain, another customer's order, provider outage, concurrent and repeated confirmation (one email), email rejection and timeout, and invalid webhook signatures.
- Automated tests never make real payments or send real emails.

### Manual check with real accounts

1. Sign in with Google; add items; refresh, sign out and back in — the cart persists.
2. Checkout → pay with a Paystack test card. The result page shows "Payment confirmed" and the header cart count drops to 0 without a reload.
3. The authorized address receives one confirmation email. Refresh the result page — no second email.
4. Through the tunnel, resend the `charge.success` event from the Paystack dashboard — still one order and one email.
5. Cancel a payment — the order never shows as paid and the cart is kept.
6. Enter delivery details, complete a controlled test purchase, and open **Orders**. Check the saved address, item quantities, total and payment status; another Google account must not see the order. Existing orders show the missing-details message. Confirm the receipt contains the same delivery details.

## Behaviour to know

- Website and mobile cart updates use owner-only Supabase Realtime signals, followed by a fresh authenticated cart read. The signal contains a revision, not cart or address data. The `cart_sync` table must be included in `supabase_realtime`; the migration configures this on a hosted Supabase project. Inserts/updates signal removals too, without publishing cart DELETE records. Reconnection and foreground return reload the cart; 10-second polling is a fallback. Updates are subject to network latency and Android background suspension, so keep both clients online and the app visible for the instant-sync demonstration.

- Checkout requires recipient name, phone (10–15 digits), street address, city and state/FCT for Nigeria. No delivery fee is added. Validated details are stored as an immutable order snapshot and included in payment confirmation and email receipts. Edits change the checkout retry key; network retries preserve the same key and details. Delivery form values stay on screen when a request fails and are not written to browser storage.
- **Orders** in the signed-in header opens `/orders`: ten owned orders per page, newest first, with snapshot items, totals, payment status and delivery details. Pending attempts appear as payment not confirmed and link to server verification. Old orders show that no delivery details were recorded. No shipment tracking status is implied.

- Signed-in pages refresh shared cart data after private Realtime signals, with a 10-second fallback while visible and online and a reload when returning to the tab or reconnecting. Cart contents, the header count and checkout review use the latest server data. Simultaneous quantity edits to the same product still use the last saved value.
- Prices and totals are calculated on the server from database products, in integer kobo. The browser sends a retry key and delivery details.
- A redirect, query string or browser message never marks an order paid; only Paystack's verify API plus an exact match of reference, amount, currency and test/live mode does.
- If an email attempt times out, the order stays in `sending` (acceptance unknown) and is not resent automatically; check the Mailgun logs. If Mailgun rejects it, the order is `failed` and **Retry confirmation email** on the result page sends it again.
- Product photos are from Unsplash (free for commercial use). See `context/project.md` for the photo IDs.

See `context/project.md` for the product contract and build checklist, and `context/design.md` for the visual direction.

## Android mobile app

`mobile/` is a native Expo/React Native client for the same Next.js API and Supabase project. It includes Google login, shop, shared cart, delivery checkout, server payment verification and private order history. There is one root `package-lock.json`; run installation at the repository root. React 19.2.3 is shared by the website and Expo SDK 57 for compatibility.

```powershell
npm ci
node scripts/configure-mobile.mjs  # creates ignored mobile/.env.local from only public website settings
npm run mobile:typecheck
npm run mobile:bundle             # verifies an Android JS/Hermes bundle, not an APK
```

If `mobile/.env.local` already exists, edit it directly. Its only variables are `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; never put server secrets in the app. Use the same Supabase URL/key as the website, and a reachable deployed API URL. `localhost` on a phone refers to the phone, not this computer. For a development build only, the API may use the computer's LAN HTTP address while both devices are on the same network. Release/preview builds require HTTPS.

Before testing:

1. Apply the new cart-sync migration to an existing database once (already applied and verified on the configured hosted project on 2026-10-03). Do not repeat old migrations. Deploy the updated Next.js API before pointing the app at production: the earlier deployment does not have native bearer authentication or `/api/products` and `/api/orders` yet. The phone-test APK currently uses the temporary [Preview API](https://cohort-shop-2fp9hkk5x-cyrus11s-projects.vercel.app), sharing the live website's Supabase database. This preview has only public Supabase configuration; payment initialization/verification and email sending are unavailable. Vercel Authentication was temporarily disabled with user approval for the phone test and must be restored afterward; the live custom domain was not changed.
2. In Supabase Authentication → URL Configuration → Redirect URLs, add exactly `cohortshop://auth/callback`. Preserve both website callbacks. The mobile app opens Google in the system browser with Supabase PKCE and exchanges the returned code; it uses the same Google provider/account as the website. Tokens/verifier are saved in Android encrypted SecureStore, and bearer tokens are verified on the API server. No additional Google OAuth client is needed for this browser flow.
3. Create a free Expo account and sign in using `npx eas-cli login`. Never put the password in source files or chat. From `mobile/`, run the commands below; `eas build:configure` links the app to your Expo account and records its project ID. Review any build quota/payment prompt before continuing.

```powershell
cd mobile
npx eas-cli build:configure
npx eas-cli build --platform android --profile preview  # standalone internal test APK
```

Install the resulting APK link on the physical Android phone (allow installation from that download source when Android asks). A preview APK runs without Metro. For an iterative development build, use the `development` profile instead, install its APK, then run `npm run mobile:start` at the root and connect the development client to the computer on the same network. Expo Go is not the target for the custom OAuth callback.

For a machine with JDK/Android SDK installed, `npm run android --workspace @cohort-shop/mobile` can build/install locally on a USB-debugging-enabled device. Generated `mobile/android`, `mobile/ios`, `.expo` and bundles are ignored.

### Required physical-phone check (still pending)

The [Android test APK](https://expo.dev/artifacts/eas/_40HF_cT9zXXJsB2FYqNLiL_3Clz4gG8Wyra7kKnxh0.apk) was built successfully on 2026-10-03: EAS build `affc7cd8-46e4-4175-8f7e-150295d59729`, app version 1.0.0 / code 1. It uses the temporary Preview API above. This build is compiled successfully but physical-device results are still pending.

1. Record phone model/Android version and APK build. Sign into the website and installed Android app with the exact same Google account; compare the email shown. Close/reopen the app and confirm the session is restored.
2. Keep the app's Cart screen visible and online. Add an item on the website; record elapsed time until it appears on the phone without refresh. Repeat for quantity change and removal. Record whether the app reports live sync connected.
3. Edit the cart on the phone and observe the website update. Background the app, edit on the website, return to the app and check it reloads. Test an offline/reconnect cycle without assuming queued cart writes.
4. Sign the phone out and into a different controlled Google account: the previous account's cart/history must not appear. API failures must preserve the cart and delivery form.

Automated type/build/mocked checks and controlled API/WebSocket checks do not replace this physical-device Google-login test. No phone test or APK installation is claimed until its observed results are recorded in `context/project.md`.

References: [Expo SDK compatibility](https://docs.expo.dev/versions/v57.0.0/), [Supabase mobile deep links](https://supabase.com/docs/guides/auth/native-mobile-deep-linking), [Supabase Realtime access rules](https://supabase.com/docs/guides/realtime/authorization).
