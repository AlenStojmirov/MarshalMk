import fs from 'fs';
import path from 'path';

export interface ProductImageMap {
  [productId: string]: string[];
}

/**
 * Scans public/images/products/ and builds a map of product ID -> sorted image paths.
 * Image files must follow the naming convention: {productId}-{number}.{ext}
 * e.g. x2denim-1757282400-5-1.png -> product "x2denim-1757282400-5", image #1
 */
export function getProductImageMap(): ProductImageMap {
  const imagesDir = path.join(process.cwd(), 'public', 'images', 'products');
  const imageMap: ProductImageMap = {};

  try {
    const files = fs.readdirSync(imagesDir);

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (!['.png', '.jpg', '.jpeg', '.webp', '.avif'].includes(ext)) continue;

      const nameWithoutExt = file.slice(0, -ext.length);
      // Extract product ID: everything before the last -N suffix
      const match = nameWithoutExt.match(/^(.+)-(\d+)$/);
      if (!match) continue;

      const productId = match[1];
      const imagePath = `/images/products/${file}`;

      if (!imageMap[productId]) {
        imageMap[productId] = [];
      }
      imageMap[productId].push(imagePath);
    }

    // Sort images by their number suffix for each product
    for (const productId of Object.keys(imageMap)) {
      imageMap[productId].sort();
    }
  } catch (err) {
    console.error('Failed to scan product images directory:', err);
  }

  return imageMap;
}
