'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useProduct, deleteProduct, updateProduct } from '@/hooks/useProducts';
import { NonSaleReason, Product } from '@/types';
import { recordProductSale, refundProductSale } from '@/hooks/useInStoreSales';
import { NON_SALE_REASONS } from '@/lib/sales-ledger';
import {
  ArrowLeft,
  Plus,
  RefreshCw,
  Trash2,
  Edit,
  Package,
  DollarSign,
  Calendar,
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useTranslation } from '@/lib/i18n';
import { getEffectivePrice, isOnSale } from '@/lib/pricing';
import { grossMargin, markup } from '@/lib/cost';

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function ProductDetailView() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const productId = params.id as string;
  const { product, loading, error } = useProduct(productId);

  const [localProduct, setLocalProduct] = useState<Product | null>(null);
  const [sellForm, setSellForm] = useState<{ size: string; price: string; reason: NonSaleReason | '' }>(
    { size: '', price: '', reason: '' }
  );
  const [selling, setSelling] = useState(false);

  useEffect(() => {
    if (product) {
      setLocalProduct(product);
      // Start from the price on the tag today; a counter discount is typed over it.
      setSellForm((f) => (f.price ? f : { ...f, price: String(getEffectivePrice(product)) }));
    }
  }, [product]);

  const toggleNoReorder = async () => {
    if (!localProduct) return;
    const next = !localProduct.noReorder;
    try {
      // Only this one field is written: nothing here may touch stock (D-013).
      await updateProduct(localProduct.id, { noReorder: next });
      setLocalProduct({ ...localProduct, noReorder: next });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(/no_reorder/.test(msg)
        ? 'Недостасува миграцијата 006. Пушти ја во Supabase SQL Editor.'
        : msg);
    }
  };

  const handleDelete = async () => {
    if (window.confirm(t('productDetail.confirmDelete'))) {
      await deleteProduct(productId);
      router.push('/admin');
    }
  };

  // Both sell and refund go through the same functions as the POS. This page
  // used to write sold[] by hand, which skipped the ledger entirely and could
  // not record why a unit left at price 0 (D-012).
  const handleSell = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localProduct || !sellForm.size || sellForm.price === '') return;
    const price = Math.max(0, Number(sellForm.price) || 0);
    if (!(price > 0) && !sellForm.reason) return;

    setSelling(true);
    try {
      const today = formatDateKey(new Date());
      const written = await recordProductSale(
        localProduct, sellForm.size, price, today,
        price > 0 ? undefined : (sellForm.reason || undefined)
      );
      // Show what was actually written, which includes anything that changed
      // on the row since this page loaded.
      setLocalProduct({ ...localProduct, ...written });
      setSellForm({ size: '', price: String(getEffectivePrice(localProduct)), reason: '' });
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSelling(false);
    }
  };

  const handleRefund = async (soldIdx: number) => {
    if (!localProduct || !localProduct.sold) return;
    // Removes the matching ledger row as well — a POS-written row is never
    // pruned by ledger:sync, so leaving it would keep a phantom sale for good.
    try {
      const next = await refundProductSale(localProduct, soldIdx);
      setLocalProduct(next);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !localProduct) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('productDetail.notFound')}</h1>
          <Link href="/admin" className="text-blue-600 hover:text-blue-700 font-medium">
            {t('productDetail.backToDashboard')}
          </Link>
        </div>
      </div>
    );
  }

  // Available sizes with stock > 0
  const availableSizes = (localProduct.sizes || []).filter(sz => sz.quantity > 0);

  // Margin is shown on the effective price — the sale price when one is active.
  // That is the figure that says whether the discount is still worth taking.
  const effective = getEffectivePrice(localProduct);
  const onSaleNow = isOnSale(localProduct);
  const marginNow = grossMargin(effective, localProduct.purchasePrice);
  const markupNow = markup(effective, localProduct.purchasePrice);

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
      <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
        {/* Header with image */}
        <div className="flex items-start gap-3 sm:gap-4 mb-4 sm:mb-6">
          <div className="flex gap-2 flex-wrap shrink-0">
            {localProduct.imageUrl && (
              <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden bg-gray-100">
                <Image
                  src={localProduct.imageUrl}
                  alt={localProduct.name}
                  fill
                  className="object-cover"
                  sizes="96px"
                />
              </div>
            )}
            {localProduct.images && localProduct.images.length > 0 && localProduct.images.map((img, idx) => (
              <div key={idx} className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden bg-gray-100">
                <Image
                  src={img}
                  alt={`${localProduct.name} ${idx + 2}`}
                  fill
                  className="object-cover"
                  sizes="96px"
                />
              </div>
            ))}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">{localProduct.name}</h1>
            <p className="text-sm sm:text-base text-gray-500 truncate">{localProduct.brand} | {localProduct.category}</p>
            <p className="text-base sm:text-lg font-bold text-gray-900 mt-1">
              {effective.toFixed(2)} ден.
              {onSaleNow ? (
                <span className="ml-2 text-sm font-normal text-slate-400 line-through tabular-nums">
                  {localProduct.price.toFixed(2)} ден.
                </span>
              ) : null}
            </p>
            <p className="text-xs sm:text-sm mt-0.5">
              {marginNow === null ? (
                <span className="text-slate-400">{t('admin.noCostHint')}</span>
              ) : (
                <>
                  <span className={`font-semibold ${marginNow < 0.25 ? 'text-red-700' : marginNow < 0.4 ? 'text-amber-700' : 'text-green-700'}`}>
                    {t('admin.margin')} {(marginNow * 100).toFixed(1)}%
                  </span>
                  <span className="text-slate-400">
                    {' · '}{t('admin.purchasePrice')} {localProduct.purchasePrice!.toFixed(0)} ден.
                    {' · markup '}{((markupNow ?? 0) * 100).toFixed(0)}%
                  </span>
                </>
              )}
            </p>
            {localProduct.color && (
              <p className="text-xs sm:text-sm text-gray-500">{t('productDetail.color')}: {localProduct.color}</p>
            )}
          </div>
        </div>

        {/* Stock by size */}
        <div className="mb-4 sm:mb-6">
          <h3 className="font-bold text-gray-700 mb-2 sm:mb-3 flex items-center gap-2 text-sm sm:text-base">
            <Package className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('productDetail.stockBySize')}
          </h3>
          <div className="space-y-2">
            {localProduct.sizes?.map((sz) => (
              <div
                key={sz.size}
                className={`flex items-center justify-between p-2 sm:p-3 rounded-lg border-l-4 ${
                  sz.quantity === 0
                    ? 'border-red-500 bg-red-50'
                    : 'border-green-500 bg-green-50'
                }`}
              >
                <span className="font-bold text-gray-900 text-sm sm:text-base">{sz.size}</span>
                <div className="flex items-center gap-2">
                  <span className={`font-bold text-base sm:text-lg ${sz.quantity === 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {sz.quantity}
                  </span>
                  <span className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-xs font-medium ${
                    sz.quantity === 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                  }`}>
                    {sz.quantity === 0 ? t('productDetail.outOfStock') : t('productDetail.available')}
                  </span>
                </div>
              </div>
            ))}
            {(!localProduct.sizes || localProduct.sizes.length === 0) && (
              <p className="text-gray-500 italic text-sm">{t('productDetail.noSizes')}</p>
            )}
          </div>
        </div>

        {/* Sell product form */}
        <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-gray-50 rounded-lg">
          <h3 className="font-bold text-gray-700 mb-2 sm:mb-3 flex items-center gap-2 text-sm sm:text-base">
            <DollarSign className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('productDetail.sellProduct')}
          </h3>
          <form onSubmit={handleSell} className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-2 sm:gap-3">
            <div className="flex-1 min-w-0 sm:min-w-[120px]">
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                {t('productDetail.size')}
              </label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm sm:text-base"
                required
                value={sellForm.size}
                onChange={e => setSellForm(f => ({ ...f, size: e.target.value }))}
              >
                <option value="">{t('productDetail.selectSize')}</option>
                {availableSizes.map(sz => (
                  <option key={sz.size} value={sz.size}>
                    {sz.size} ({sz.quantity} {t('productDetail.left')})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-0 sm:min-w-[120px]">
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                {t('productDetail.price')}
              </label>
              <input
                type="number"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm sm:text-base"
                required
                min={0}
                step="0.01"
                placeholder={t('productDetail.pricePlaceholder')}
                value={sellForm.price}
                onChange={e => setSellForm(f => ({
                  ...f,
                  price: e.target.value,
                  reason: Number(e.target.value) > 0 ? '' : f.reason,
                }))}
              />
            </div>
            {sellForm.price !== '' && !(Number(sellForm.price) > 0) && (
              <div className="flex-1 min-w-0 sm:min-w-[160px]">
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  {t('inStoreSales.reason')}
                </label>
                <select
                  required
                  value={sellForm.reason}
                  onChange={e => setSellForm(f => ({ ...f, reason: e.target.value as NonSaleReason | '' }))}
                  className={`w-full px-3 py-2 border rounded-lg text-sm sm:text-base ${
                    sellForm.reason ? 'border-gray-300' : 'border-red-400 bg-red-50'
                  }`}
                >
                  <option value="">{t('inStoreSales.chooseReason')}</option>
                  {NON_SALE_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {t(r === 'giveaway' ? 'inStoreSales.reasonGiveaway'
                        : r === 'personal' ? 'inStoreSales.reasonPersonal'
                        : 'inStoreSales.reasonWriteoff')}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button
              type="submit"
              disabled={
                !sellForm.size || sellForm.price === '' || selling || availableSizes.length === 0 ||
                (!(Number(sellForm.price) > 0) && !sellForm.reason)
              }
              className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm sm:text-base"
            >
              <Plus className="h-4 w-4" />
              {selling ? t('productDetail.selling') : t('productDetail.sell')}
            </button>
          </form>
          {availableSizes.length === 0 && (
            <p className="text-red-500 text-xs sm:text-sm mt-2">{t('productDetail.noStockToSell')}</p>
          )}
        </div>

        {/* Owner override for the reorder plan */}
        <label className="mb-4 sm:mb-6 flex items-start gap-2 p-3 rounded-lg border border-slate-200 bg-white cursor-pointer">
          <input
            type="checkbox"
            checked={localProduct.noReorder === true}
            onChange={toggleNoReorder}
            className="h-4 w-4 mt-0.5 rounded border-gray-300"
          />
          <span>
            <span className="block text-sm font-medium text-gray-800">{t('productDetail.noReorder')}</span>
            <span className="block text-xs text-gray-500">{t('productDetail.noReorderHint')}</span>
          </span>
        </label>

        {/* Sold items */}
        <div className="mb-4 sm:mb-6">
          <h3 className="font-bold text-gray-700 mb-2 sm:mb-3 flex items-center gap-2 text-sm sm:text-base">
            <Calendar className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('productDetail.soldItems')} ({localProduct.sold?.length || 0})
          </h3>
          {localProduct.sold && localProduct.sold.length > 0 ? (
            <div className="space-y-2 max-h-56 sm:max-h-64 overflow-y-auto">
              {localProduct.sold.map((item, idx) => (
                <div
                  key={idx}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-2 sm:p-3 bg-gray-50 rounded-lg gap-2"
                >
                  <div className="flex flex-wrap items-center gap-1 sm:gap-2 text-sm sm:text-base">
                    <span className="font-bold text-gray-900">{item.size}</span>
                    <span className="text-gray-600">{item.price.toFixed(2)} ден.</span>
                    {!(item.price > 0) && (
                      <span className="px-1.5 py-0.5 rounded bg-gray-200 text-gray-700 text-xs">
                        {t(item.reason === 'giveaway' ? 'inStoreSales.reasonGiveaway'
                          : item.reason === 'writeoff' ? 'inStoreSales.reasonWriteoff'
                          : 'inStoreSales.reasonPersonal')}
                      </span>
                    )}
                    <span className="text-gray-400 text-xs sm:text-sm">({item.soldDate})</span>
                  </div>
                  <button
                    onClick={() => handleRefund(idx)}
                    className="flex items-center justify-center gap-1 px-2 sm:px-3 py-1 bg-yellow-100 text-yellow-700 rounded-lg text-xs sm:text-sm font-medium hover:bg-yellow-200 transition-colors self-end sm:self-auto"
                  >
                    <RefreshCw className="h-3 w-3 sm:h-4 sm:w-4" />
                    {t('productDetail.refund')}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 italic text-sm">{t('productDetail.noSoldItems')}</p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row sm:justify-between gap-3 pt-4 border-t">
          <Link
            href="/admin"
            className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors text-sm sm:text-base order-last sm:order-first"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('productDetail.back')}
          </Link>
          <div className="flex gap-2">
            <button
              onClick={handleDelete}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors text-sm sm:text-base"
            >
              <Trash2 className="h-4 w-4" />
              {t('productDetail.delete')}
            </button>
            <Link
              href={`/admin?edit=${productId}`}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors text-sm sm:text-base"
            >
              <Edit className="h-4 w-4" />
              {t('productDetail.edit')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProductDetailPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-500 mb-4">Please log in to access this page.</p>
          <Link href="/admin" className="text-blue-600 hover:text-blue-700 font-medium">
            Go to Admin Login
          </Link>
        </div>
      </div>
    );
  }

  return <ProductDetailView />;
}
