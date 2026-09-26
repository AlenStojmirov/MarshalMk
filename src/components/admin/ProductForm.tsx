'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Save, X, ImagePlus, PlusCircle, Trash, Tag } from 'lucide-react';
import { uploadProductImage, updateProduct } from '@/hooks/useProducts';
import { supabase } from '@/lib/supabase';
import { applyStockCount } from '@/lib/stock';
import { Product, ProductFormData, ProductSize } from '@/types';
import { useTranslation } from '@/lib/i18n';
import {
  grossMargin, markup, unitProfit, markdownFloorPrice,
  MARKDOWN_FLOOR, MARGIN_LOW, MARGIN_WATCH,
} from '@/lib/cost';

export function marginToneClass(margin: number | null): string {
  if (margin === null) return 'text-slate-400';
  if (margin < MARGIN_LOW) return 'text-red-700';
  if (margin < MARGIN_WATCH) return 'text-amber-700';
  return 'text-green-700';
}

interface ProductFormProps {
  product?: Product;
  onSave: (data: ProductFormData, customId?: string) => Promise<void>;
  onCancel: () => void;
  /**
   * The purchase price field and the margin panel. Off for staff (8.3/8.5):
   * they never see or enter what a piece cost; the admin adds it later.
   */
  showCost?: boolean;
}

export default function ProductForm({ product, onSave, onCancel, showCost = true }: ProductFormProps) {
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

            {showCost && (
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
            )}

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
            {showCost && (
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
            )}

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

/**
 * Save an edit from the form. A price change must never rewrite the shelf
 * (D-013): the form holds the quantities from the moment it opened, and writing
 * them back on every save would resurrect anything sold or reserved meanwhile.
 * So quantities are only written when they were actually changed — a stock
 * count — and then only if the shelf still matches what the form started from.
 *
 * Returns an error message and writes nothing else when the count lost.
 */
export async function saveProductEdit(editing: Product, data: ProductFormData): Promise<string | null> {
  const { sizes, stock: _stock, ...rest } = data;
  void _stock;

  const before = JSON.stringify(
    (editing.sizes ?? []).map((s) => [String(s.size).trim(), Number(s.quantity) || 0])
  );
  const after = JSON.stringify(
    (sizes ?? []).map((s) => [String(s.size).trim(), Number(s.quantity) || 0])
  );

  if (before !== after) {
    const res = await applyStockCount(supabase, editing.id, editing.sizes ?? [], sizes ?? []);
    if (!res.ok) return res.error ?? 'Залихата е променета во меѓувреме.';
  }

  await updateProduct(editing.id, rest);
  return null;
}
