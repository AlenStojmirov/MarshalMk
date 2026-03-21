import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { Product, PaginatedResult, ProductQueryParams } from '@/types';
import { getProductImageMap, ProductImageMap } from './product-images';

const PRODUCTS_PER_PAGE = 12;

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

function parseFirestoreProduct(doc: { id: string; data: () => Record<string, unknown> }): Product {
  const data = doc.data();
  return {
    id: doc.id,
    ...data,
    createdAt: (data.createdAt as { toDate?: () => Date })?.toDate?.() || new Date(),
    updatedAt: (data.updatedAt as { toDate?: () => Date })?.toDate?.() || new Date(),
  } as Product;
}

export async function fetchPaginatedProducts(
  params: ProductQueryParams
): Promise<PaginatedResult> {
  const {
    page = 1,
    limit = PRODUCTS_PER_PAGE,
    sort = 'latest',
    category,
    saleOnly,
    minPrice,
    maxPrice,
    sizes,
  } = params;

  const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  const imageMap = getProductImageMap();

  let allProducts = snapshot.docs
    .map(parseFirestoreProduct)
    .map((p) => enrichWithLocalImages(p, imageMap));

  // Only include products that are visible and have sizes with quantity > 1
  allProducts = allProducts.filter((p) =>
    p.isVisible !== false && p?.sizes?.some((s) => s.quantity >= 1)
  );

  // Filter sale products in JS to avoid composite index requirement
  if (saleOnly) {
    allProducts = allProducts.filter((p) => p.sale?.isActive);
  }

  // Filter by category slug (client-side match since categories are stored as display names)
  if (category) {
    const slugToMatch = category.toLowerCase();
    allProducts = allProducts.filter((p) => {
      const productSlug = p.category.toLowerCase().replace(/\s+/g, '-');
      return productSlug === slugToMatch;
    });
  }

  // Compute filter metadata from the base result set (before user filters)
  const filterMeta = computeFilterMeta(allProducts);

  // Apply price filter
  if (minPrice !== undefined || maxPrice !== undefined) {
    allProducts = allProducts.filter((p) => {
      const price = getEffectivePrice(p);
      if (minPrice !== undefined && price < minPrice) return false;
      if (maxPrice !== undefined && price > maxPrice) return false;
      return true;
    });
  }

  // Apply size filter
  if (sizes && sizes.length > 0) {
    allProducts = allProducts.filter((p) =>
      p.sizes?.some((s) => sizes.includes(s.size) && s.quantity > 0)
    );
  }

  // Apply sorting
  if (sort === 'price_asc') {
    allProducts.sort((a, b) => getEffectivePrice(a) - getEffectivePrice(b));
  } else if (sort === 'price_desc') {
    allProducts.sort((a, b) => getEffectivePrice(b) - getEffectivePrice(a));
  }

  // Paginate
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
    p.sizes?.forEach((s) => {
      if (s.quantity > 0) {
        sizeMap.set(s.size, (sizeMap.get(s.size) || 0) + 1);
      }
    });
  });

  const availableSizes = Array.from(sizeMap.entries()).map(([size, count]) => ({
    size,
    count,
  }));

  return { priceRange, availableSizes };
}

export async function fetchAllVisibleProducts(): Promise<Product[]> {
  const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  const imageMap = getProductImageMap();

  return snapshot.docs
    .map(parseFirestoreProduct)
    .map((p) => enrichWithLocalImages(p, imageMap))
    .filter((p) => p.isVisible !== false && p?.sizes?.some((s) => s.quantity >= 1));
}

export function parseSearchParams(
  searchParams: Record<string, string | string[] | undefined>
): ProductQueryParams {
  const page = Number(searchParams.page) || 1;
  const sort = (searchParams.sort as string) || 'latest';
  const minPrice = searchParams.minPrice ? Number(searchParams.minPrice) : undefined;
  const maxPrice = searchParams.maxPrice ? Number(searchParams.maxPrice) : undefined;
  const sizesParam = searchParams.sizes as string | undefined;
  const sizes = sizesParam ? sizesParam.split(',').filter(Boolean) : undefined;

  return { page, sort, minPrice, maxPrice, sizes };
}
