# Shop — Agent Instructions

## Read First

Read `context/project.md` before implementation. This is a small cohort project: keep its documentation and code proportional to the scope. Do not introduce additional context files without a concrete need.

## Stack and Structure

One Next.js App Router application with TypeScript handles the UI and backend. Use Supabase for PostgreSQL and Google authentication, Paystack for hosted checkout, and Mailgun for order confirmation emails. No separate NestJS application.

Use the folder layout in the project document. Choose compatible stable package versions at implementation time, commit one lockfile, and follow the installed versions' official documentation. Preserve applicable framework-generated agent guidance; consult bundled Next.js docs when present.

## Rules

- Build only the specified shop, cart, checkout, sign-in, and confirmation flow.
- Use Supabase as the source of truth for products, carts, and orders. No mock persistence or localStorage-only cart.
- Validate Google identity on the server; check ownership on every private request. Never authorize from client-supplied user IDs or unverified session data.
- Enable row-level security. Customers cannot write product prices, orders, payment status, or email status directly.
- Calculate checkout prices on the server from database products. Store integer kobo, immutable order snapshots, and unique payment references.
- Verify Paystack payments on the server. A redirect, query parameter, or browser message cannot mark an order paid.
- Validate webhook signatures before processing. Repeated callbacks/webhooks must not create another order or run concurrent email sends for the same order.
- Keep Supabase secret keys, Paystack secrets, and Mailgun credentials in server-only modules and environment variables. Commit only `.env.example` placeholders.
- Keep handlers thin; put reusable payment and email logic in `src/lib`. Use Node runtime for payment/email routes.
- Show clear loading, empty, pending-payment, and failure states. Disable duplicate submissions; preserve the cart if checkout fails.
- Use simple responsive styles, labeled controls, and keyboard access. No extra state library, UI framework, ORM, queue service, or admin dashboard is needed.
- Do not send real payments or customer emails during automated tests. Use mocks for failures and controlled test accounts for integration checks.

## Workflow and Completion

Follow the short checklist in `context/project.md`. After each completed step, update its checkbox and the progress note with actual verification. Do not claim integrations work until tested with configured accounts.

If an integration cannot run because credentials or provider setup are missing, finish the code that can be completed, then record the exact setup still needed. Never fabricate successful payments or emails.

Deliver a short README with installation, configuration, migrations/seed, run, and test commands. Verify the core flow, ownership rules, payment tampering, and duplicate notifications. Keep this context pack as two Markdown files unless the project later grows.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
