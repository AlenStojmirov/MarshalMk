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

Reads Supabase (`products`, `orders`) and the Firebase RTDB inventory. Note that
Firebase stores `purchasePrice` doubled — the script divides by 2 (see
`docs/DECISIONS.md` D-002).

---

## Config Files

| File | Purpose |
|------|---------|
| `src/config/brand-codes.json` | Maps brand names to single-letter codes (e.g. `"X2Denim": "D"`) |
| `src/lib/product-display.ts` | Helper functions: `generateProductName()`, `stripBrandFromName()`, `getBrandCode()` |
