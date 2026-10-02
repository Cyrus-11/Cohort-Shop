# Shop — Cohort Project

## Goal and Scope

Build a small shop website with checkout, Supabase persistence, Google sign-in configured through Google Cloud Console, Paystack payments, and Mailgun order confirmation emails.

**Chosen stack:** one Next.js App Router application, TypeScript, CSS Modules/global CSS, `@supabase/supabase-js`, `@supabase/ssr`, native fetch for Paystack, and the official Mailgun Node SDK with its required FormData dependency.

**Simple defaults:** working name “Cohort Shop”; six seeded sample products; NGN currency; Paystack test mode; Google sign-in before adding to the cart or checking out. Browsing is public. No shipping, tax calculation, inventory reservations, discounts, refunds, admin dashboard, or other login methods. These defaults can be changed if the cohort specifies otherwise.

## Pages and User Flow

| Page | Purpose |
| --- | --- |
| `/` | Product cards with image, name, description, price, and Add to cart |
| `/login` | Continue with Google; sign-out available in the site header |
| `/cart` | Persisted cart; change quantities, remove items, show total |
| `/checkout` | Review items and Google account email; Pay with Paystack |
| `/checkout/result` | Verify returned reference; show paid, pending, or unsuccessful state and order summary |

User browses → signs in → adds products → reviews checkout → pays on Paystack's hosted page → returns to the result page → server verifies payment → order becomes paid → Mailgun receives the confirmation email request. A signed webhook also confirms payment if the customer never returns.

Use a plain responsive design: header, product grid, cart, checkout summary, and feedback. Keep loading, empty cart, cancelled checkout, unavailable provider, and payment still processing states distinct. An unknown payment result must not encourage another charge; offer Check payment again.

## Planned Repository

```text
shop/
  AGENTS.md
  context/project.md
  README.md
  .env.example
  package.json
  package-lock.json
  supabase/
    migrations/
    seed.sql
  public/products/
  src/
    app/
      page.tsx
      layout.tsx
      globals.css
      login/page.tsx
      cart/page.tsx
      checkout/page.tsx
      checkout/result/page.tsx
      auth/callback/route.ts
      api/cart/route.ts
      api/checkout/route.ts
      api/payments/verify/route.ts
      api/paystack/webhook/route.ts
    components/
    lib/
      supabase/              # Browser, cookie-aware server, privileged server clients
      auth.ts
      orders.ts
      paystack.ts
      mailgun.ts
    proxy.ts                 # Or the installed version's equivalent session-refresh file
  tests/
```

This pack contains documentation only. Create application files when implementation is requested. Keep a single package; no monorepo required.

## Database and Access

Supabase Auth manages users in `auth.users`; do not build a separate password system. Commit SQL migrations and seed data. Use UUIDs and UTC timestamps.

| Table | Minimum data |
| --- | --- |
| `products` | id, name, description, image_path, price_kobo, is_active |
| `cart_items` | user_id, product_id, quantity, revision UUID; unique user/product pair |
| `orders` | id, user_id, customer_email, items JSONB snapshot, total_kobo, currency, checkout_key, payment_reference, authorization_url, payment_status, paid_at, email_status, email_attempt_at, mailgun_message_id, created_at |

An order's item snapshot stores product ID/name, unit price, quantity, and cart revision. Prices and totals are positive integers in kobo; currency is NGN. Quantities must be integers from 1 to 99. Cap each cart at 20 distinct products. Reject unknown/inactive products and an empty checkout. Use database constraints as well as request validation.

Payment state is `pending` or `paid`; unsuccessful/unknown attempts remain unpaid. Email state is `pending`, `sending`, `accepted`, or `failed`. `accepted` means Mailgun accepted the message, not guaranteed inbox delivery. Payment references are unique; `(user_id, checkout_key)` is unique for checkout retries.

Enable RLS on every public table: anyone may read active products; authenticated users may read/change their own cart and read their own orders. No customer writes to products or orders. Use a separate server-only privileged client for order operations/webhooks, after validating identity or signature. Check ownership explicitly because privileged keys bypass RLS. Never return other customers' order data.

Use small SQL functions where atomicity is needed: create the priced order snapshot from the user's cart; finalize an unpaid order and remove only cart rows whose revisions still match the snapshot; claim an email attempt. Restrict these functions to the server role and use a fixed safe search path. No extra ORM.

## Backend Contract and Checkout

| Endpoint | Behavior |
| --- | --- |
| GET `/api/cart` | Return authenticated user's cart and current product prices |
| PUT `/api/cart` | Set `{productId, quantity}` for the authenticated user; rotate cart revision |
| DELETE `/api/cart` | Remove `{productId}` belonging to the authenticated user |
| POST `/api/checkout` | Accept `{checkoutKey}` UUID; snapshot/reprice cart and initialize or resume payment; return `{orderId, authorizationUrl}` |
| POST `/api/payments/verify` | Accept `{reference}`; verify only an owned order and return its payment/email status |
| POST `/api/paystack/webhook` | Process authenticated Paystack `charge.success` notifications without customer cookies |

Normal private endpoints derive user ID/email from verified Supabase identity. Check same-origin requests for cookie-authenticated writes. Validate inputs; return 401 for unsigned users, 404 for inaccessible orders, 400 for invalid requests, and a useful generic provider error. Keep secrets/raw provider errors out of responses. Do not cache personal cart/order responses.

**Checkout:** generate one checkout key per attempt and retain it across network retries. Build the order using database prices, never browser totals. Save the pending order and reference before calling Paystack initialization with server-side secret, stored email, integer amount, NGN, and configured callback URL. Persist the returned authorization URL. Repeated requests reuse the same order; serialize initialization per order. If initialization times out, reconcile that reference before starting another transaction. A retry with a deliberately changed cart uses a new checkout key; show any unresolved payment first.

**Confirmation:** both verify and webhook paths call the same finalization logic. Call Paystack's verify endpoint and require `data.status === 'success'` plus an exact match of reference, amount, currency, and configured test/live domain to the stored order/environment. An API-level success flag alone is insufficient. Only then atomically mark paid. Preserve items added/edited since checkout by clearing only unchanged cart rows. Duplicate events return the stored outcome.

**Webhook:** read raw request bytes once; verify `x-paystack-signature` using HMAC-SHA512 and the Paystack secret with a safe comparison before parsing/processing. Invalid signatures get rejected; valid irrelevant events get 200. Return 200 after durable handling; temporary verification/database failures return a retryable non-200. Use bounded provider timeouts to stay within webhook request limits. Do not acknowledge work then launch an unawaited task in a serverless process.

## Confirmation Email

After the paid state is saved, atomically claim the order's pending email before sending. Use a simple text email with order ID, items, quantities, NGN total, and payment reference, addressed to the stored customer email. Send through Mailgun from a configured sender; persist the returned message ID and `accepted` state.

On a definite email rejection, keep the order paid and save `failed`; a later verification/webhook may retry using the same atomic claim. Concurrent processing must not send twice, and accepted messages are skipped. A timeout or crash can leave acceptance uncertain: keep `sending` and reconcile against Mailgun logs before retrying. This small demo does not promise exactly-once delivery after a process crash. Await bounded sends; no external queue or scheduled worker needed. Show “Payment confirmed; email pending” if email sending fails.

## Provider Setup and Environment

1. **Supabase:** create a hosted project; obtain URL, publishable key, and server secret key (legacy service-role key if needed). Apply committed migrations and seed six products. Configure local Site URL and allow `http://localhost:3000/auth/callback` as an app redirect.
2. **Google Cloud Console:** create a project, configure OAuth branding/audience and test users when in testing mode, then create a Web application OAuth client. Add the app origin and the exact Supabase Google provider callback URI shown in its dashboard. Put the client ID/secret into Supabase's Google provider settings. These credentials belong there, not in browser code. `/auth/callback` exchanges the code for the cookie-backed session; allow only safe internal return paths. Use Supabase's current SSR/session-refresh guidance and verified claims/user methods.
3. **Paystack:** obtain test credentials, configure callback `/checkout/result`, and webhook `/api/paystack/webhook`. Hosted checkout avoids handling card details. For webhook testing, expose the app through an HTTPS tunnel or test deployment; Paystack cannot reach localhost directly. Deployment itself is not included in this context task.
4. **Mailgun:** obtain an API key and sending domain; set matching US/EU API region and sender. For a sandbox domain, authorize and verify the demo recipient first. A custom sending domain needs its DNS setup. Use the Google test account email as the demo recipient.

Create `.env.example` with placeholders; actual values go in ignored `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
APP_URL=http://localhost:3000
PAYSTACK_SECRET_KEY=
PAYSTACK_MODE=test
MAILGUN_API_KEY=
MAILGUN_DOMAIN=
MAILGUN_FROM=
MAILGUN_API_URL=https://api.mailgun.net
```

Only the two `NEXT_PUBLIC_` values are browser configuration. Fail clearly when required settings are missing. Account setup and working credentials are needed to prove integrations; no credentials or provider configuration are included in this pack.

## Build Checklist and Acceptance

- [x] Scaffold Next.js/TypeScript; add compatible dependencies and environment examples.
- [x] Apply schema, constraints, RLS/functions, and sample-product seed.
- [x] Configure Google/Supabase auth; build listing and persisted cart.
- [x] Build checkout with server pricing, retry key, and Paystack test integration.
- [x] Add shared verification/webhook finalizer and Mailgun confirmation.
- [x] Verify the full flow and document setup in README.

Required checks: production build and lint/type checks; focused tests for tampered totals, invalid quantities, wrong owner, false payment results, wrong amount/currency/domain, invalid webhook signatures, and duplicate/concurrent confirmation. Test the real flow with Google login, Supabase persistence after refresh/sign-out/sign-in, Paystack test payment, and Mailgun receipt. Replay the webhook and refresh the result page: one order and no repeat accepted email. Cancel a payment and simulate provider/email failures; never show an unpaid order as paid. Inspect mobile and desktop layouts. Record mocked checks separately from real provider results.

**Progress:** Next.js 16 App Router and TypeScript scaffold is complete. Feature 2 includes two SQL migrations for schema/constraints/RLS and atomic order/email operations, six seeded products with local SVG assets, typed Supabase clients, and provider-specific environment validation. On 2026-09-30, all 12 tests passed against an isolated PostgreSQL 16 cluster, including concurrent cart inserts, checkout retries, conditional cart cleanup, and competing email claims; `npm run lint`, `npm run typecheck`, and `npm run build` also passed. The migrations and seed were applied to the configured hosted Supabase project using its database URI; direct database checks found six products, RLS on all three tables, and four order/email operations. A publishable-key API request saw six active products and anonymous order reads failed with `42501`. Google sign-in, the cart UI/API, checkout, payments, and email delivery remain later milestones; no payment or email integration has been tested. Next action: configure Google/Supabase authentication and build public listing plus the persisted cart.

**Feature 3 code (2026-09-30, checkbox left unchecked):** added `src/lib/auth.ts` (verified-claims user, safe `next` paths, same-origin check), `src/lib/cart.ts`, the `/api/cart` GET/PUT/DELETE handlers, `/auth/callback` and `/auth/signout`, the Google button on `/login`, a header showing the account and cart count, the database-backed product grid, and the `/cart` page. Lint, typecheck, and build pass. A production-server smoke test confirmed the home page lists seeded products, `/api/cart` returns 401 when signed out, writes without a matching `Origin` return 403, and an unsafe `next` value is not followed. **Manually verified by the user (reported, 2026-09-30):** after configuring the Google provider, Supabase Site URL and redirect URL, Google sign-in, adding items, quantity/remove changes, and cart persistence across refresh and sign-out/sign-in all worked with a test Google account. No automated test covers these routes yet. Next: feature 4 (checkout with server pricing, retry key, and Paystack test integration); Paystack credentials are still needed.

**Feature 4 code (2026-09-30, checkbox left unchecked):** added `src/lib/paystack.ts` (initialize and verify with an 8s timeout and typed failure kinds), `src/lib/orders.ts` (`startCheckout`: database snapshot via `create_order_snapshot`, initialize, save the authorization URL, reconcile after uncertain outcomes), the `/api/checkout` handler, the `/checkout` page, and a Pay button that keeps one retry key per unchanged cart in sessionStorage. Lint, typecheck, and build pass; signed-out and cross-origin requests to `/api/checkout` return 401/403. **User-reported manual test (2026-09-30):** the Paystack test checkout worked. **Not yet verified:** concurrent double-click behaviour and the timeout-reconcile path (needs a mocked provider test). `/checkout/result` is still the placeholder; the Paystack callback lands there until feature 5.

**Feature 5 code (2026-09-30, checkbox left unchecked):** added `src/lib/mailgun.ts`, `src/lib/payments.ts` (`confirmPayment`, shared by both paths: Paystack verify, exact reference/amount/currency/domain match, atomic finalize, then one claimed email send), `/api/payments/verify` (same-origin, owner-only), `/api/paystack/webhook` (raw-body HMAC-SHA512 check before parsing; 503 on temporary failure), and the `/checkout/result` page with paid/pending/unsuccessful states, separate email status, Check payment again and Retry confirmation email. `npm test` now also runs `tests/app/payments.test.mjs` (14 mocked tests); all 26 tests, lint, typecheck, and build pass. Local smoke test: invalid/missing webhook signatures return 401, unauthenticated verify returns 401. **Not yet verified with real providers:** a full Paystack test payment returning to the result page, the webhook through an HTTPS tunnel, a real Mailgun email to the authorized test address, and replaying the webhook/refreshing the result page. An email timeout leaves the order in `sending` for manual reconciliation against Mailgun logs.

**Visual polish (2026-09-30):** applied the design reference: Poppins via `next/font`, heavy uppercase headings with yellow highlight bars, hero with a yellow arch and overlapping product images, flat rounded product cards, sticky header with cart badge, black footer, and consistent buttons/panels. Checked by headless screenshots at 1200-1440px and 500px width (home, login); signed-in cart, checkout, and result pages and a 360px width were not visually inspected, and `npm run build` was not re-run after this change.

**Product photos (2026-09-30):** replaced the SVG illustrations with six real photos from Unsplash (free commercial use under the Unsplash License), cropped to 7:10 JPEGs in `public/products/`. Unsplash photo IDs: tee `xPJYL0l5Ii8`, shirt `vcTKFYNZop4`, jeans `YeGao3uk8kI`, hoodie `kJXGTOY1wLQ`, dress `6_LidIGnJqU`, jacket `QRN47la37gw`. Product names/descriptions in `supabase/seed.sql` were updated to match the photos (Utility Trousers became Straight-Leg Jeans), and the same six rows were updated in the hosted database. Existing orders keep their original snapshot names.

**Final verification so far (2026-09-30, checkbox left unchecked):** README rewritten (install, env, migrations/seed, provider setup, run, test, manual check); `.env.example` now holds only generic placeholders. `npm test` passes 34 tests (12 database, 22 mocked app tests including the real webhook route handler), plus lint and typecheck. A live signed-webhook check against the local dev server found and fixed a bug: a valid signed event of another type returned 400 instead of 200 (now covered by a test). Live checks: missing/wrong/mismatched signatures return 401; signed other-type events, unknown references, and three replays on a paid order return 200 and leave all four orders unchanged. With only the public browser key against the hosted database, reading products works, while reading orders/carts, writing carts/orders/prices, and calling the order functions are all blocked (`42501`); the product price is unchanged. Unauthenticated calls to the cart, checkout, and verify routes return 401. **Production build:** `npm run build` passed with the dev server stopped. **Still not run:** a real Paystack-sent webhook through an HTTPS tunnel (not run: needs a tunnel and dashboard setting). Two-customer ownership is covered by the database suite, not by a second real Google account.

## Official References

Consulted on 2026-09-30; check installed versions before coding:

- [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)
- [Supabase Google OAuth setup](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase SSR clients and session validation](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) and [API keys](https://supabase.com/docs/guides/api/api-keys)
- [Paystack hosted payments](https://paystack.com/docs/payments/accept-payments/), [verification](https://paystack.com/docs/payments/verify-payments/), and [webhooks](https://paystack.com/docs/payments/webhooks/)
- [Mailgun Node SDK](https://documentation.mailgun.com/docs/mailgun/sdk/nodejs_sdk) and [sandbox recipients](https://documentation.mailgun.com/docs/mailgun/user-manual/domains/domains-sandbox)

**Small UI improvements (2026-10-02):** clearer Add to cart success button, an accessible status message and View cart link; full-width product buttons on phones; 44px quantity/remove controls; stacked cart item headings and tighter mobile spacing. Verification: lint, TypeScript and diff whitespace checks passed. Production build attempted in an isolated temporary copy but did not finish; no browser/mobile visual verification or real-provider checks were performed for this change.

**Image-cache/navigation repair (2026-10-02):** added the documented smooth-scroll HTML attribute and an explicit 1 MB optimized-image disk cache limit. Next defaults to half the available disk space at initialization; the development drive reports about 8 MB free, making automatic sizing unreliable under disk pressure. Lint, typecheck, whitespace checks and a direct Next LRU check for the two reported image sizes passed. Restart dev to reinitialize the process-wide cache; runtime confirmation after restart remains outstanding.

- [x] Verify the small cart/mobile polish and image-cache repair before release.

**Release verification (2026-10-02):** final production build (including TypeScript), lint and all 34 tests passed. PostgreSQL tests required execution outside the Windows sandbox; Google-font fetching required network access. Chromium checked the real production storefront and signed-out cart at 360/390/768/1280px with no horizontal overflow; Add to cart success/failure requests were intercepted, with no database writes. Signed-in cart layout and 44px controls were checked using an isolated component fixture at 360/390/1280px, not a real Google session. Mobile screenshots were inspected. Optimized login images returned 200 and the restarted production server logged no image-cache errors; no smooth-scroll warnings or JavaScript errors appeared in the main checks. Review fixed the success button's accessible label. No new real-provider payment/email check was run. Removed only generated .next files to recover disk space; approximately 280 MB remained after verification. No actionable findings remain within the reviewed scope.
