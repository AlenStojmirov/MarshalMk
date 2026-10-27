# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Marshal** (marshal.mk) — a small men's-wear shop in Vinica, Macedonia: a physical store plus an online storefront, and the back office that runs both. Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4. Customer-facing copy is Macedonian, with an English switch; code and URLs are English (D-039). Payment is cash on delivery, or store pickup.

The business is loss-making and capital is tight; the back office exists to turn that around with numbers. **Read `docs/DECISIONS.md` (D-001 …) before changing how anything is counted** — margins, sell-through, seasons, reorder, stock and the ledger all rest on decisions recorded there. `docs/TURNAROUND.md` is the strategy, `docs/BACKLOG.md` the open work.

## Commands

```bash
npm run dev               # dev server (http://localhost:3000)
npm run build             # production build — the main check; there is no test suite
npm run start             # serve the build (restart it after every rebuild)
npm run lint              # eslint
npm run migrations:check  # which Supabase migrations have landed (also probes anon access)
npm run user:role [email] [admin|staff|none]   # list or set back-office roles
npm run backup            # every table + accounts to BACKUP_DIR (outside the repo), checked; before each migration and merge to master
```

Data scripts (`tsx`, service-role key, see `scripts/SCRIPTS.md`): `baseline`, `ledger:sync`, `snapshot`, `publish:candidates`, `ageing:estimate`, `cost:backfill`, `orders:shipping`, `refresh`, `sale:set`, `category:replace`, `migrate:sale`. Temporary scripts go in `scripts/_tmp-*.ts` (from there tsx finds `node_modules` and `.env.local`; import app code as `../src/lib/...`) and are deleted after use.

## Data

**Supabase is the only store** for products, orders, the sales ledger, costs, expenses, snapshots and auth. **Firebase RTDB** is the old external inventory app, read-only: `src/lib/inventory-sync.ts` copies it into Supabase ("Sync All" in the admin) until the switchover day, after which this app is the only place sales are entered (D-012). Never add persistence to Firebase. There is no Storage bucket; product photos are files in `public/images/products/{productId}-{n}.{ext}` (`src/lib/product-images.ts`), which override `imageUrl`/`images`.

- `src/lib/supabase.ts` — browser client (anon key; admin session in localStorage). `src/lib/supabase-admin.ts` — `getSupabaseAdmin()`, service-role, **server code only**.
- Rows cross the boundary through `src/lib/db-mappers.ts` (`rowToProduct`/`productToRow`, `rowToOrder`); `productToRow` emits only set fields, so it is safe for partial updates.

### Tables and views

| Object | What it is |
|---|---|
| `products` | the catalogue; `sizes`, `sold`, `sale` are jsonb. **`sold[]` is the source of truth for sales** (D-008) |
| `products.purchase_price` | a **write-only port**: a trigger files any value in `product_costs` and leaves the column empty (008) |
| `product_costs` | purchase price per product — **admin only** |
| `products_public` | view for the storefront: customer columns of visible, in-stock products. Owner rights; the only thing anon can read (007) |
| `products_costed` | view for the back office: product + cost, reader's rights, so staff get the cost empty (008) |
| `sales_ledger` | one row per unit sold, with price and cost snapshot; kept in step with `sold[]` by `npm run ledger:sync`. A trigger fills `unit_cost` from `product_costs` |
| `orders` | online orders; `status` is the workflow, `outcome` how it ended (D-014) |
| `product_attributes` | EPIC 9, one row per product: `composition` (fibres adding up to 100 — the DB checks), `color`, `fit`, `size_advice`, `details`, `measurements` (cm per size). Back office read/write, no public read yet; kept out of `products` until Task 9.10 (010) |
| `operating_expenses`, `inventory_snapshots`, `marketing_optout`, `suppliers`, `purchases`, `purchase_lines` | admin only |
| `loyalty_settings` | EPIC 13, one row of jsonb: every number of the loyalty programme, read over `LOYALTY_DEFAULTS` key by key. Admin only; the server reads it with the service role (014) |
| `store_settings` | Task 14.2, one row of jsonb: the shop's own settings, for now `orderNotifyEmails` (who gets an e-mail for each new order), read over `STORE_DEFAULTS`. Admin only, edited at `/admin/settings`; the order route reads it with the service role (020) |
| `points_ledger`, `points_allocations` | EPIC 13, points as movements: lots (own dates, `remaining`) and debits that take from the lots expiring first; expiry is read, not written. Customer reads own rows, admin all; **every write goes through a `points_*` function** (admin or service role), never the table (015, `src/lib/points.ts`) |
| `wheel_prizes`, `wheel_spins` | EPIC 13 wheel, **off by default**. One function, `wheel_spin`, under locks per account, phone and wheel, checks the account may spin, picks a prize among those under their daily/monthly limits and gives it (coupon or points) in the same transaction — never the browser. Admin edits prizes; a customer reads own spins (018, D-035) |
| `customer_notifications` | EPIC 13 e-mails: each message claimed under a unique key (lot, coupon, year) before Brevo sends it, given back if sending fails, so the daily job (Vercel Cron → `/api/cron/notifications`, `CRON_SECRET`) never sends twice. Offers (birthday) only with consent and a signed one-click way out (019, D-036) |
| `coupons`, `coupon_redemptions` | EPIC 13. Whether a coupon may be used is the database's answer (`coupon_lookup`, again under a lock in `coupon_redeem`); one per order; a cancelled order releases its use. Admin creates/edits; a customer reads own personal coupons and own uses — public codes are not listed (016, `src/lib/coupons.ts`) |

**A column added to `products` must also be added to `products_costed`, and to `products_public` if customers may see it** — views fix their columns when created.

### Migrations

`supabase/migrations/00N_*.sql`, idempotent, **pasted by the owner into the Supabase SQL editor** (DDL cannot go through PostgREST). Write the next number, add a probe to `scripts/check-migrations.ts`, add any new table to `TABLES` in `scripts/backup.ts` (after the tables it references — until then every backup fails and names it), ask for `npm run backup` before the owner pastes it, and keep code working before the migration runs (fall back when a view/function is missing — see `useProducts.ts`, `ledger-ops.ts`). SQL can be tested locally in PGlite (`@electric-sql/pglite`, installed in the scratchpad, not the repo) with a stand-in `auth.jwt()`.

### Writing stock

Every write to `sizes`/`stock`/`sold` goes through `src/lib/stock.ts`: read fresh, compare-and-set on `updated_at` (D-013). A form must never write back the quantities it opened with — only a real count, and only onto the shelf it started from (`saveProductEdit` in `ProductForm.tsx`).

## Roles and access (D-017 … D-021)

The role is `app_metadata.role` on the Supabase user, writable only with the service-role key; it rides in the JWT, so the database enforces it too (`public.app_role()`, `is_admin()`, `is_back_office()`).

| Role | Screen | Database |
|---|---|---|
| `admin` | `/admin` — the owner's dashboard, all screens | everything |
| `staff` | `/admin` — `StaffHome` (stock, new/edit product without cost, sales without totals, orders, `/admin/catalog`) | products and `product_attributes` read/insert/update; orders read/update; ledger insert + three functions (`ledger_refund_one`, `ledger_remove_order`, `ledger_reprice_order_line`) — **never reads the ledger** (rows carry cost) |
| `marketing` | `/admin/marketing` only (EPIC 10: post preparation, no publishing) | products and `product_attributes` **read only** (`is_marketing()`, 011) — cost empty, no ledger/orders/expenses; sales per product come from `sold[]` |
| `customer` | no `/admin` at all; their page is `/account` (EPIC 13, D-033) | own `customers` row, own consents, own points and personal coupons, read only — every write through `/api/account` (service role) |
| none / unknown | blank page | nothing |

- Screen rules: `ROLE_PATHS` in `src/lib/roles.ts` (an allowlist — a new admin page is admin-only until added), enforced by `AdminGate` in `admin/layout.tsx`. **A user without a role gets no access, never staff** — Supabase sign-up is open, and customers with their own accounts (and their own screen, outside `/admin`) are planned.
- Accounts: `/admin/users` → `/api/admin/users` (service-role, checks the caller is admin): create, change role or password, delete — never your own account and never an admin; the cascade takes the account's points, coupons, spins and customer row, orders stay (D-037). `AuthContext` refreshes the session on load so a changed role applies at once.

## Storefront

- Public pages read through `src/lib/products-server.ts` (server, service-role) or the client hooks `usePublicProducts` / `useProductsByCategory` / `useCategories` (anon → `products_public`). Admin hooks `useProducts` / `useProduct` read `products_costed`. Filtering, facets and pagination are computed in-process. A product shows only if visible **and** some size has `quantity >= 1`.
- Product URL: `/product/{id}` (`src/app/product/[id]/`). Display name from `getProductDisplayName` (`src/lib/product-display.ts`) → `"{Category} - {name}"`; the supplier brand is never shown.
- Category URL: `/mens/{slug}`. The header links the raw key (`shortsJeans`), the sitemap the lowercase (`shortsjeans`); `categoryForSlug` (`product-display.ts`) names both alike and the canonical is the lowercase. An unknown slug with nothing on the shelf is a 404, decided before the page streams so the status is real (14.6).
- 404 and errors (14.6): `app/not-found.tsx` (`NotFoundContent`, in the customer's language, links to new, sale, categories), `app/error.tsx` (retry, the digest shown to match the server log), `app/global-error.tsx` (when the root layout fails: own `<html>`, inline styles, Macedonian only). A hidden product is a 404 even by direct link (`getProductById`, 14.7); a visible sold-out one is not: its page shows "нема на залиха" and similar products.
- Rules pages (13.5): `/shipping-returns`, `/privacy`, `/terms`, in `src/config/policies.ts` (path, title, **version** — change it with the text; sign-up stores the version agreed to — and `live`: footer, sitemap and indexing). Their numbers come from `shipping.ts`, `store.ts` (contacts, exchange periods) and the loyalty settings, never typed into the text. Each page carries an English translation beside the Macedonian text (the Macedonian applies); change both together.
- Customer accounts (13.6, D-033): `/account` (sign-in, profile), `/account/register`, `/account/forgot-password`, `/account/new-password`; `/api/account/register` (the order route's anti-spam layers), `/api/account/me`, `/api/account/orders` and `/api/account/checkout` (14.9: what the checkout fills in for a signed-in customer — the account's e-mail and the rest from the profile, its address included (021); never from an earlier order, which may have gone to someone else; only empty fields, all editable, for that order only). Signed in, `/account` is the customer's dashboard (13.9): points, coupons ("apply to cart" sets `CartContext.couponCode`), points history, own orders, profile; the tab rides in `?tab=` (`coupons`, `points`, …; the old Macedonian names still open the right tab); a first-visit tour (`Tour` in `src/components/Tour.tsx`, `data-tour` marks, once per account via `customers.tour_seen_at`, again from "Водич"). The role `customer` is given only to an account with none — a back-office account is never turned into a customer. One phone, one account (017). Supabase URL and e-mail templates: `docs/SUPABASE-AUTH.md`.
- Home-screen guide (14.1, 14.4): `HomeScreenGuide`, on a phone from the second page of a visit, **once** (`localStorage`), then only from the footer link — the same `Tour`, its steps drawing the browser's buttons. The way per phone, browser and Safari version is `homeScreenWay` in `src/lib/home-screen.ts` (Safari 26+ freezes iOS in its user agent; `Version/` carries Safari's own). An iPhone has no Macedonian, so its buttons are named in English.
- Cart is client-only (`CartContext`, localStorage). Prices that respect a sale: `getEffectivePrice` (`src/lib/pricing.ts`). Shipping and pickup: `src/config/shipping.ts`, `src/config/store.ts`, `priceOrder` in `src/lib/order-math.ts`.
- Order tracking (15.2, D-038): `POST /api/orders/track` takes the order number **and** the phone it was placed with (normalised), answers a wrong pair like a missing number, and returns `TrackedOrder` (`src/lib/order-track.ts`) — status, items, total, nothing about the person, no price per line (D-006). Limited per IP and per number. The confirmation page reads its order with the number and phone the checkout left in `sessionStorage`; its link alone shows only the number. `?number=` (or the old `?broj=`) fills the number on `/track-order` (the customer's e-mail links there); the phone is never in a link.

### Order creation & anti-spam

Orders are created **only** by `POST /api/orders` (service-role). Layers, in order: IP blocklist → circuit breaker → per-IP rate limit (5/min) → JSON parse → honeypot (`website`) → form timing (`_t`, ≥3s) → validation → per-email limit (3/hr), in `src/lib/rate-limit.ts`. Preserve every layer; the client form must keep sending `_t` and the honeypot.

**Prices come from the database, never from the request** (13.7): `quoteServer` in `src/lib/basket-server.ts` prices both the checkout's preview (`POST /api/cart/quote`) and the order, so the two cannot disagree; the client's subtotal is only compared and logged. Coupon and points are a member's only (signed in, e-mail confirmed, profile, not back office) and are recorded against an order id chosen before anything is written, so a later failure undoes them (`cancelOrderPoints`, `releaseOrderCoupon`). Item prices are after coupon and points (D-031), then the courier is absorbed (D-006) with the delivery decided after the coupon, before points (`priceOrder`'s third argument). The account and loyalty amounts live in `orders.customer` (`userId`, `loyalty`), like pickup and source. Once the order is in, an e-mail goes to the addresses in `store_settings` through Brevo, after the response (`after()`, `notifyShopOfOrder`), never failing the order; the customer gets their copy the same way (`confirmOrderToCustomer`, 14.5): what tracking shows, no street or phone, replies to the shop's address. After every status or outcome change the orders screen calls `POST /api/orders/loyalty`, a server sync (`syncOrderLoyalty`, safe to repeat) that returns the points and the coupon of a cancelled order, starts the waiting period of a delivered one and confirms the phone (13.8).

## Business logic (back office)

Cost and margin `src/lib/cost.ts` (Firebase stores purchase price **×2**; `realPurchasePrice` halves it — D-002), seasons per raw category `src/lib/seasons.ts`, velocity classes `velocity.ts`, reorder plan `reorder.ts` (whole size series, never by the size: `series.ts`, D-029), open-to-buy `open-to-buy.ts` (720.000 den. stock target at cost, break-even = opex ÷ margin, budget = next 30 days' cost of goods − the excess over target, or + a third of the shortfall, split by raw category with the groups only as headings, a share on under 20 sales marked an estimate — D-023, D-028, D-030), markdown ladder `markdown.ts`, customers by normalised phone `customers.ts`, ledger `sales-ledger.ts` / `ledger-ops.ts`, product attributes vocabulary (fibres, colours with Macedonian gender forms, fits, per-category fields and measurements) `attributes.ts`, loyalty programme (online only, 1 point = 1 den., discount band measured against the regular price, every discount together at most 50% and never below the floor — D-031, D-032) `loyalty-settings.ts`, its numbers editable at `/admin/loyalty`; the basket under it (sale → coupon → points → limits, delivery decided after the coupon and before points) `quoteBasket` in `loyalty.ts`, pure, server only — the browser gets `publicQuote`. Thresholds live as named constants in those files — change them there, not inline.

## i18n

D-039. Code, file and folder names, URLs, query parameters and anchors are English; what a person reads is Macedonian, and on the storefront English too.

- **Storefront:** every text a customer sees is a key in `src/lib/i18n/translations/{mk,en}.json`, in **both** files, read with `useTranslation()` → `{ t, language, price, number, date }`. Prices, numbers and dates go through `price`/`number`/`date` ("1.500 ден." / "1,500 MKD"), never `toFixed` or `toLocaleString`. Labels for screen readers (`aria-label`, `alt`) too.
- **Server messages** a customer reads (API `error`, field errors, coupon and points reasons) come in the page's language: client requests carry `x-language` (`languageHeaders()`; `accountFetch` adds it), routes answer with `apiSay(req)` (`errors.api.*`) or pass `requestLanguage(req)` on; no header means Macedonian. Outside React: `translate` (`src/lib/i18n/messages.ts`) and `formatPrice`/`formatNumber`/`formatDate` (`src/lib/i18n/format.ts`).
- **Macedonian addresses the customer as "Вие"** (D-039): sentences, hints and messages ("Внесете…", "Имате N поени", lowercase "ве/ви/ваш" mid-sentence); short button and menu labels on the site stay commands ("Додај во кошничка", "Најави се"). E-mails (buttons included), the rules pages and the Instagram post copy (`post-copy.ts`) too.
- **Macedonian only:** the back office (`LanguageProvider fixed="mk"` in `admin/layout.tsx`; recent screens use inline Macedonian copy — follow the file you are in), e-mails, `global-error.tsx`, page `metadata` (Task 9.7), and data from the database.
- A new customer page gets an English address; an old address that has been live is redirected for good in `next.config.ts`.
- Some category labels are duplicated as inline maps (`CATEGORY_LABELS` in `product-display.ts`, `MK_CATEGORY_LABELS` on the product page).

## SEO

`src/app/layout.tsx` (metadata, hreflang, JSON-LD), `sitemap.ts`, `robots.ts`, `public/llms.txt` / `llms-full.txt`. Canonical base `https://marshal.mk`. Admin is `noindex`.

JSON-LD goes into its `<script>` only through `jsonLd()` (`src/lib/json-ld.ts`), never a bare `JSON.stringify`: a `</script>` in a product name, or in a category slug typed into the URL, would otherwise run as code (15.3). Security headers for every response (frames denied, `nosniff`, referrer, permissions) are in `next.config.ts`.

## Conventions

- App Router; dynamic `params` are `Promise`s — `await params`. A `page.tsx` may only export the page (move shared components to `src/components/`).
- Tailwind utilities; `src/app/globals.css` for globals. `@/*` → `src/*`.
- Numbers and dates in code that may run in a customer's browser: `mkNumber` / `mkDen` / `mkDate` (`src/lib/mk-format.ts`) — many browsers lack `mk` locale data and `toLocaleString('mk-MK')` prints 1,500 and 11/8/2026.
- `'use client'` for anything touching the browser Supabase client or Contexts; the service-role key never enters a client file.
- Commits explain the why; decisions that change how something is counted or who may do what get a `D-0NN` entry in `docs/DECISIONS.md`.
