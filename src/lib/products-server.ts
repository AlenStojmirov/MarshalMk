import { unstable_cache } from 'next/cache';
import { getSupabaseAdmin } from './supabase-admin';
import { rowToProduct, ProductRow } from './db-mappers';
import { Product, PaginatedResult, ProductQueryParams } from '@/types';
import { getProductImageMap, ProductImageMap } from './product-images';
import { canonicalSize } from './sizes';
import { canonicalCategory, groupOfCategory, menuEntries, slugOf, type MenuEntry } from '@/config/categories';
import { FACETS, facetValues, sortFacet } from './facets';

const PRODUCTS_PER_PAGE = 12;

/**
 * The columns a customer may see — the same list as the `products_public` view
 * (migration 007). These reads run with the service role and their result is
 * handed to client components, so whatever is selected here is in the page's
 * HTML: `select('*')` put every product's `sold[]` (size, price charged, date,
 * the giveaways at 0) on the product, category, /new and /sale pages.
 *
 * The attributes are embedded the way the view's `attributes` column carries
 * them (migration 023): the storefront's titles are written from them (9.7).
 */
const PUBLIC_COLUMNS =
  'id, name, description, price, category, image_url, images, stock, sizes, brand, color, featured, is_visible, sale, created_at, updated_at, product_attributes(composition, color, pattern, fit, size_advice, details, measurements)';

function enrichWithLocalImages(product: Product, imageMap: ProductImageMap): Product {
  const localImages = imageMap[product.id];
  if (localImages && localImages.length > 0) {
    return {
      ...product,
      imageUrl: localImages[0],
      images: localImages.slice(1),
    };
  }
  return product;
}

function getEffectivePrice(product: Product): number {
  return product.sale?.isActive ? product.sale.salePrice : product.price;
}

export async function fetchPaginatedProducts(
  params: ProductQueryParams
): Promise<PaginatedResult> {
  const {
    page = 1,
    limit = PRODUCTS_PER_PAGE,
    sort = 'latest',
    categories,
    type,
    saleOnly,
    minPrice,
    maxPrice,
    sizes,
    facets,
  } = params;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('products')
    .select(PUBLIC_COLUMNS)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const imageMap = getProductImageMap();
  let allProducts: Product[] = ((data as ProductRow[] | null) ?? [])
    .map(rowToProduct)
    .map((p) => enrichWithLocalImages(p, imageMap));

  // Only include products that are visible and have sizes with quantity >= 1
  allProducts = allProducts.filter((p) =>
    p.isVisible !== false && p?.sizes?.some((s) => s.quantity >= 1)
  );

  if (saleOnly) {
    allProducts = allProducts.filter((p) => p.sale?.isActive);
  }

  // A group's categories, or one category: matched by slug, through the
  // aliases (`pantaloni` is `pants`), so any spelling in the database lists.
  let types: { category: string; count: number }[] | undefined;
  if (categories) {
    const wanted = new Map(categories.map((c) => [slugOf(canonicalCategory(c)), canonicalCategory(c)]));
    const keyOf = (p: Product) => slugOf(canonicalCategory(p.category ?? ''));
    allProducts = allProducts.filter((p) => wanted.has(keyOf(p)));

    // The chips: every category asked for that has something, in the order asked.
    const counts = new Map<string, number>();
    allProducts.forEach((p) => counts.set(keyOf(p), (counts.get(keyOf(p)) ?? 0) + 1));
    types = [...wanted.entries()]
      .filter(([key]) => counts.has(key))
      .map(([key, category]) => ({ category, count: counts.get(key)! }));

    if (type) {
      const t = slugOf(canonicalCategory(type));
      if (wanted.has(t)) allProducts = allProducts.filter((p) => keyOf(p) === t);
    }
  }

  // Compute filter metadata from the base result set (before user filters)
  const filterMeta = {
    ...computeFilterMeta(allProducts),
    ...(types ? { types } : {}),
    unfilteredCount: allProducts.length,
  };

  if (minPrice !== undefined || maxPrice !== undefined) {
    allProducts = allProducts.filter((p) => {
      const price = getEffectivePrice(p);
      if (minPrice !== undefined && price < minPrice) return false;
      if (maxPrice !== undefined && price > maxPrice) return false;
      return true;
    });
  }

  if (sizes && sizes.length > 0) {
    // Canonical on both sides: "2XL" and "XXL" are one filter (9.8), and an
    // old link with ?sizes=2XL still finds them.
    const wanted = new Set(sizes.map(canonicalSize));
    allProducts = allProducts.filter((p) =>
      p.sizes?.some((s) => wanted.has(canonicalSize(s.size)) && s.quantity > 0)
    );
  }

  // Colour, material, cut (9.9): any value ticked within a filter, every filter across.
  for (const facet of FACETS) {
    const wanted = new Set(facets?.[facet] ?? []);
    if (wanted.size === 0) continue;
    allProducts = allProducts.filter((p) => facetValues(p, facet).some((v) => wanted.has(v)));
  }

  if (sort === 'price_asc') {
    allProducts.sort((a, b) => getEffectivePrice(a) - getEffectivePrice(b));
  } else if (sort === 'price_desc') {
    allProducts.sort((a, b) => getEffectivePrice(b) - getEffectivePrice(a));
  }

  const totalCount = allProducts.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * limit;
  const paginatedProducts = allProducts.slice(start, start + limit);

  return {
    products: paginatedProducts,
    totalCount,
    totalPages,
    currentPage: safePage,
    filterMeta,
  };
}

function computeFilterMeta(products: Product[]): PaginatedResult['filterMeta'] {
  if (products.length === 0) {
    return { priceRange: { min: 0, max: 0 }, availableSizes: [] };
  }

  const prices = products.map(getEffectivePrice);
  const priceRange = {
    min: Math.floor(Math.min(...prices)),
    max: Math.ceil(Math.max(...prices)),
  };

  const sizeMap = new Map<string, number>();
  products.forEach((p) => {
    // Once per product, even if it holds both "XXL" and "2XL".
    const keys = new Set((p.sizes ?? []).filter((s) => s.quantity > 0).map((s) => canonicalSize(s.size)));
    keys.forEach((key) => sizeMap.set(key, (sizeMap.get(key) || 0) + 1));
  });

  const availableSizes = Array.from(sizeMap.entries()).map(([size, count]) => ({
    size,
    count,
  }));

  const facets: NonNullable<PaginatedResult['filterMeta']['facets']> = {};
  for (const facet of FACETS) {
    const counts = new Map<string, number>();
    products.forEach((p) => facetValues(p, facet).forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1)));
    facets[facet] = sortFacet(facet, [...counts.entries()].map(([value, count]) => ({ value, count })));
  }

  return { priceRange, availableSizes, facets };
}

/**
 * The product page's product (/product/{id}). A hidden one is null, so a direct
 * link to it is a 404 like a deleted one (14.7); the back office reads its own
 * way. A sold-out one is returned on purpose: an old link from Instagram lands
 * on "нема на залиха" and similar products rather than on a 404.
 */
export async function getProductById(id: string): Promise<Product | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('products')
    .select(PUBLIC_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const product = rowToProduct(data as ProductRow);
  if (product.isVisible === false) return null;

  const imageMap = getProductImageMap();
  return enrichWithLocalImages(product, imageMap);
}

export async function fetchAllVisibleProducts(): Promise<Product[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('products')
    .select(PUBLIC_COLUMNS)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const imageMap = getProductImageMap();
  return ((data as ProductRow[] | null) ?? [])
    .map(rowToProduct)
    .map((p) => enrichWithLocalImages(p, imageMap))
    .filter((p) => p.isVisible !== false && p?.sizes?.some((s) => s.quantity >= 1));
}

/**
 * Up to four others from the product's group, the same kind first (Task 2.4):
 * the one cardigan on the shelf is shown other knitwear rather than nothing.
 * Read here, not in the browser (Task 16.2), so they are links in the page's
 * HTML — a search engine finds every product from its neighbours.
 */
export async function fetchRelatedProducts(product: Product, limit = 4): Promise<Product[]> {
  const kind = slugOf(canonicalCategory(product.category ?? ''));
  const group = groupOfCategory(product.category);
  const near = (p: Product) =>
    group ? groupOfCategory(p.category)?.key === group.key : slugOf(canonicalCategory(p.category ?? '')) === kind;
  const same = (p: Product) => slugOf(canonicalCategory(p.category ?? '')) === kind;
  const others = (await fetchAllVisibleProducts()).filter((p) => p.id !== product.id && near(p));
  return [...others.filter(same), ...others.filter((p) => !same(p))].slice(0, limit);
}

/**
 * The menu's groups with something on the shelf (Task 16.2), for the header
 * and footer, read on the server so they are links in every page's HTML.
 * Drawn in the browser they were links no search engine saw: Jeans and
 * Trousers had no link from anywhere. Five minutes old at most, so a new
 * group shows without a deploy; one that has just sold out still opens, on
 * its empty note. The five minutes also redraw the pages with nothing of
 * their own to read (/cart, the rules pages), built once before. Only the
 * three columns the menu needs.
 */
export const fetchMenuEntries = unstable_cache(
  async (): Promise<MenuEntry[]> => {
    const { data, error } = await getSupabaseAdmin().from('products').select('category, is_visible, sizes');
    if (error) throw error;
    const rows = (data ?? []) as { category: string | null; is_visible: boolean | null; sizes: ProductRow['sizes'] }[];
    // The storefront's rule, as on every page: visible, and some size on the shelf.
    const shelf = rows
      .filter((r) => r.category && r.is_visible !== false && r.sizes?.some((s) => s.quantity >= 1))
      .map((r) => r.category as string);
    return menuEntries(shelf);
  },
  ['menu-entries'],
  { revalidate: 300 },
);

export function parseSearchParams(
  searchParams: Record<string, string | string[] | undefined>
): ProductQueryParams {
  const page = Number(searchParams.page) || 1;
  const sort = (searchParams.sort as string) || 'latest';
  const minPrice = searchParams.minPrice ? Number(searchParams.minPrice) : undefined;
  const maxPrice = searchParams.maxPrice ? Number(searchParams.maxPrice) : undefined;
  const sizesParam = searchParams.sizes as string | undefined;
  const sizes = sizesParam ? sizesParam.split(',').filter(Boolean) : undefined;
  const type = typeof searchParams.type === 'string' && searchParams.type ? searchParams.type : undefined;
  const facets = Object.fromEntries(
    FACETS.map((f) => [f, typeof searchParams[f] === 'string' ? (searchParams[f] as string).split(',').filter(Boolean) : []])
      .filter(([, values]) => values.length > 0)
  );

  return { page, sort, minPrice, maxPrice, sizes, type, facets };
}
