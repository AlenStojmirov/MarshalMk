# Scripts Reference

All scripts are in the `scripts/` folder and run with `npx tsx`.

---

## 1. Rename Products (Brand Hiding)

Batch-rename all products to the format `Category - #BrandCode001`.
Uses brand codes from `src/config/brand-codes.json`.

```bash
# Preview what names will change (dry run, no writes)
npx tsx scripts/rename-products.ts preview

# Apply the renames to Firestore
npx tsx scripts/rename-products.ts apply
```

---

## 2. Manage Product Visibility

Show/hide products on the website, migrate visibility field, or export products.

```bash
# Add isVisible field to all products (default: true)
npx tsx scripts/manage-product-visibility.ts migrate

# List all products with visibility status
npx tsx scripts/manage-product-visibility.ts list

# Make a product visible
npx tsx scripts/manage-product-visibility.ts show <productId>

# Hide a product from the website
npx tsx scripts/manage-product-visibility.ts hide <productId>

# Export all products as JSON file
npx tsx scripts/manage-product-visibility.ts export
```

---

## 3. Set Products On Sale

Mark specific products as ON SALE with a discount percentage.

```bash
# Put a single product on sale with 25% off
npx tsx scripts/set-products-on-sale.ts <productId> <percentageOff>

# Example
npx tsx scripts/set-products-on-sale.ts product123 25
```

You can also edit the `PRODUCTS_TO_UPDATE` array inside the script to bulk-update multiple products at once.

---

## 4. Migrate Sale Fields

One-time migration to add default sale fields (`sale.isActive`, `sale.salePrice`, `sale.percentageOff`) to all products that don't have them.

```bash
npx tsx scripts/migrate-sale-fields.ts
```

---

## 5. Replace Category

Rename a category across all products that use it.

```bash
# List all categories with product counts
npx tsx scripts/replace-category.ts list

# Replace a category name on all matching products
npx tsx scripts/replace-category.ts replace <oldCategory> <newCategory>

# Examples
npx tsx scripts/replace-category.ts replace "Men's Clothing" "Men's Fashion"
npx tsx scripts/replace-category.ts replace Shoes Footwear
```

---

## 6. Baseline Report (read-only)

Prints the real inventory and sales numbers behind the strategy: models per
category, units and capital tied in stock, sales velocity, the actual size
curve, realised gross margin, and months-of-supply / GMROI per category.

**Writes nothing to any database.** Output goes to stdout and to
`docs/baseline-<today>.md`.

```bash
npm run baseline
# or
npx tsx scripts/baseline-report.ts
```

Reads Supabase only. Cost comes from `products.purchase_price`, the same column
the admin screens read — the Firebase doubling is handled once, at sync
(`docs/DECISIONS.md` D-002).

---

## 7. Backfill Purchase Price

Fills `products.purchase_price` in Supabase from the Firebase RTDB inventory.
Narrower and safer than "Sync All", which also rewrites sizes/sold/stock.

```bash
npx tsx scripts/backfill-purchase-price.ts          # dry run, writes nothing
npx tsx scripts/backfill-purchase-price.ts apply    # writes
```

Requires `supabase/migrations/001_purchase_price.sql` to have been run first.
The halving of the doubled Firebase value happens in `realPurchasePrice()`
(`src/lib/cost.ts`) — never divide again on read.

---

## 8. Sync Sales Ledger

Keeps `sales_ledger` in step with `products.sold[]`. Idempotent — run it as
often as you like. Supersedes the one-shot backfill (see git history).

```bash
npm run ledger:sync                 # report drift, write nothing
npm run ledger:sync apply           # insert what is missing
npm run ledger:sync apply prune     # also delete rows sold[] no longer has
```

Both channels now write to the ledger live — the order API (D-006) and the POS
(Task 0.3) — so this is a repair tool rather than the main path. It still earns
its keep: a live write is best-effort and swallowed on failure, and `sold[]` can
be edited retroactively for a sale that happened weeks ago. Run it before any
report that depends on the ledger, and see `docs/DECISIONS.md` D-008 for why
reports still read `sold[]`.

Rows written live carry `source` `pos` or `online` and are outside
`OWNED_SOURCES`, so `prune` never touches them.

Matching is a multiset comparison per product on size + day + price, because
`sold[]` entries have no id, entries get added with past dates, and two
identical sales on one day are legitimate. Extras are reported rather than
deleted unless `prune` is passed, and even then only rows this tooling
wrote — a row written live is never touched.

---

## 9. Refresh — one command before any analysis

```bash
npm run refresh          # report only, writes nothing
npm run refresh apply    # sync the ledger, capture a snapshot, run the report
```

Runs the ledger sync, the inventory snapshot and the baseline report in that
order, then prints the headline figures. A failing step stops the rest: a
snapshot taken on top of a half-synced ledger is worse than no snapshot,
because it looks like data.

Safe to re-run — the sync is idempotent and the snapshot overwrites the same
day rather than duplicating it.

Run it weekly while any long piece of work is in progress. The snapshot is the
part that cannot be caught up later: turnover and GMROI need average inventory
over time, so a week not captured is a week gone.

---

## Config Files

| File | Purpose |
|------|---------|
| `src/config/brand-codes.json` | Maps brand names to single-letter codes (e.g. `"X2Denim": "D"`) |
| `src/lib/product-display.ts` | Helper functions: `generateProductName()`, `stripBrandFromName()`, `getBrandCode()` |

---

## 10. Поштарина на стари нарачки (Task 0.4)

```bash
npm run orders:shipping          # преглед, ништо не се запишува
npm run orders:shipping apply    # запишува
```

Checkout наплаќа 170 ден. под прагот од 3.000, но до D-006 API-то запишуваше
`shipping: 0` и `total: subtotal`. Парите поминале низ каса, само редот е погрешен.
Скриптата ја враќа поштарината во записот на тие стари редови.

Не применува D-006 наназад. Над прагот таа одлука ги намалува **цените на
ставките**, а препишување на цената по која нешто е продадено месеци подоцна би го
расипало единствениот број врз кој се гради секој извештај за маржа. Такви нарачки
се излистуваат и се оставаат на мира.

Идемпотентна: редови што веќе имаат поштарина не се допираат, а самиот запис е
compare-and-set врз `shipping = 0`.

Профитот не се менува. Под прагот 170-те се наплаќаат и веднаш одат кај курирот;
над прагот курирот се плаќа од цените на ставките. Затоа извештајот мери приход и
AOV по `subtotal`, никогаш по `total`.

---

## 11. Што фали по производ (Task 9.0)

```bash
npm run catalog:audit     # само чита; извештај во docs/catalog-audit-<датум>.md
```

За секој производ со залиха: слики, состав, боја, крој, совет за големина, мерки.
„Спремен“ = сè од тоа (`content_status` од 2.5, пресметан).

Редослед на работа: **1** на сајтот → **2** скриен, сезоната се отвора →
**3** скриен, целогодишно → **4** скриен, сезоната заврши (чека, D-010) →
**5** никогаш продаден 90+ дена (расчистување, не содржина). Во нивото — по
набавна вредност на залихата.

Пред миграцијата 010 (`product_attributes`) структурираните полиња се празни, а
составот се бара во описот — тоа е она што парсерот (9.3) ќе го прочита. Пушти ја
повторно по секој чекор од EPIC 9 за да се види колку се намалило.

---

## 12. Состав од старите описи (Task 9.3)

```bash
npm run attributes:parse          # преглед, ништо не се запишува
npm run attributes:parse apply    # запишува во product_attributes
```

Го чита `description` (`src/lib/parse-description.ts`): состав во ~30 форми
(`100% - Памук`, `Памук 100%`, `100% PES`…), должина на ногавица (`Должина: 32 - 32L`),
крој (`BAGGY`) и „со две лица“ (двостран). Состав што не збира 100 не се запишува, а
секој дел текст што не станал атрибут се пријавува за рачен внес.

Пополнува **само празни полиња** — внес од човек никогаш не се препишува, па второ
пуштање не менува ништо. `products.description` не се допира.

Пуштено 2026-09-27: 84 од 84 описи прочитани целосно и запишани.

---

## 13. Една големина, едно име (Task 9.8)

```bash
npm run sizes:canonical          # преглед, ништо не се запишува
npm run sizes:canonical apply    # запишува
```

`2XL → XXL`, `3XL → XXXL`, `kolicina` / `количина` → „Една големина“ — на полицата,
во `sold[]`, во `sales_ledger.size` и во `orders.items`, заедно, за секое спарување
(враќање, откажување) да си го најде паровот. Идемпотентна.

**Безбедно и пред преминот:** заштитата на „Sync All“ и `ledger:sync` ги споредуваат
големините канонски (`canonicalSize()` во `src/lib/sizes.ts`), па `2XL` на едната страна и
`XXL` на другата се иста продажба. Sync All може да ги врати имињата што Firebase сè уште ги
има — безопасно, сајтот и извештаите читаат канонски; пушти ја повторно за да се средат.

**Кога се преименува и во Firebase:** преименувај таму → Sync All → `npm run sizes:canonical apply`
→ `npm run ledger:sync` (без ново разидување). Ова ги преименува и ledger редовите, кои
функцијата за враќање во базата ги бара по точна големина.

Преглед 2026-09-27: 55 производи (40 на полица, 238 во sold[]), 238 ledger редови, 0 нарачки.
