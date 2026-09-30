# Project memory

Updated: 2026-09-30 19:55 +01:00 (Africa/Lagos)
Project: Cohort Shop
Revision: `master`; repository has no commit yet and the current worktree is untracked.

## Objective and current state

Build the small shop described in `context/project.md` and styled by `context/design.md`: one Next.js App Router/TypeScript app with Supabase Auth and PostgreSQL, Paystack hosted checkout, and Mailgun confirmations. Follow `AGENTS.md` and update the checklist in `context/project.md` only after verification.

- Features 1 and 2 are complete. The app scaffold, lockfile, environment template, and shared Supabase clients are present. Database migrations are in `supabase/migrations/`; `supabase/seed.sql` and `public/products/` provide six sample products with local illustrations.
- Both migrations and the seed were applied to the configured hosted Supabase project on 2026-09-30. `scripts/apply-migrations.mjs` checks the target project and requires an empty shop schema; do not rerun these initial migrations there. The seed alone is repeatable.
- Order snapshot, payment finalization, and email claim/completion functions are restricted to the server role. Checkout prices come from database products; cart revisions protect later edits from payment cleanup. Email attempts have a UUID claim token. Cart insertion uses READ COMMITTED and a per-user transaction lock for the 20-product limit.
- Feature 3 is complete (2026-09-30): Google sign-in, callback/sign-out routes, database product grid, persisted cart API and `/cart` page. The user manually confirmed sign-in and cart persistence; lint, typecheck, and build pass. Helpers are in `src/lib/auth.ts` and `src/lib/cart.ts`.
- Feature 4 is complete (user-reported Paystack test checkout worked; double-click and timeout-reconcile paths still untested): `src/lib/paystack.ts`, `src/lib/orders.ts`, `/api/checkout`, `/checkout`, `src/components/pay-button.tsx`. Lint/typecheck/build pass.
- Feature 5 code is written but unchecked: `src/lib/payments.ts` (shared finalizer + email claim), `src/lib/mailgun.ts`, `/api/payments/verify`, `/api/paystack/webhook`, `/checkout/result`. 26 tests (incl. 14 mocked in `tests/app/`), lint, typecheck, build pass. Real-provider run still needed: Paystack payment to result page, webhook via HTTPS tunnel, Mailgun email to the authorized test address, replay/refresh with no second email. Then feature 6: README and full verification.

## Verification and limits

- All 12 tests in `tests/database/schema.test.mjs` passed against an isolated PostgreSQL 16 cluster, including RLS, ownership, invalid input, pricing snapshots, concurrent cart writes, retry keys, payment finalization, and competing email claims. The harness uses minimal Supabase Auth stand-ins; it does not test Google or live providers.
- `npm run lint`, `npm run typecheck`, and `npm run build` passed after feature 2. Hosted database checks found six products, RLS on all three shop tables, and four order/email functions. With the publishable API key, six active products were readable and anonymous order reads failed with `42501`.
- Google sign-in, cart, and Paystack checkout initiation were manually confirmed by the user; no real Mailgun email, webhook, or full paid-order flow has been verified. The ignored `.env` has the Supabase app settings and database URI; Paystack and Mailgun settings have since been added to it (values not recorded here). Never copy their values into tracked files or memory.

## Next action and cautions

All six checklist items are ticked (2026-09-30). Final build passed; 34 tests pass. Not verified: a real Paystack-sent webhook through an HTTPS tunnel, and two real Google accounts for ownership (covered by the database suite only). Do not run build while `npm run dev` is running (shared `.next`). Before committing, `.env`/`.env.local` are git-ignored and `.env.example` holds placeholders only. Never copy credential values into tracked files or memory.
