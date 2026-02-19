import { NextResponse } from 'next/server';
import { getProductImageMap } from '@/lib/product-images';

export async function GET() {
  const imageMap = getProductImageMap();
  return NextResponse.json(imageMap);
}
