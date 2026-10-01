# Project memory

Updated: 2026-10-01 17:11 +01:00 (West Africa Time)
Project: Cohort Shop
Revision: `main` at `e4b0bd7` (pushed to GitHub `Cyrus-11/Cohort-Shop`). **13 files uncommitted** (see Current state).

## Objective and scope

Small Next.js 16 App Router/TypeScript shop: Supabase (Google auth, PostgreSQL, RLS), Paystack hosted checkout (test mode), Mailgun confirmation emails. Contract in `context/project.md`, visual direction in `context/design.md`, rules in `AGENTS.md`, setup in `README.md`. All six checklist items in `context/project.md` are ticked.

## Current state

- **Built and working (user-confirmed with real accounts):** Google sign-in, persisted cart, Paystack test checkout, result page with server verification, signed webhook, header cart count refresh after payment. Real product photos (Unsplash, IDs in `context/project.md`) in `public/products/`; hosted DB products updated to match (Utility Trousers became Straight-Leg Jeans).
- **Deployed:** Vercel project `cohort-shop`, live at `https://cohort-shop.vercel.app` (production env vars set via CLI; `APP_URL` is that URL; `vercel.json` pins region `fra1`). The live site runs the commit-`e4b0bd7`-era code, **not** the newest UI changes. Pushes to GitHub do not auto-deploy; deploy with `vercel deploy --prod`.
- **Uncommitted work (UI; lint, typecheck and 34 tests pass; screenshots checked):** "Sign in with Google" label everywhere (header shortens to "Sign in" on phones); redesigned login page (`src/app/login/page.tsx`, `login.module.css`); Google button with logo (`src/components/google-button.tsx`, `.module.css`); redesigned cart (`src/components/cart-view.tsx/.module.css`, `src/app/cart/page.tsx`, `cart.module.css`) with +/- stepper, summary panel, empty state, and a signed-out sign-in card with the Google button on the page. `AGENTS.md` also shows modified: `next dev` appended its standard Next.js agent-rules block; keep it (project rules say to preserve framework guidance).
- Not run since the UI changes: `npm run build` (needs the dev server stopped).

## Decisions and lessons

- Never run `npm run build`/`npm start` while `npm run dev` is running; they share `.next` and the dev server starts returning 404s. Fix: stop dev, delete `.next`, restart.
- Webhook handler must return 200 for signed events of other types (a 400 bug was found and fixed with a test).
- Mailgun "accepted" means handed over, not delivered. Mailgun's **sandbox domain** gets blocked by Gmail (`550 5.7.40`, DMARC alignment) and only delivers to up to 5 authorized recipients. The real fix is a verified own sending domain (SPF/DKIM); the user has no domain yet. `MAILGUN_FROM` must have a name before the `@`.
- Supabase only redirects to URLs on its Redirect URLs list; otherwise it falls back to the Site URL. Both `http://localhost:3000/auth/callback` and `https://cohort-shop.vercel.app/auth/callback` must be listed (the user's localhost sign-in recently bounced to the Vercel site, so the localhost entry is probably missing).
- Google OAuth app is in Testing mode unless the user clicks Publish (basic scopes need no Google review); otherwise only listed test users can sign in.
- `vercel link` appended a broad `.env*` line to `.gitignore` and made `.env.local`; both were undone. Turbopack dev panicked on a throwaway route; use `next dev --webpack` in an isolated copy for visual checks.
- Never copy credential values into tracked files or memory; `.env`/`.env.local` are git-ignored, `.env.example` holds placeholders only.

## Verification

- `npm test`: 34 pass (12 database against isolated PostgreSQL 16, 22 mocked app/webhook tests). Lint and typecheck pass. Last production build passed before the UI redesign.
- Live checks done: signed-webhook accept/reject/replay behaviour; anonymous visitors blocked from orders, carts, price writes, and order functions on the hosted DB; real Mailgun log inspection.
- **Unverified:** a real Paystack-sent webhook (can now use `https://cohort-shop.vercel.app/api/paystack/webhook` as the Paystack test webhook URL); two real Google accounts for ownership (covered by the database suite only); mobile layout beyond headless screenshots at about 500px; email delivery to non-sandbox recipients.

## Next steps

1. User fixes the Supabase redirect list (above), then tries sign-in again.
2. Run `npm run build` with dev stopped, commit the 13 files, push to GitHub, and `vercel deploy --prod`. The user was asked and had not yet confirmed.
3. Optional: publish the Google app; set the Paystack test webhook URL to the live endpoint and test a real webhook; get a domain and verify it in Mailgun, then update `MAILGUN_DOMAIN`/`MAILGUN_FROM` locally and in Vercel and redeploy.

## Open questions

- Does the user have or want to buy a domain for Mailgun?
- Connect the GitHub repo to Vercel for automatic deploys?
