/**
 * The pictures of a post, drawn in the browser (Task 10.3, EPIC 10).
 *
 * A carousel ends on a card that says what the photos cannot: the price, the
 * sizes on the shelf, cash on delivery. Drawn on a canvas here and handed over
 * as a file — nothing is stored on the server, and the photos stay where they
 * are (public/images/products and imageUrl; no Storage, owner 2026-09-27).
 *
 * Photos from i.postimg.cc answer with `Access-Control-Allow-Origin: *`
 * (checked 2026-09-28), so they draw without tainting the canvas; local files
 * are same-origin. If a photo still fails, the card is drawn without it rather
 * than not at all.
 *
 * Browser only.
 */

import { SHIPPING_CONFIG } from '@/config/shipping';
import { den } from './marketing';

/** Instagram's portrait feed format. */
export const FEED = { w: 1080, h: 1350 };
/** Stories and reels. */
export const STORY = { w: 1080, h: 1920 };

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
const INK = '#111111';
const MUTED = '#6b7280';
const ACCENT = '#e11d48';
const PAPER = '#ffffff';

export interface CardProduct {
  title: string;
  price: number;
  /** Shown struck through only where the post may talk about the discount (D-022). */
  listPrice?: number;
  percentOff?: number;
  sizes: string[];
  lastSizes?: string[];
  photo?: string | null;
}


export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Сликата не се вчита: ' + src));
    img.src = src;
  });
}

async function tryImage(src?: string | null): Promise<HTMLImageElement | null> {
  if (!src) return null;
  try {
    return await loadImage(src);
  } catch {
    return null;
  }
}

/** Fill the box with the image, cropping the overflow — like CSS object-fit: cover. */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (img.naturalWidth - sw) / 2;
  // Clothes photographed on a person lose less at the bottom than at the top.
  const sy = Math.max(0, (img.naturalHeight - sh) * 0.35);
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function font(size: number, weight = 400) {
  return `${weight} ${size}px ${FONT}`;
}

/** Break a line to fit, at most `maxLines`, ending in "…" when cut. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= maxWidth) line = next;
    else {
      if (line) lines.push(line);
      line = w;
    }
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(' ') !== lines.join(' ')) {
    let last = lines[maxLines - 1];
    while (last && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = last + '…';
  }
  return lines;
}

/** Size chips in a row, the last pieces marked. Returns the height used. */
function drawSizes(ctx: CanvasRenderingContext2D, sizes: string[], last: string[], x: number, y: number, maxWidth: number, h = 64) {
  ctx.font = font(34, 600);
  let cx = x;
  let cy = y;
  for (const s of sizes) {
    const w = Math.max(h, ctx.measureText(s).width + 36);
    if (cx + w > x + maxWidth) {
      cx = x;
      cy += h + 14;
    }
    const isLast = last.includes(s);
    ctx.fillStyle = isLast ? '#fef3c7' : '#f3f4f6';
    roundRect(ctx, cx, cy, w, h, 14);
    ctx.fill();
    ctx.fillStyle = isLast ? '#92400e' : INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s, cx + w / 2, cy + h / 2 + 1);
    cx += w + 12;
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  return cy + h - y;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function drawLogo(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, white = false) {
  const logo = await tryImage(white ? '/logo_white.png' : '/logo_black.png');
  if (logo) ctx.drawImage(logo, x, y, size, size);
}

function priceBlock(ctx: CanvasRenderingContext2D, p: CardProduct, x: number, baseline: number, big = 92) {
  ctx.fillStyle = p.listPrice ? ACCENT : INK;
  ctx.font = font(big, 800);
  const price = den(p.price);
  ctx.fillText(price, x, baseline);
  if (p.listPrice && p.listPrice > p.price) {
    const w = ctx.measureText(price).width;
    ctx.font = font(44, 500);
    ctx.fillStyle = MUTED;
    const old = den(p.listPrice);
    const ox = x + w + 28;
    ctx.fillText(old, ox, baseline - 8);
    const ow = ctx.measureText(old).width;
    ctx.fillRect(ox, baseline - 24, ow, 4);
    if (p.percentOff) {
      ctx.fillStyle = ACCENT;
      ctx.font = font(44, 700);
      ctx.fillText(`−${p.percentOff}%`, ox + ow + 20, baseline - 8);
    }
  }
}

function footer(ctx: CanvasRenderingContext2D, W: number, H: number, total: number) {
  const free = total >= SHIPPING_CONFIG.freeShippingThreshold;
  ctx.fillStyle = INK;
  ctx.fillRect(0, H - 110, W, 110);
  ctx.fillStyle = PAPER;
  ctx.font = font(34, 600);
  ctx.textAlign = 'center';
  ctx.fillText(
    free ? 'Плаќање при достава · Бесплатна достава' : 'Плаќање при достава · Достава низ цела Македонија',
    W / 2,
    H - 44,
  );
  ctx.textAlign = 'left';
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Сликата не може да се направи.'))), 'image/jpeg', 0.92),
  );
}

function canvasOf(size: { w: number; h: number }) {
  const canvas = document.createElement('canvas');
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, size.w, size.h);
  return { canvas, ctx };
}

/** The last slide of a carousel: photo, name, price, sizes, delivery. 1080×1350. */
export async function renderPriceCard(p: CardProduct): Promise<Blob> {
  const { w: W, h: H } = FEED;
  const { canvas, ctx } = canvasOf(FEED);
  const photoH = 820;
  const photo = await tryImage(p.photo);
  if (photo) drawCover(ctx, photo, 0, 0, W, photoH);
  else {
    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(0, 0, W, photoH);
  }
  await drawLogo(ctx, W - 150, 30, 120);

  const pad = 64;
  let y = photoH + 76;
  ctx.fillStyle = INK;
  ctx.font = font(52, 700);
  let lines = wrap(ctx, p.title, W - pad * 2, 1);
  if (lines[0]?.endsWith('…')) {
    // A long generated title gets two lines, a size smaller, rather than losing its colour.
    ctx.font = font(44, 700);
    lines = wrap(ctx, p.title, W - pad * 2, 2);
  }
  for (const line of lines) {
    ctx.fillText(line, pad, y);
    y += 54;
  }
  y += 56;
  priceBlock(ctx, p, pad, y);
  y += 44;
  drawSizes(ctx, p.sizes, p.lastSizes ?? [], pad, y, W - pad * 2);
  footer(ctx, W, H, p.price);
  return toBlob(canvas);
}

/** A story: the photo full height, the message and price on a band. 1080×1920. */
export async function renderStoryCard(p: CardProduct, headline: string): Promise<Blob> {
  const { w: W, h: H } = STORY;
  const { canvas, ctx } = canvasOf(STORY);
  const photo = await tryImage(p.photo);
  if (photo) drawCover(ctx, photo, 0, 0, W, H);
  else {
    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(0, 0, W, H);
  }
  await drawLogo(ctx, W - 170, 110, 130);

  // Instagram draws its own bar at the top and the reply box at the bottom; stay clear of both.
  const bandY = H - 640;
  const grad = ctx.createLinearGradient(0, bandY - 200, 0, bandY);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, bandY - 200, W, 200);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, bandY, W, H - bandY);

  const pad = 72;
  ctx.fillStyle = PAPER;
  ctx.font = font(84, 800);
  let y = bandY + 120;
  for (const line of wrap(ctx, headline, W - pad * 2, 2)) {
    ctx.fillText(line, pad, y);
    y += 100;
  }
  ctx.font = font(46, 500);
  ctx.fillText(wrap(ctx, p.title, W - pad * 2, 1)[0] ?? '', pad, y + 10);
  ctx.font = font(72, 800);
  ctx.fillStyle = p.listPrice ? '#fda4af' : PAPER;
  ctx.fillText(den(p.price), pad, y + 110);
  return toBlob(canvas);
}

/** Two pieces side by side and what they cost together. 1080×1350. */
export async function renderComboCard(top: CardProduct, bottom: CardProduct): Promise<Blob> {
  const { w: W, h: H } = FEED;
  const { canvas, ctx } = canvasOf(FEED);
  const photoH = 820;
  const half = W / 2;
  const [a, b] = await Promise.all([tryImage(top.photo), tryImage(bottom.photo)]);
  for (const [img, x] of [[a, 0], [b, half + 4]] as const) {
    if (img) drawCover(ctx, img, x, 0, half - 4, photoH);
    else {
      ctx.fillStyle = '#f3f4f6';
      ctx.fillRect(x, 0, half - 4, photoH);
    }
  }
  await drawLogo(ctx, W - 150, 30, 120);

  const pad = 56;
  for (const [p, x] of [[top, 0], [bottom, half]] as const) {
    ctx.fillStyle = INK;
    ctx.font = font(38, 600);
    let y = photoH + 70;
    for (const line of wrap(ctx, p.title, half - pad * 1.5, 2)) {
      ctx.fillText(line, x + pad, y);
      y += 46;
    }
    ctx.font = font(52, 800);
    ctx.fillText(den(p.price), x + pad, photoH + 210);
  }
  const total = top.price + bottom.price;
  ctx.fillStyle = INK;
  ctx.font = font(64, 800);
  ctx.textAlign = 'center';
  ctx.fillText(`Заедно ${den(total)}`, W / 2, H - 160);
  ctx.textAlign = 'left';
  footer(ctx, W, H, total);
  return toBlob(canvas);
}

/** A file from a photo url, for download or sharing, named so the order survives. */
export async function photoFile(url: string, name: string): Promise<File> {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error('Сликата не се симна: ' + url);
  const blob = await res.blob();
  const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
  return new File([blob], `${name}.${ext}`, { type: blob.type || 'image/jpeg' });
}

export function download(file: File | Blob, name: string) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
