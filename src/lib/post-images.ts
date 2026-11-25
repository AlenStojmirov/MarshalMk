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

// ---------------------------------------------------------------------------
// Campaign pictures (D-051): black, amber, the dates and "акција" on each — an
// action sale's advertising must say that it is one and how long it lasts.
// ---------------------------------------------------------------------------

const NIGHT = '#0c0a09';
const GOLD = '#fcd34d';

export interface CampaignArt {
  name: string;
  /** "до −40%"; empty when there is nothing to say. */
  upTo: string;
  /** "Акција: петок 27.11 – недела 29.11.2026" */
  dates: string;
  /** "marshal.mk/black-friday" */
  link: string;
}

export interface CampaignCardProduct {
  title: string;
  photo?: string | null;
  price: number;
  /** The price struck through: the lowest before the campaign. */
  before: number;
  pct: number;
}

function nightCanvas(size: { w: number; h: number }) {
  const { canvas, ctx } = canvasOf(size);
  ctx.fillStyle = NIGHT;
  ctx.fillRect(0, 0, size.w, size.h);
  const glow = ctx.createRadialGradient(size.w * 0.2, 0, 0, size.w * 0.2, 0, size.w * 0.9);
  glow.addColorStop(0, 'rgba(252, 211, 77, 0.22)');
  glow.addColorStop(1, 'rgba(252, 211, 77, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size.w, size.h);
  return { canvas, ctx };
}

/** The tilted amber stamp: "до −40%". */
function stamp(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number) {
  ctx.save();
  ctx.font = font(size, 900);
  const w = ctx.measureText(text).width + size * 0.6;
  const h = size * 1.3;
  ctx.translate(x, y);
  ctx.rotate(-0.05);
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, -h * 0.78, w, h);
  ctx.fillStyle = NIGHT;
  ctx.fillText(text, size * 0.3, 0);
  ctx.restore();
}

function percentBadge(ctx: CanvasRenderingContext2D, pct: number, x: number, y: number, size = 44) {
  const text = `−${pct}%`;
  ctx.font = font(size, 900);
  const w = ctx.measureText(text).width + size * 0.5;
  ctx.fillStyle = GOLD;
  ctx.fillRect(x, y, w, size * 1.35);
  ctx.fillStyle = NIGHT;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + size * 0.25, y + size * 0.7);
  ctx.textBaseline = 'alphabetic';
}

/** The name in amber capitals, made smaller until it fits. */
function campaignName(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, maxWidth: number, size: number) {
  let s = size;
  ctx.font = font(s, 900);
  while (ctx.measureText(name.toUpperCase()).width > maxWidth && s > 40) {
    s -= 4;
    ctx.font = font(s, 900);
  }
  ctx.fillStyle = GOLD;
  ctx.fillText(name.toUpperCase(), x, y);
  return ctx.measureText(name.toUpperCase()).width;
}

/** The post that opens the campaign: name, deepest cut, dates and four pieces. 1080×1350. */
export async function renderCampaignCover(art: CampaignArt, products: CampaignCardProduct[]): Promise<Blob> {
  const { w: W, h: H } = FEED;
  const { canvas, ctx } = nightCanvas(FEED);
  await drawLogo(ctx, W - 160, 48, 110, true);
  const pad = 64;
  ctx.fillStyle = 'rgba(252, 211, 77, 0.85)';
  ctx.font = font(30, 600);
  ctx.fillText(art.dates, pad, 96);
  campaignName(ctx, art.name, pad, 250, W - pad * 2 - 140, 150);
  if (art.upTo) stamp(ctx, art.upTo, pad, 380, 84);

  const top = 470;
  const gap = 16;
  const cell = (W - pad * 2 - gap) / 2;
  const cellH = (H - top - 150 - gap) / 2;
  const four = products.slice(0, 4);
  const photos = await Promise.all(four.map((p) => tryImage(p.photo)));
  four.forEach((p, i) => {
    const x = pad + (i % 2) * (cell + gap);
    const y = top + Math.floor(i / 2) * (cellH + gap);
    const img = photos[i];
    if (img) drawCover(ctx, img, x, y, cell, cellH);
    else {
      ctx.fillStyle = '#292524';
      ctx.fillRect(x, y, cell, cellH);
    }
    percentBadge(ctx, p.pct, x + 16, y + 16, 40);
  });

  ctx.fillStyle = PAPER;
  ctx.font = font(34, 700);
  ctx.textAlign = 'center';
  ctx.fillText(art.link, W / 2, H - 84);
  ctx.fillStyle = '#a8a29e';
  ctx.font = font(26, 500);
  ctx.fillText('Плаќање при достава · подигање во продавница', W / 2, H - 40);
  ctx.textAlign = 'left';
  return toBlob(canvas);
}

/** A story: the name big, the cut, the dates, up to three pieces fanned. 1080×1920. */
export async function renderCampaignStory(art: CampaignArt, products: CampaignCardProduct[]): Promise<Blob> {
  const { w: W, h: H } = STORY;
  const { canvas, ctx } = nightCanvas(STORY);
  await drawLogo(ctx, W / 2 - 70, 200, 140, true);
  const pad = 80;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(252, 211, 77, 0.85)';
  ctx.font = font(36, 600);
  ctx.fillText(art.dates, W / 2, 440);
  ctx.textAlign = 'left';

  // Measured first, then drawn centred.
  ctx.font = font(170, 900);
  let size = 170;
  while (ctx.measureText(art.name.toUpperCase()).width > W - pad * 2 && size > 40) {
    size -= 4;
    ctx.font = font(size, 900);
  }
  const nameW = ctx.measureText(art.name.toUpperCase()).width;
  campaignName(ctx, art.name, (W - nameW) / 2, 640, W - pad * 2, size);
  if (art.upTo) {
    ctx.font = font(96, 900);
    const sw = ctx.measureText(art.upTo).width + 96 * 0.6;
    stamp(ctx, art.upTo, (W - sw) / 2, 820, 96);
  }

  const shown = products.slice(0, 3);
  const photos = await Promise.all(shown.map((p) => tryImage(p.photo)));
  const cw = 420;
  const ch = 560;
  // Left, right, then the middle one on top.
  const spots = [
    { x: W / 2 - cw / 2 - 250, y: 1000, r: -0.12 },
    { x: W / 2 - cw / 2 + 250, y: 1000, r: 0.12 },
    { x: W / 2 - cw / 2, y: 960, r: 0 },
  ];
  const place = shown.length === 1 ? [2] : shown.length === 2 ? [0, 1] : [0, 1, 2];
  shown.forEach((p, i) => {
    const s = spots[place[i]];
    ctx.save();
    ctx.translate(s.x + cw / 2, s.y + ch / 2);
    ctx.rotate(s.r);
    ctx.fillStyle = PAPER;
    ctx.fillRect(-cw / 2 - 10, -ch / 2 - 10, cw + 20, ch + 20);
    const img = photos[i];
    if (img) drawCover(ctx, img, -cw / 2, -ch / 2, cw, ch);
    else {
      ctx.fillStyle = '#292524';
      ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
    }
    percentBadge(ctx, p.pct, -cw / 2 + 14, -ch / 2 + 14, 42);
    ctx.restore();
  });

  ctx.textAlign = 'center';
  ctx.fillStyle = PAPER;
  ctx.font = font(48, 800);
  ctx.fillText(art.link, W / 2, H - 260);
  ctx.textAlign = 'left';
  return toBlob(canvas);
}

/** One piece: its photo, then the campaign band with both prices. 1080×1350. */
export async function renderCampaignCard(art: CampaignArt, p: CampaignCardProduct): Promise<Blob> {
  const { w: W, h: H } = FEED;
  const { canvas, ctx } = nightCanvas(FEED);
  const photoH = 880;
  const img = await tryImage(p.photo);
  if (img) drawCover(ctx, img, 0, 0, W, photoH);
  else {
    ctx.fillStyle = '#292524';
    ctx.fillRect(0, 0, W, photoH);
  }
  await drawLogo(ctx, W - 150, 30, 120, true);
  percentBadge(ctx, p.pct, 40, 40, 64);

  const pad = 64;
  ctx.fillStyle = GOLD;
  ctx.font = font(30, 800);
  ctx.fillText(wrap(ctx, `${art.name.toUpperCase()} · ${art.dates}`, W - pad * 2, 1)[0] ?? '', pad, photoH + 70);
  ctx.fillStyle = PAPER;
  ctx.font = font(46, 700);
  let y = photoH + 140;
  for (const line of wrap(ctx, p.title, W - pad * 2, 2)) {
    ctx.fillText(line, pad, y);
    y += 54;
  }
  const baseline = H - 110;
  ctx.fillStyle = GOLD;
  ctx.font = font(104, 900);
  const price = den(p.price);
  ctx.fillText(price, pad, baseline);
  const nw = ctx.measureText(price).width;
  ctx.font = font(48, 500);
  ctx.fillStyle = '#a8a29e';
  const old = den(p.before);
  const ox = pad + nw + 32;
  ctx.fillText(old, ox, baseline - 10);
  const ow = ctx.measureText(old).width;
  ctx.strokeStyle = '#a8a29e';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(ox - 4, baseline - 26);
  ctx.lineTo(ox + ow + 4, baseline - 26);
  ctx.stroke();
  ctx.font = font(26, 500);
  ctx.fillText(art.link, pad, H - 44);
  return toBlob(canvas);
}
