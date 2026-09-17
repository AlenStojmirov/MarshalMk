'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useProducts, createProduct, updateProduct, deleteProduct, uploadProductImage } from '@/hooks/useProducts';
import { Product, ProductFormData, ProductSize } from '@/types';
import { Plus, Edit2, Trash2, LogOut, X, Save, ImagePlus, Package, Database, PlusCircle, Trash, ShoppingBag, AlertTriangle, Receipt, Tag, Eye, EyeOff, Search, Filter, Camera, Wallet, Truck, Clock, Coins, Ruler, CalendarDays, Gauge, PackagePlus } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useTranslation } from '@/lib/i18n';
import DashboardSummary from '@/components/admin/DashboardSummary';
import { getEffectivePrice, getPercentOff, isOnSale } from '@/lib/pricing';
import { grossMargin, markup, unitProfit, markdownFloorPrice, MARKDOWN_FLOOR } from '@/lib/cost';

function LoginForm() {
  const { t } = useTranslation();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(t('admin.invalidCredentials'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center bg-slate-50 px-4">
      <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 w-full max-w-md">
        <h1 className="text-2xl font-bold text-slate-800 mb-6 text-center">{t('admin.login')}</h1>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">{t('admin.email')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">{t('admin.password')}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
              required
            />
          </div>
          {error && <p className="text-red-600 text-sm font-medium">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            {loading ? t('admin.signingIn') : t('admin.signIn')}
          </button>
        </form>
        <p className="text-sm text-slate-400 mt-5 text-center">
          {t('admin.createAdminHint')}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Margin
//
// Margin is always computed on the *effective* price — the sale price when a
// sale is active. That is the number that decides whether a discount is still
// worth taking, which is the whole point of showing it here.
// ---------------------------------------------------------------------------

/** Below this the discount is eating the margin. */
const MARGIN_LOW = 0.25;
/** Below this it needs watching. */
const MARGIN_WATCH = 0.4;

interface MarginInfo {
  cost?: number;
  effectivePrice: number;
  /** Gross margin at the effective price, 0-1. Null when cost is unknown. */
  margin: number | null;
  markupPct: number | null;
  onSale: boolean;
  percentOff: number;
}

/** Window used to decide whether a product is still moving. */
const VELOCITY_WINDOW_DAYS = 90;

/**
 * Units sold in the last `days`, from `products.sold[]`.
 *
 * Entries with a zero price are giveaways or write-offs, not sales, so they are
 * excluded (see docs/DECISIONS.md D-005).
 *
 * Note: `sold[]` records in-store sales only — online orders are not written
 * there yet (Task 0.1). With the online channel at a handful of orders that is
 * immaterial today, but this number will understate demand once it grows.
 */
function unitsSoldSince(product: Product, days: number): number {
  const cutoff = Date.now() - days * 86_400_000;
  return (product.sold ?? []).filter(s => {
    if (!(Number(s.price) > 0)) return false;
    const t = Date.parse(s.soldDate);
    return Number.isFinite(t) && t >= cutoff;
  }).length;
}

function getMarginInfo(product: Product): MarginInfo {
  const effectivePrice = getEffectivePrice(product);
  return {
    cost: product.purchasePrice,
    effectivePrice,
    margin: grossMargin(effectivePrice, product.purchasePrice),
    markupPct: markup(effectivePrice, product.purchasePrice),
    onSale: isOnSale(product),
    percentOff: getPercentOff(product),
  };
}

function marginToneClass(margin: number | null): string {
  if (margin === null) return 'text-slate-400';
  if (margin < MARGIN_LOW) return 'text-red-700';
  if (margin < MARGIN_WATCH) return 'text-amber-700';
  return 'text-green-700';
}

interface ProductFormProps {
  product?: Product;
  onSave: (data: ProductFormData, customId?: string) => Promise<void>;
  onCancel: () => void;
}

function ProductForm({ product, onSave, onCancel }: ProductFormProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<ProductFormData>({
    name: product?.name || '',
    description: product?.description || '',
    price: product?.price || 0,
    purchasePrice: product?.purchasePrice,
    category: product?.category || '',
    imageUrl: product?.imageUrl || '',
    images: product?.images || [],
    stock: product?.stock || 0,
    featured: product?.featured || false,
    isVisible: product?.isVisible !== false,
    sizes: product?.sizes || [],
    sale: product?.sale || { isActive: false, salePrice: 0, percentageOff: 0 },
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newSize, setNewSize] = useState('');
  const [customId, setCustomId] = useState('');
  const isEditing = !!product;

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const imageUrl = await uploadProductImage(file);
      setFormData(prev => ({ ...prev, imageUrl }));
    } catch (err) {
      alert(t('admin.uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const handleAddSize = () => {
    if (!newSize.trim()) return;
    const sizeExists = formData.sizes?.some(s => s.size.toLowerCase() === newSize.trim().toLowerCase());
    if (sizeExists) {
      alert(t('admin.sizeExists'));
      return;
    }
    setFormData(prev => ({
      ...prev,
      sizes: [...(prev.sizes || []), { size: newSize.trim(), quantity: 0 }],
    }));
    setNewSize('');
  };

  const handleRemoveSize = (sizeToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      sizes: prev.sizes?.filter(s => s.size !== sizeToRemove) || [],
    }));
  };

  const handleSizeQuantityChange = (size: string, quantity: number) => {
    setFormData(prev => ({
      ...prev,
      sizes: prev.sizes?.map(s =>
        s.size === size ? { ...s, quantity: Math.max(0, quantity) } : s
      ) || [],
    }));
  };

  const handleSaleToggle = (isActive: boolean) => {
    setFormData(prev => ({
      ...prev,
      sale: {
        isActive,
        salePrice: isActive ? Math.round((prev.price * (1 - (prev.sale?.percentageOff || 0) / 100)) * 100) / 100 : 0,
        // Kept whether active or not — turning a sale off should not forget its size.
        percentageOff: prev.sale?.percentageOff || 0,
      },
    }));
  };

  // Margin as the form currently stands. Recomputed on every keystroke rather
  // than on save, because the number is only useful while the price is still
  // being decided — afterwards it is a report, and there are reports already.
  //
  // Everything reads the *effective* price. The old inline hint used the list
  // price, so a product sitting at −40% still showed a healthy margin; that is
  // exactly the case the number exists to catch (A1 in docs/TURNAROUND.md).
  const priceNow = formData.sale?.isActive
    ? (formData.sale.salePrice || 0)
    : formData.price;
  const costNow = formData.purchasePrice;
  const marginNow = grossMargin(priceNow, costNow);
  const markupNow = markup(priceNow, costNow);
  const profitNow = unitProfit(priceNow, costNow);
  const marginList = grossMargin(formData.price, costNow);
  const profitList = unitProfit(formData.price, costNow);
  const floorPrice = markdownFloorPrice(costNow);
  const belowFloor = floorPrice !== null && priceNow > 0 && priceNow < floorPrice;
  const discountCost =
    formData.sale?.isActive && profitList !== null && profitNow !== null
      ? profitList - profitNow
      : null;

  const handleSalePercentageChange = (percentageOff: number) => {
    const clamped = Math.min(100, Math.max(0, percentageOff));
    setFormData(prev => ({
      ...prev,
      sale: {
        isActive: prev.sale?.isActive || false,
        percentageOff: clamped,
        salePrice: Math.round((prev.price * (1 - clamped / 100)) * 100) / 100,
      },
    }));
  };

  // Calculate total stock from sizes
  const calculateTotalStock = (sizes: ProductSize[] | undefined): number => {
    if (!sizes || sizes.length === 0) return formData.stock;
    return sizes.reduce((sum, s) => sum + s.quantity, 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // If sizes exist, calculate total stock from sizes
      const totalStock = calculateTotalStock(formData.sizes);
      await onSave({ ...formData, stock: totalStock }, isEditing ? undefined : customId);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-bold text-gray-900">
            {product ? t('admin.editProduct') : t('admin.addNewProduct')}
          </h2>
          <button onClick={onCancel} className="text-gray-500 hover:text-gray-700">
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Product ID - Only shown when creating new product */}
            {!isEditing && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('admin.productId')}</label>
                <input
                  type="text"
                  value={customId}
                  onChange={(e) => setCustomId(e.target.value)}
                  placeholder={t('admin.productIdPlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">{t('admin.productIdHint')}</p>
              </div>
            )}

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('admin.productName')}</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('admin.description')}</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('admin.price')}</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.price}
                onChange={(e) => {
                  const newPrice = parseFloat(e.target.value) || 0;
                  setFormData(prev => ({
                    ...prev,
                    price: newPrice,
                    sale: prev.sale?.isActive
                      ? { ...prev.sale, salePrice: Math.round((newPrice * (1 - (prev.sale.percentageOff || 0) / 100)) * 100) / 100 }
                      : prev.sale,
                  }));
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('admin.purchasePrice')}</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.purchasePrice ?? ''}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  setFormData(prev => ({
                    ...prev,
                    purchasePrice: raw === '' ? undefined : Math.max(0, parseFloat(raw) || 0),
                  }));
                }}
                placeholder="—"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">{t('admin.purchasePriceHint')}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('admin.category')}</label>
              <input
                type="text"
                value={formData.category}
                onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div className="flex items-center">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.featured}
                  onChange={(e) => setFormData(prev => ({ ...prev, featured: e.target.checked }))}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">{t('admin.featuredProduct')}</span>
              </label>
            </div>

            <div className="flex items-center">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isVisible !== false}
                  onChange={(e) => setFormData(prev => ({ ...prev, isVisible: e.target.checked }))}
                  className="h-4 w-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                />
                <span className="text-sm font-medium text-gray-700">{t('admin.visibleOnWebsite')}</span>
              </label>
            </div>

            {/* Sale Section */}
            <div className="md:col-span-2 border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Tag className="h-5 w-5 text-red-600" />
                <label className="text-sm font-medium text-gray-700">{t('admin.saleSection')}</label>
              </div>

              <div className="flex items-center mb-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.sale?.isActive || false}
                    onChange={(e) => handleSaleToggle(e.target.checked)}
                    className="h-4 w-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                  />
                  <span className="text-sm font-medium text-gray-700">{t('admin.onSale')}</span>
                </label>
              </div>

              {formData.sale?.isActive && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('admin.salePercentage')}</label>
                    <input
                      type="number"
                      min="1"
                      max="99"
                      value={formData.sale?.percentageOff || ''}
                      onChange={(e) => handleSalePercentageChange(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('admin.salePrice')}</label>
                    <input
                      type="text"
                      value={`${(formData.sale?.salePrice || 0).toFixed(2)} ден.`}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700"
                    />
                    <p className="text-xs text-gray-500 mt-1">{t('admin.salePriceAuto')}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Margin panel — the answer to "should I be selling this at this
                price", shown at the moment the price is being typed. */}
            <div className="md:col-span-2">
              {marginNow === null ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                  {t('admin.noCostHint')}
                </div>
              ) : (
                <div
                  className={`rounded-xl border px-4 py-3 ${
                    belowFloor
                      ? 'border-red-300 bg-red-50'
                      : marginNow < MARGIN_LOW
                        ? 'border-amber-300 bg-amber-50'
                        : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
                    <div>
                      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        {t('admin.marginNow')}
                      </p>
                      <p className={`text-2xl font-bold tabular-nums ${marginToneClass(marginNow)}`}>
                        {(marginNow * 100).toFixed(1)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        {t('admin.markupLabel')}
                      </p>
                      <p className="text-lg font-semibold text-slate-700 tabular-nums">
                        {((markupNow ?? 0) * 100).toFixed(0)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        {t('admin.profitPerUnit')}
                      </p>
                      <p className="text-lg font-semibold text-slate-700 tabular-nums">
                        {(profitNow ?? 0).toFixed(0)} ден.
                      </p>
                    </div>
                    {formData.sale?.isActive && marginList !== null && (
                      <div>
                        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                          {t('admin.marginAtList')}
                        </p>
                        <p className="text-lg font-semibold text-slate-500 tabular-nums">
                          {(marginList * 100).toFixed(1)}%
                          <span className="text-xs font-normal text-slate-400">
                            {' '}· {(profitList ?? 0).toFixed(0)} ден.
                          </span>
                        </p>
                      </div>
                    )}
                  </div>

                  {discountCost !== null && discountCost > 0 && (
                    <p className="mt-2 text-xs text-slate-600">
                      {t('admin.discountCost')}:{' '}
                      <strong className="tabular-nums">{discountCost.toFixed(0)} ден.</strong>{' '}
                      {t('admin.perUnit')}
                    </p>
                  )}

                  {belowFloor ? (
                    <p className="mt-2 text-xs font-medium text-red-800">
                      {t('admin.belowFloorWarn')
                        .replace('{floor}', String(floorPrice))
                        .replace('{pct}', String(Math.round((MARKDOWN_FLOOR - 1) * 100)))}
                    </p>
                  ) : marginNow < MARGIN_LOW ? (
                    <p className="mt-2 text-xs font-medium text-amber-800">
                      {t('admin.marginLowWarn').replace('{pct}', String(Math.round(MARGIN_LOW * 100)))}
                    </p>
                  ) : null}
                </div>
              )}
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('admin.productImage')}</label>
              <div className="flex items-start gap-4">
                <div className="flex gap-2 flex-wrap">
                  {formData.imageUrl && (
                    <div className="relative w-24 h-24 rounded-lg overflow-hidden bg-gray-100">
                      <Image src={formData.imageUrl} alt="Preview" fill className="object-cover" sizes="96px" />
                    </div>
                  )}
                  {formData.images && formData.images.length > 0 && formData.images.map((img, idx) => (
                    <div key={idx} className="relative w-24 h-24 rounded-lg overflow-hidden bg-gray-100">
                      <Image src={img} alt={`Preview ${idx + 2}`} fill className="object-cover" sizes="96px" />
                    </div>
                  ))}
                </div>
                <div className="flex-1">
                  <label className="flex items-center justify-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 transition-colors">
                    <ImagePlus className="h-5 w-5 text-gray-400" />
                    <span className="text-sm text-gray-600">
                      {uploading ? t('admin.uploading') : t('admin.uploadImage')}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                      disabled={uploading}
                    />
                  </label>
                  <p className="text-xs text-gray-500 mt-1">{t('admin.orPasteUrl')}</p>
                  <input
                    type="url"
                    value={formData.imageUrl}
                    onChange={(e) => setFormData(prev => ({ ...prev, imageUrl: e.target.value }))}
                    placeholder="https://example.com/image.jpg"
                    className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <label className="block text-sm font-medium text-gray-700 mt-3 mb-1">{t('admin.additionalImages') || 'Additional Images'}</label>
                  <textarea
                    value={(formData.images || []).join('\n')}
                    onChange={(e) => {
                      const urls = e.target.value.split('\n').map(u => u.trim()).filter(Boolean);
                      setFormData(prev => ({ ...prev, images: urls }));
                    }}
                    placeholder="Paste additional image URLs, one per line"
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">{t('admin.additionalImagesHint') || 'One URL per line. These will show in the product gallery.'}</p>
                </div>
              </div>
            </div>

            {/* Sizes Section */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('admin.sizes')}</label>

              {/* Add Size Input */}
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={newSize}
                  onChange={(e) => setNewSize(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSize())}
                  placeholder={t('admin.sizePlaceholder')}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={handleAddSize}
                  className="flex items-center gap-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <PlusCircle className="h-4 w-4" />
                  {t('admin.addSize')}
                </button>
              </div>

              {/* Sizes List */}
              {formData.sizes && formData.sizes.length > 0 ? (
                <div className="space-y-2">
                  {formData.sizes.map((sizeItem) => (
                    <div key={sizeItem.size} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <span className="font-medium text-gray-900 min-w-[60px]">{sizeItem.size}</span>
                      <div className="flex-1 flex items-center gap-2">
                        <label className="text-sm text-gray-500">{t('admin.quantity')}:</label>
                        <input
                          type="number"
                          min="0"
                          value={sizeItem.quantity}
                          onChange={(e) => handleSizeQuantityChange(sizeItem.size, parseInt(e.target.value) || 0)}
                          className="w-24 px-3 py-1 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveSize(sizeItem.size)}
                        className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                        title={t('admin.removeSize')}
                      >
                        <Trash className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-2 border-t mt-3">
                    <span className="text-sm font-medium text-gray-700">{t('admin.totalStock')}:</span>
                    <span className="text-lg font-bold text-gray-900">{calculateTotalStock(formData.sizes)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500 italic">{t('admin.noSizesAdded')}</p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Save className="h-4 w-4" />
              {saving ? t('admin.saving') : t('admin.saveProduct')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AdminDashboard() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const { products, loading, refetch } = useProducts();
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | undefined>();
  const [filterName, setFilterName] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStock, setFilterStock] = useState<'all' | 'in-stock' | 'out-of-stock'>('all');
  const [filterFeatured, setFilterFeatured] = useState<'all' | 'yes' | 'no'>('all');
  const [filterVisible, setFilterVisible] = useState<'all' | 'yes' | 'no'>('all');
  const [filterMargin, setFilterMargin] = useState<'all' | 'onSale' | 'onSaleMoving' | 'onSaleStale' | 'below40' | 'below25' | 'noCost'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'marginAsc' | 'marginDesc' | 'priceAsc' | 'priceDesc' | 'stockAsc'>('newest');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ done: number; failed: number } | null>(null);

  const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean))).sort();

  const filteredProducts = products.filter(product => {
    if (filterName && !product.name.toLowerCase().includes(filterName.toLowerCase())) return false;
    if (filterCategory && product.category !== filterCategory) return false;
    if (filterStock === 'in-stock' && product.stock <= 0) return false;
    if (filterStock === 'out-of-stock' && product.stock > 0) return false;
    if (filterFeatured === 'yes' && !product.featured) return false;
    if (filterFeatured === 'no' && product.featured) return false;
    if (filterVisible === 'yes' && product.isVisible === false) return false;
    if (filterVisible === 'no' && product.isVisible !== false) return false;
    if (filterMargin !== 'all') {
      const { margin, onSale } = getMarginInfo(product);
      if (filterMargin === 'onSale' && !onSale) return false;
      if (filterMargin === 'onSaleMoving' && (!onSale || unitsSoldSince(product, VELOCITY_WINDOW_DAYS) === 0)) return false;
      if (filterMargin === 'onSaleStale' && (!onSale || unitsSoldSince(product, VELOCITY_WINDOW_DAYS) > 0)) return false;
      if (filterMargin === 'noCost' && margin !== null) return false;
      if (filterMargin === 'below40' && (margin === null || margin >= MARGIN_WATCH)) return false;
      if (filterMargin === 'below25' && (margin === null || margin >= MARGIN_LOW)) return false;
    }
    return true;
  });

  // Products with no known cost sort last on the margin orders — an unknown
  // margin is not the same as a bad one and should not top the list.
  const sortedProducts = useMemo(() => {
    const list = [...filteredProducts];
    const byMargin = (dir: 1 | -1) => (a: Product, b: Product) => {
      const ma = getMarginInfo(a).margin;
      const mb = getMarginInfo(b).margin;
      if (ma === null && mb === null) return 0;
      if (ma === null) return 1;
      if (mb === null) return -1;
      return (ma - mb) * dir;
    };

    switch (sortBy) {
      case 'marginAsc': return list.sort(byMargin(1));
      case 'marginDesc': return list.sort(byMargin(-1));
      case 'priceAsc': return list.sort((a, b) => getEffectivePrice(a) - getEffectivePrice(b));
      case 'priceDesc': return list.sort((a, b) => getEffectivePrice(b) - getEffectivePrice(a));
      case 'stockAsc': return list.sort((a, b) => a.stock - b.stock);
      default: return list;
    }
  }, [filteredProducts, sortBy]);

  // Headline numbers for the discount freeze (A1 in docs/TURNAROUND.md).
  const marginSummary = useMemo(() => {
    const withCost = products.filter(p => getMarginInfo(p).margin !== null);
    const margins = withCost.map(p => getMarginInfo(p).margin as number);
    const avg = margins.length ? margins.reduce((a, m) => a + m, 0) / margins.length : null;
    return {
      onSale: products.filter(p => isOnSale(p)).length,
      onSaleMoving: products.filter(
        p => isOnSale(p) && unitsSoldSince(p, VELOCITY_WINDOW_DAYS) > 0
      ).length,
      onSaleStale: products.filter(
        p => isOnSale(p) && unitsSoldSince(p, VELOCITY_WINDOW_DAYS) === 0
      ).length,
      belowLow: margins.filter(m => m < MARGIN_LOW).length,
      noCost: products.length - withCost.length,
      avg,
    };
  }, [products]);

  const hasActiveFilters =
    filterName || filterCategory || filterStock !== 'all' || filterFeatured !== 'all' ||
    filterVisible !== 'all' || filterMargin !== 'all' || sortBy !== 'newest';

  const clearFilters = () => {
    setFilterName('');
    setFilterCategory('');
    setFilterStock('all');
    setFilterFeatured('all');
    setFilterVisible('all');
    setFilterMargin('all');
    setSortBy('newest');
  };

  const handleCreate = async (data: ProductFormData, customId?: string) => {
    await createProduct(data, customId);
    setShowForm(false);
    refetch();
  };

  const handleUpdate = async (data: ProductFormData) => {
    if (editingProduct) {
      await updateProduct(editingProduct.id, data);
      setEditingProduct(undefined);
      refetch();
    }
  };

  const selectedProducts = products.filter(p => selectedIds.has(p.id));
  const selectedOnSale = selectedProducts.filter(isOnSale);

  const toggleOne = (id: string) => {
    setBulkResult(null);
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allVisibleSelected =
    sortedProducts.length > 0 && sortedProducts.every(p => selectedIds.has(p.id));

  const toggleAllVisible = () => {
    setBulkResult(null);
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        sortedProducts.forEach(p => next.delete(p.id));
      } else {
        sortedProducts.forEach(p => next.add(p.id));
      }
      return next;
    });
  };

  /**
   * Turn off the sale on every selected product that actually has one.
   *
   * The discount freeze is the largest single lever in docs/TURNAROUND.md, and
   * doing it one product at a time across ~79 of them is why it does not get
   * done. Products without an active sale are skipped rather than rewritten.
   */
  const handleBulkDisableSale = async () => {
    if (selectedOnSale.length === 0) return;
    if (!confirm(t('admin.confirmBulkDisableSale', { count: selectedOnSale.length }))) return;

    setBulkRunning(true);
    setBulkResult(null);

    let done = 0;
    let failed = 0;
    const BATCH = 10;

    for (let i = 0; i < selectedOnSale.length; i += BATCH) {
      const batch = selectedOnSale.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(p =>
          updateProduct(p.id, {
            sale: {
              isActive: false,
              salePrice: 0,
              // Keep the old percentage as a record. Every pricing helper gates on
              // isActive, so a stored percentage on an inactive sale is inert —
              // and it means a bulk freeze does not destroy what the discount was.
              percentageOff: p.sale?.percentageOff ?? 0,
            },
          } as Partial<ProductFormData>)
        )
      );
      results.forEach(r => (r.status === 'fulfilled' ? done++ : failed++));
    }

    setBulkRunning(false);
    setBulkResult({ done, failed });
    setSelectedIds(new Set());
    refetch();
  };

  const handleToggleVisibility = async (product: Product) => {
    const newVisibility = product.isVisible === false ? true : false;
    await updateProduct(product.id, { isVisible: newVisibility } as Partial<ProductFormData>);
    refetch();
  };

  const handleDelete = async (product: Product) => {
    if (confirm(t('admin.confirmDelete', { name: product.name }))) {
      await deleteProduct(product.id);
      refetch();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6 mb-6 sm:mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">{t('admin.dashboard')}</h1>
            <p className="text-sm sm:text-base text-slate-500 mt-1">{t('admin.loggedInAs', { email: user?.email || '' })}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors text-sm sm:text-base shadow-sm"
            >
              <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
              {t('admin.addProduct')}
            </button>
            <button
              onClick={signOut}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-300 rounded-lg font-medium text-slate-600 hover:bg-slate-50 transition-colors text-sm sm:text-base"
            >
              <LogOut className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="hidden sm:inline">{t('admin.signOut')}</span>
            </button>
          </div>
        </div>
      </div>

      <DashboardSummary
        products={products}
        onShowLeak={() => {
          setFilterMargin('onSaleMoving');
          setSortBy('marginAsc');
          document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' });
        }}
      />

      {/* Navigation Links */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
        <Link
          href="/admin/inventory"
          className="flex items-center justify-center gap-2 px-3 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl font-medium hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-colors text-sm shadow-sm"
        >
          <Database className="h-4 w-4 sm:h-5 sm:w-5" />
          <span className="hidden xs:inline">{t('admin.inventorySync')}</span>
          <span className="xs:hidden">Inventory</span>
        </Link>
        <Link
          href="/admin/orders"
          className="flex items-center justify-center gap-2 px-3 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl font-medium hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-colors text-sm shadow-sm"
        >
          <Package className="h-4 w-4 sm:h-5 sm:w-5" />
          <span className="hidden xs:inline">{t('admin.viewOrders')}</span>
          <span className="xs:hidden">Orders</span>
        </Link>
        <Link
          href="/admin/in-store-sales"
          className="flex items-center justify-center gap-2 px-3 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl font-medium hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-colors text-sm shadow-sm"
        >
          <ShoppingBag className="h-4 w-4 sm:h-5 sm:w-5" />
          <span className="hidden xs:inline">{t('admin.inStoreSales')}</span>
          <span className="xs:hidden">Sales</span>
        </Link>
        <Link
          href="/admin/sold-out"
          className="flex items-center justify-center gap-2 px-3 py-3 bg-red-50 border border-red-200 text-red-700 rounded-xl font-medium hover:bg-red-100 transition-colors text-sm shadow-sm"
        >
          <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5" />
          <span className="hidden xs:inline">{t('admin.soldOut')}</span>
          <span className="xs:hidden">Sold Out</span>
        </Link>
        <Link
          href="/admin/publishing"
          className="flex items-center justify-center gap-2 px-3 py-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl font-medium hover:bg-emerald-100 transition-colors text-sm shadow-sm"
        >
          <Camera className="h-4 w-4 sm:h-5 sm:w-5" />
          <span className="hidden xs:inline">Објавување</span>
          <span className="xs:hidden">Фото</span>
        </Link>
        <Link
          href="/admin/receiving"
          className="flex items-center justify-center gap-2 px-3 py-3 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl font-medium hover:bg-amber-100 transition-colors text-sm shadow-sm"
        >
          <Truck className="h-4 w-4 sm:h-5 sm:w-5" />
          <span className="hidden xs:inline">Прием на стока</span>
          <span className="xs:hidden">Прием</span>
        </Link>
        <Link
          href="/admin/aging"
          className="flex items-center justify-center gap-2 px-3 py-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl font-medium hover:bg-rose-100 transition-colors text-sm shadow-sm"
        >
          <Clock className="h-4 w-4 sm:h-5 sm:w-5" />
          <span className="hidden xs:inline">Стареење</span>
          <span className="xs:hidden">Возраст</span>
        </Link>
        <Link
          href="/admin/reorder"
          className="flex items-center justify-center gap-2 px-3 py-3 bg-cyan-50 border border-cyan-200 text-cyan-700 rounded-xl font-medium hover:bg-cyan-100 transition-colors text-sm shadow-sm"
        >
          <PackagePlus className="h-4 w-4 sm:h-5 sm:w-5" />
          <span className="hidden xs:inline">План за набавка</span>
          <span className="xs:hidden">Набавка</span>
        </Link>
        <Link
          href="/admin/velocity"
          className="flex items-center justify-center gap-2 px-3 py-3 bg-lime-50 border border-lime-200 text-lime-700 rounded-xl font-medium hover:bg-lime-100 transition-colors text-sm shadow-sm"
        >
          <Gauge className="h-4 w-4 sm:h-5 sm:w-5" />
          <span className="hidden xs:inline">Sell-through и темпо</span>
          <span className="xs:hidden">Темпо</span>
        </Link>
        <Link
          href="/admin/season"
          className="flex items-center justify-center gap-2 px-3 py-3 bg-violet-50 border border-violet-200 text-violet-700 rounded-xl font-medium hover:bg-violet-100 transition-colors text-sm shadow-sm"
        >
          <CalendarDays className="h-4 w-4 sm:h-5 sm:w-5" />
          <span className="hidden xs:inline">Сезонски календар</span>
          <span className="xs:hidden">Сезона</span>
        </Link>
        <Link
          href="/admin/sizes"
          className="flex items-center justify-center gap-2 px-3 py-3 bg-sky-50 border border-sky-200 text-sky-700 rounded-xl font-medium hover:bg-sky-100 transition-colors text-sm shadow-sm"
        >
          <Ruler className="h-4 w-4 sm:h-5 sm:w-5" />
          <span className="hidden xs:inline">Скршени серии</span>
          <span className="xs:hidden">Серии</span>
        </Link>
        <Link
          href="/admin/capital"
          className="flex items-center justify-center gap-2 px-3 py-3 bg-teal-50 border border-teal-200 text-teal-700 rounded-xl font-medium hover:bg-teal-100 transition-colors text-sm shadow-sm"
        >
          <Coins className="h-4 w-4 sm:h-5 sm:w-5" />
          <span className="hidden xs:inline">Каде да инвестирам</span>
          <span className="xs:hidden">Капитал</span>
        </Link>
        <Link
          href="/admin/finance"
          className="flex items-center justify-center gap-2 px-3 py-3 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl font-medium hover:bg-indigo-100 transition-colors text-sm shadow-sm"
        >
          <Wallet className="h-4 w-4 sm:h-5 sm:w-5" />
          <span className="hidden xs:inline">Трошоци и резултат</span>
          <span className="xs:hidden">Финансии</span>
        </Link>
        <Link
          href="/admin/expenses"
          className="flex items-center justify-center gap-2 px-3 py-3 bg-orange-50 border border-orange-200 text-orange-700 rounded-xl font-medium hover:bg-orange-100 transition-colors text-sm shadow-sm col-span-2 sm:col-span-1"
        >
          <Receipt className="h-4 w-4 sm:h-5 sm:w-5" />
          <span className="hidden xs:inline">{t('admin.expenses')}</span>
          <span className="xs:hidden">Expenses</span>
        </Link>
      </div>

      {/* Margin summary — the numbers behind the discount freeze */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('admin.avgMargin')}</p>
          <p className={`text-2xl font-bold tabular-nums ${marginToneClass(marginSummary.avg)}`}>
            {marginSummary.avg === null ? '—' : `${(marginSummary.avg * 100).toFixed(1)}%`}
          </p>
        </div>
        <button
          onClick={() => setFilterMargin(filterMargin === 'onSaleMoving' ? 'all' : 'onSaleMoving')}
          title={t('admin.onSaleMovingHint')}
          className={`text-left bg-white rounded-xl border p-4 shadow-sm transition-colors hover:border-red-300 ${
            filterMargin === 'onSaleMoving' ? 'border-red-400 ring-1 ring-red-200' : 'border-slate-200'
          }`}
        >
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('admin.onSaleMoving')}</p>
          <p className="text-2xl font-bold text-red-700 tabular-nums">{marginSummary.onSaleMoving}</p>
          <p className="text-[11px] text-slate-400">{t('admin.onSaleMovingSub')}</p>
        </button>
        <button
          onClick={() => setFilterMargin(filterMargin === 'onSaleStale' ? 'all' : 'onSaleStale')}
          title={t('admin.onSaleStaleHint')}
          className={`text-left bg-white rounded-xl border p-4 shadow-sm transition-colors hover:border-slate-300 ${
            filterMargin === 'onSaleStale' ? 'border-slate-400 ring-1 ring-slate-200' : 'border-slate-200'
          }`}
        >
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('admin.onSaleStale')}</p>
          <p className="text-2xl font-bold text-slate-600 tabular-nums">{marginSummary.onSaleStale}</p>
          <p className="text-[11px] text-slate-400">{t('admin.onSaleStaleSub')}</p>
        </button>
        <button
          onClick={() => setFilterMargin(filterMargin === 'below25' ? 'all' : 'below25')}
          className={`text-left bg-white rounded-xl border p-4 shadow-sm transition-colors hover:border-amber-300 ${
            filterMargin === 'below25' ? 'border-amber-400 ring-1 ring-amber-200' : 'border-slate-200'
          }`}
        >
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('admin.belowMarginFloor')}</p>
          <p className="text-2xl font-bold text-amber-700 tabular-nums">{marginSummary.belowLow}</p>
        </button>
        <button
          onClick={() => setFilterMargin(filterMargin === 'noCost' ? 'all' : 'noCost')}
          className={`text-left bg-white rounded-xl border p-4 shadow-sm transition-colors hover:border-slate-300 ${
            filterMargin === 'noCost' ? 'border-slate-400 ring-1 ring-slate-200' : 'border-slate-200'
          }`}
        >
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('admin.noCostCount')}</p>
          <p className="text-2xl font-bold text-slate-600 tabular-nums">{marginSummary.noCost}</p>
        </button>
      </div>

      {/* Bulk actions — only rendered when something is selected */}
      {selectedIds.size > 0 && (
        <div className="sticky top-2 z-30 mb-4 flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 shadow-sm">
          <p className="text-sm text-slate-700">
            <span className="font-semibold">{t('admin.selectedCount', { count: selectedIds.size })}</span>
            {' · '}
            <span className={selectedOnSale.length > 0 ? 'text-red-700 font-semibold' : 'text-slate-500'}>
              {t('admin.selectedOnSale', { count: selectedOnSale.length })}
            </span>
          </p>
          <div className="flex items-center gap-2 sm:ml-auto">
            <button
              onClick={handleBulkDisableSale}
              disabled={bulkRunning || selectedOnSale.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg font-medium text-sm hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              <Tag className="h-4 w-4" />
              {bulkRunning
                ? t('admin.bulkWorking')
                : t('admin.bulkDisableSale', { count: selectedOnSale.length })}
            </button>
            <button
              onClick={() => { setSelectedIds(new Set()); setBulkResult(null); }}
              disabled={bulkRunning}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              {t('admin.clearSelection')}
            </button>
          </div>
        </div>
      )}

      {bulkResult && (
        <div
          className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
            bulkResult.failed > 0
              ? 'border-amber-300 bg-amber-50 text-amber-800'
              : 'border-green-300 bg-green-50 text-green-800'
          }`}
        >
          {t('admin.bulkDone', { done: bulkResult.done })}
          {bulkResult.failed > 0 ? ` · ${t('admin.bulkFailed', { failed: bulkResult.failed })}` : ''}
        </div>
      )}

      {/* Products Table */}
      <div id="catalog" className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Filter Bar */}
        <div className="px-4 sm:px-6 py-3 border-b border-slate-200 bg-slate-50/50">
          <div className="flex items-center gap-2 mb-2">
            <Filter className="h-4 w-4 text-slate-400" />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('admin.filters') || 'Filters'}</span>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="ml-auto text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
            <div className="relative col-span-2 sm:col-span-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
                placeholder={t('admin.product')}
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{t('admin.category')}: All</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <select
              value={filterStock}
              onChange={(e) => setFilterStock(e.target.value as 'all' | 'in-stock' | 'out-of-stock')}
              className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">{t('admin.stock')}: All</option>
              <option value="in-stock">In Stock</option>
              <option value="out-of-stock">Out of Stock</option>
            </select>
            <select
              value={filterFeatured}
              onChange={(e) => setFilterFeatured(e.target.value as 'all' | 'yes' | 'no')}
              className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 hidden md:block"
            >
              <option value="all">{t('admin.featured')}: All</option>
              <option value="yes">Featured</option>
              <option value="no">Not Featured</option>
            </select>
            <select
              value={filterVisible}
              onChange={(e) => setFilterVisible(e.target.value as 'all' | 'yes' | 'no')}
              className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 hidden md:block"
            >
              <option value="all">{t('admin.visible')}: All</option>
              <option value="yes">Visible</option>
              <option value="no">Hidden</option>
            </select>
            <select
              value={filterMargin}
              onChange={(e) => setFilterMargin(e.target.value as typeof filterMargin)}
              className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">{t('admin.margin')}: {t('admin.filterAll')}</option>
              <option value="onSale">{t('admin.filterOnSale')}</option>
              <option value="onSaleMoving">{t('admin.filterOnSaleMoving')}</option>
              <option value="onSaleStale">{t('admin.filterOnSaleStale')}</option>
              <option value="below40">{t('admin.filterMarginBelow', { pct: 40 })}</option>
              <option value="below25">{t('admin.filterMarginBelow', { pct: 25 })}</option>
              <option value="noCost">{t('admin.filterNoCost')}</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="newest">{t('admin.sortNewest')}</option>
              <option value="marginAsc">{t('admin.sortMarginAsc')}</option>
              <option value="marginDesc">{t('admin.sortMarginDesc')}</option>
              <option value="priceAsc">{t('admin.sortPriceAsc')}</option>
              <option value="priceDesc">{t('admin.sortPriceDesc')}</option>
              <option value="stockAsc">{t('admin.sortStockAsc')}</option>
            </select>
          </div>
          {hasActiveFilters && (
            <p className="text-xs text-slate-500 mt-2">
              Showing {sortedProducts.length} of {products.length} products
            </p>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 sm:px-4 py-3.5 w-10">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    aria-label={t('admin.selectAllVisible')}
                    title={t('admin.selectAllVisible')}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </th>
                <th className="px-4 sm:px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {t('admin.product')}
                </th>
                <th className="px-4 sm:px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">
                  {t('admin.category')}
                </th>
                <th className="px-4 sm:px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {t('admin.price')}
                </th>
                <th className="px-4 sm:px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {t('admin.costMargin')}
                </th>
                <th className="px-4 sm:px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">
                  {t('admin.soldWindow')}
                </th>
                <th className="px-4 sm:px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {t('admin.stock')}
                </th>
                <th className="px-4 sm:px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">
                  {t('admin.featured')}
                </th>
                <th className="px-4 sm:px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">
                  {t('admin.visible')}
                </th>
                <th className="px-4 sm:px-6 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {t('admin.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 sm:px-6 py-12 text-center text-slate-400">
                    {t('admin.loadingProducts')}
                  </td>
                </tr>
              ) : sortedProducts.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 sm:px-6 py-12 text-center text-slate-400">
                    {hasActiveFilters ? 'No products match the current filters' : t('admin.noProducts')}
                  </td>
                </tr>
              ) : (
                sortedProducts.map(product => {
                  // Check if imageUrl is a valid URL
                  const m = getMarginInfo(product);
                  const sold90 = unitsSoldSince(product, VELOCITY_WINDOW_DAYS);
                  const isValidImageUrl = product.imageUrl && (
                    product.imageUrl.startsWith('http://') ||
                    product.imageUrl.startsWith('https://') ||
                    product.imageUrl.startsWith('/')
                  );
                  return (
                  <tr key={product.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-3 sm:px-4 py-3.5 sm:py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(product.id)}
                        onChange={() => toggleOne(product.id)}
                        aria-label={product.name}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>
                    <td className="px-4 sm:px-6 py-3.5 sm:py-4">
                      <div className="flex items-center gap-3">
                        <div className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-lg overflow-hidden bg-slate-100 shrink-0">
                          {isValidImageUrl ? (
                            <Image src={product.imageUrl} alt={product.name} fill className="object-cover" sizes="48px" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-300 text-xs">
                              {t('common.noImage')}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <Link href={`/product/${product.id}`} className="font-semibold text-slate-800 hover:text-blue-600 transition-colors text-sm sm:text-base truncate block max-w-[120px] sm:max-w-none">{product.name}</Link>
                          <span className="text-xs text-slate-400 sm:hidden">{product.category}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 sm:px-6 py-3.5 sm:py-4 text-slate-500 text-sm hidden sm:table-cell">{product.category}</td>
                    <td className="px-4 sm:px-6 py-3.5 sm:py-4 text-slate-700 font-medium text-sm">
                      {m.onSale ? (
                        <span className="flex flex-col">
                          <span className="text-red-700 tabular-nums">{m.effectivePrice.toFixed(2)} ден.</span>
                          <span className="text-[11px] text-slate-400 line-through tabular-nums">{product.price.toFixed(2)} ден.</span>
                        </span>
                      ) : (
                        <span className="tabular-nums">{product.price.toFixed(2)} ден.</span>
                      )}
                    </td>
                    <td className="px-4 sm:px-6 py-3.5 sm:py-4 text-sm">
                      {m.margin === null ? (
                        <span className="text-slate-400" title={t('admin.noCostHint')}>—</span>
                      ) : (
                        <span className="flex flex-col">
                          <span className={`font-semibold tabular-nums ${marginToneClass(m.margin)}`}>
                            {(m.margin * 100).toFixed(1)}%
                          </span>
                          <span className="text-[11px] text-slate-400 tabular-nums">
                            {m.cost!.toFixed(0)} ден. · markup {((m.markupPct ?? 0) * 100).toFixed(0)}%
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 sm:px-6 py-3.5 sm:py-4 text-sm hidden lg:table-cell">
                      {sold90 > 0 ? (
                        <span className="tabular-nums font-medium text-slate-700">{sold90}</span>
                      ) : (
                        <span className="text-slate-300 tabular-nums">0</span>
                      )}
                    </td>
                    <td className="px-4 sm:px-6 py-3.5 sm:py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${product.stock > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                        {product.stock}
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-3.5 sm:py-4 hidden md:table-cell">
                      {product.featured ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                          {t('common.yes')}
                        </span>
                      ) : (
                        <span className="text-slate-300 text-sm">{t('common.no')}</span>
                      )}
                    </td>
                    <td className="px-4 sm:px-6 py-3.5 sm:py-4 hidden md:table-cell">
                      <button
                        onClick={() => handleToggleVisibility(product)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                          product.isVisible !== false
                            ? 'bg-green-50 text-green-700 hover:bg-green-100'
                            : 'bg-red-50 text-red-700 hover:bg-red-100'
                        }`}
                        title={product.isVisible !== false ? t('admin.productVisible') : t('admin.productHidden')}
                      >
                        {product.isVisible !== false ? (
                          <><Eye className="h-3.5 w-3.5" />{t('admin.visible')}</>
                        ) : (
                          <><EyeOff className="h-3.5 w-3.5" />{t('admin.hidden')}</>
                        )}
                      </button>
                    </td>
                    <td className="px-4 sm:px-6 py-3.5 sm:py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setEditingProduct(product)}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title={t('admin.edit')}
                        >
                          <Edit2 className="h-4 w-4 sm:h-5 sm:w-5" />
                        </button>
                        <button
                          onClick={() => handleDelete(product)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title={t('admin.delete')}
                        >
                          <Trash2 className="h-4 w-4 sm:h-5 sm:w-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );})
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Product Form Modal */}
      {showForm && (
        <ProductForm onSave={handleCreate} onCancel={() => setShowForm(false)} />
      )}
      {editingProduct && (
        <ProductForm
          product={editingProduct}
          onSave={handleUpdate}
          onCancel={() => setEditingProduct(undefined)}
        />
      )}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return <LoginForm />;
  }

  return <AdminDashboard />;
}
