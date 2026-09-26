# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Marshal** (marshal.mk) — a small men's-wear shop in Vinica, Macedonia: a physical store plus an online storefront, and the back office that runs both. Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4. Customer-facing copy is Macedonian; payment is cash on delivery, or store pickup.

The business is loss-making and capital is tight; the back office exists to turn that around with numbers. **Read `docs/DECISIONS.md` (D-001 …) before changing how anything is counted** — margins, sell-through, seasons, reorder, stock and the ledger all rest on decisions recorded there. `docs/TURNAROUND.md` is the strategy, `docs/BACKLOG.md` the open work.

## Commands

```bash
npm run dev               # dev server (http://localhost:3000)
npm run build             # production build — the main check; there is no test suite
npm run start             # serve the build (restart it after every rebuild)
npm run lint              # eslint
npm run migrations:check  # which Supabase migrations have landed (also probes anon access)
npm run user:role [email] [admin|staff|none]   # list or set back-office roles
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

**A column added to `products` must also be added to `products_costed`, and to `products_public` if customers may see it** — views fix their columns when created.

### Migrations

`supabase/migrations/00N_*.sql`, idempotent, **pasted by the owner into the Supabase SQL editor** (DDL cannot go through PostgREST). Write the next number, add a probe to `scripts/check-migrations.ts`, and keep code working before the migration runs (fall back when a view/function is missing — see `useProducts.ts`, `ledger-ops.ts`). SQL can be tested locally in PGlite (`@electric-sql/pglite`, installed in the scratchpad, not the repo) with a stand-in `auth.jwt()`.

### Writing stock

Every write to `sizes`/`stock`/`sold` goes through `src/lib/stock.ts`: read fresh, compare-and-set on `updated_at` (D-013). A form must never write back the quantities it opened with — only a real count, and only onto the shelf it started from (`saveProductEdit` in `ProductForm.tsx`).

## Roles and access (D-017 … D-020)

The role is `app_metadata.role` on the Supabase user, writable only with the service-role key; it rides in the JWT, so the database enforces it too (`public.app_role()`, `is_admin()`, `is_back_office()`).

| Role | Screen | Database |
|---|---|---|
| `admin` | `/admin` — the owner's dashboard, all screens | everything |
| `staff` | `/admin` — `StaffHome` (stock, new/edit product without cost, sales without totals, orders) | products read/insert/update; orders read/update; ledger insert + three functions (`ledger_refund_one`, `ledger_remove_order`, `ledger_reprice_order_line`) — **never reads the ledger** (rows carry cost) |
| none / unknown / `customer` | blank page | nothing |

- Screen rules: `ROLE_PATHS` in `src/lib/roles.ts` (an allowlist — a new admin page is admin-only until added), enforced by `AdminGate` in `admin/layout.tsx`. **A user without a role gets no access, never staff** — Supabase sign-up is open, and customers with their own accounts (and their own screen, outside `/admin`) are planned.
- Accounts: `/admin/users` → `/api/admin/users` (service-role, checks the caller is admin). `AuthContext` refreshes the session on load so a changed role applies at once.

## Storefront

- Public pages read through `src/lib/products-server.ts` (server, service-role) or the client hooks `usePublicProducts` / `useProductsByCategory` / `useCategories` (anon → `products_public`). Admin hooks `useProducts` / `useProduct` read `products_costed`. Filtering, facets and pagination are computed in-process. A product shows only if visible **and** some size has `quantity >= 1`.
- Product URL: `/product/{id}` (`src/app/product/[id]/`). Display name from `getProductDisplayName` (`src/lib/product-display.ts`) → `"{Category} - {name}"`; the supplier brand is never shown.
- Cart is client-only (`CartContext`, localStorage). Prices that respect a sale: `getEffectivePrice` (`src/lib/pricing.ts`). Shipping and pickup: `src/config/shipping.ts`, `src/config/store.ts`, `priceOrder` in `src/lib/order-math.ts`.

### Order creation & anti-spam

Orders are created **only** by `POST /api/orders` (service-role). Layers, in order: IP blocklist → circuit breaker → per-IP rate limit (5/min) → JSON parse → honeypot (`website`) → form timing (`_t`, ≥3s) → validation → per-email limit (3/hr), in `src/lib/rate-limit.ts`. Preserve every layer; the client form must keep sending `_t` and the honeypot.

## Business logic (back office)

Cost and margin `src/lib/cost.ts` (Firebase stores purchase price **×2**; `realPurchasePrice` halves it — D-002), seasons per raw category `src/lib/seasons.ts`, velocity classes `velocity.ts`, reorder plan `reorder.ts`, open-to-buy `open-to-buy.ts`, markdown ladder `markdown.ts`, customers by normalised phone `customers.ts`, ledger `sales-ledger.ts` / `ledger-ops.ts`, product attributes vocabulary (fibres, colours with Macedonian gender forms, fits, per-category fields and measurements) `attributes.ts`. Thresholds live as named constants in those files — change them there, not inline.

## i18n

`src/lib/i18n/translations/{mk,en}.json` via `useTranslation`. Add UI keys to **both**. Some category labels are duplicated as inline maps (`CATEGORY_LABELS` in `product-display.ts`, `MK_CATEGORY_LABELS` on the product page). Back-office screens added recently use inline Macedonian copy; follow the file you are in.

## SEO

`src/app/layout.tsx` (metadata, hreflang, JSON-LD), `sitemap.ts`, `robots.ts`, `public/llms.txt` / `llms-full.txt`. Canonical base `https://marshal.mk`. Admin is `noindex`.

## Conventions

- App Router; dynamic `params` are `Promise`s — `await params`. A `page.tsx` may only export the page (move shared components to `src/components/`).
- Tailwind utilities; `src/app/globals.css` for globals. `@/*` → `src/*`.
- `'use client'` for anything touching the browser Supabase client or Contexts; the service-role key never enters a client file.
- Commits explain the why; decisions that change how something is counted or who may do what get a `D-0NN` entry in `docs/DECISIONS.md`.
