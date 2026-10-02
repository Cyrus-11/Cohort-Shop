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
3. `supabase/seed.sql` (safe to repeat; it does not overwrite existing products)

```powershell
psql -v ON_ERROR_STOP=1 -d $env:SUPABASE_DB_URL -f supabase/migrations/202609300001_shop_schema.sql
psql -v ON_ERROR_STOP=1 -d $env:SUPABASE_DB_URL -f supabase/migrations/202609300002_order_operations.sql
psql -v ON_ERROR_STOP=1 -d $env:SUPABASE_DB_URL -f supabase/seed.sql
```

Or run `node scripts/apply-migrations.mjs` (needs `psql` and `SUPABASE_DB_URL` in `.env`/`.env.local`). It refuses to run if the shop tables already exist. Do not apply the two create-table migrations twice to the same database.

Because the seed never overwrites rows, a database seeded before the photo update keeps old product names and images. Update those rows by hand, or delete the six products and re-run the seed.

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

## Behaviour to know

- Prices and totals are calculated on the server from database products, in integer kobo. The browser only sends a retry key.
- A redirect, query string or browser message never marks an order paid; only Paystack's verify API plus an exact match of reference, amount, currency and test/live mode does.
- If an email attempt times out, the order stays in `sending` (acceptance unknown) and is not resent automatically; check the Mailgun logs. If Mailgun rejects it, the order is `failed` and **Retry confirmation email** on the result page sends it again.
- Product photos are from Unsplash (free for commercial use). See `context/project.md` for the photo IDs.

See `context/project.md` for the product contract and build checklist, and `context/design.md` for the visual direction.
