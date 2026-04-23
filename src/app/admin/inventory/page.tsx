'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useTranslation } from '@/lib/i18n';
import {
  fetchInventoryProducts,
  migrateAllProducts,
  exportInventoryData,
  importInventoryData,
  isRealtimeDatabaseConfigured,
  InventoryData,
} from '@/lib/inventory-sync';
import {
  ArrowLeft,
  RefreshCw,
  Database,
  Upload,
  Download,
  CheckCircle,
  AlertCircle,
  Package,
} from 'lucide-react';

function InventoryManagement() {
  const { t } = useTranslation();
  const [inventory, setInventory] = useState<InventoryData>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<{
    migrated: number;
    updated: number;
    errors: string[];
  } | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadInventory = async () => {
    // Check if RTDB is configured first
    if (!isRealtimeDatabaseConfigured()) {
      setIsConfigured(false);
      setLoading(false);
      setError(t('inventory.notConfigured'));
      return;
    }

    setIsConfigured(true);
    setLoading(true);
    setError(null);
    try {
      const data = await fetchInventoryProducts();
      setInventory(data);
    } catch (err) {
      console.error('Error loading inventory:', err);
      setError(t('inventory.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInventory();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMigrate = async () => {
    if (!confirm(t('inventory.confirmSync'))) {
      return;
    }

    setMigrating(true);
    setMigrationResult(null);
    try {
      const result = await migrateAllProducts();
      setMigrationResult(result);
    } catch (err) {
      console.error('Migration error:', err);
      setError(t('inventory.syncFailed'));
    } finally {
      setMigrating(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const jsonData = await exportInventoryData();
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inventory-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
      setError('Failed to export inventory data.');
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm('Are you sure you want to import data? This will add/overwrite products in the Realtime Database.')) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setImporting(true);
    setError(null);
    try {
      const text = await file.text();
      const result = await importInventoryData(text);
      if (result.errors.length > 0) {
        setError(`Imported ${result.imported} products with ${result.errors.length} errors: ${result.errors.join(', ')}`);
      } else {
        setMigrationResult(null);
        alert(`Successfully imported ${result.imported} products.`);
      }
      await loadInventory();
    } catch (err) {
      console.error('Import error:', err);
      setError(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const productCount = Object.keys(inventory).length;
  const totalItems = Object.values(inventory).reduce((sum, product) => {
    const sizes = Array.isArray(product.sizes) ? product.sizes : Object.values(product.sizes || {});
    return sum + sizes.reduce((s, size) => s + (size.quantity || 0), 0);
  }, 0);
  const totalItemsPrice = Object.values(inventory).reduce((sum, product) => {
    const sizes = Array.isArray(product.sizes) ? product.sizes : Object.values(product.sizes || {});
    return sum + sizes.reduce((s, size) => s + (size.quantity * ((product.purchasePrice || 0)/2) || 0), 0);
  }, 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-2 text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('inventory.backToDashboard')}
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{t('inventory.title')}</h1>
          <p className="text-sm sm:text-base text-gray-500 mt-1">
            {t('inventory.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <button
            onClick={handleExport}
            disabled={exporting || loading || productCount === 0}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors text-sm sm:text-base"
          >
            <Download className={`h-4 w-4 sm:h-5 sm:w-5 ${exporting ? 'animate-pulse' : ''}`} />
            <span className="hidden sm:inline">Export</span>
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing || loading}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors text-sm sm:text-base"
          >
            <Upload className={`h-4 w-4 sm:h-5 sm:w-5 ${importing ? 'animate-pulse' : ''}`} />
            <span className="hidden sm:inline">Import</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />
          <button
            onClick={loadInventory}
            disabled={loading}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors text-sm sm:text-base"
          >
            <RefreshCw className={`h-4 w-4 sm:h-5 sm:w-5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{t('inventory.refresh')}</span>
          </button>
          <button
            onClick={handleMigrate}
            disabled={migrating || loading || productCount === 0}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm sm:text-base"
          >
            <Upload className={`h-4 w-4 sm:h-5 sm:w-5 ${migrating ? 'animate-pulse' : ''}`} />
            {migrating ? t('inventory.syncing') : t('inventory.syncAll')}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
        <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
          <div className="flex items-center gap-3 sm:gap-4">
            <Database className="h-8 w-8 sm:h-10 sm:w-10 text-blue-600 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs sm:text-sm text-gray-500 truncate">{t('inventory.productsInInventory')}</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900">{productCount}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
          <div className="flex items-center gap-3 sm:gap-4">
            <Package className="h-8 w-8 sm:h-10 sm:w-10 text-green-600 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs sm:text-sm text-gray-500 truncate">{t('inventory.totalItemsInStock')}</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900">{totalItems}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
          <div className="flex items-center gap-3 sm:gap-4">
            <Package className="h-8 w-8 sm:h-10 sm:w-10 text-green-600 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs sm:text-sm text-gray-500 truncate">{t('inventory.totalItemsPurchasePriceInStock')}</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900">{totalItemsPrice}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 sm:col-span-2 lg:col-span-1">
          <div className="flex items-center gap-3 sm:gap-4">
            {migrationResult ? (
              migrationResult.errors.length > 0 ? (
                <AlertCircle className="h-8 w-8 sm:h-10 sm:w-10 text-amber-600 shrink-0" />
              ) : (
                <CheckCircle className="h-8 w-8 sm:h-10 sm:w-10 text-green-600 shrink-0" />
              )
            ) : (
              <Upload className="h-8 w-8 sm:h-10 sm:w-10 text-gray-400 shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-xs sm:text-sm text-gray-500 truncate">{t('inventory.lastSyncResult')}</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 truncate">
                {migrationResult
                  ? `${migrationResult.migrated} new, ${migrationResult.updated} updated`
                  : t('inventory.notSyncedYet')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Migration Result */}
      {migrationResult && (
        <div
          className={`mb-6 p-4 rounded-lg ${
            migrationResult.errors.length > 0
              ? 'bg-amber-50 border border-amber-200'
              : 'bg-green-50 border border-green-200'
          }`}
        >
          <p className="font-medium">
            {migrationResult.errors.length > 0 ? (
              <span className="text-amber-800">
                {t('inventory.syncedWithErrors', { migrated: migrationResult.migrated, errors: migrationResult.errors.length })}
              </span>
            ) : (
              <span className="text-green-800">
                {`${migrationResult.migrated} new products migrated, ${migrationResult.updated} existing products updated`}
              </span>
            )}
          </p>
          {migrationResult.errors.length > 0 && (
            <ul className="mt-2 text-sm text-amber-700">
              {migrationResult.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-600">{error}</p>
        </div>
      )}

      {/* Inventory Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900">
            {t('inventory.inventoryProducts')}
          </h2>
        </div>

        {loading ? (
          <div className="p-8 sm:p-12 text-center">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-gray-500 text-sm sm:text-base">{t('inventory.loadingInventory')}</p>
          </div>
        ) : productCount === 0 ? (
          <div className="p-8 sm:p-12 text-center">
            <Database className="h-10 w-10 sm:h-12 sm:w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-sm sm:text-base">{t('inventory.noProductsFound')}</p>
            <p className="text-xs sm:text-sm text-gray-400 mt-2">
              {t('inventory.checkConfig')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('inventory.id')}
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('inventory.name')}
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">
                    {t('inventory.brand')}
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                    {t('admin.category')}
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('admin.price')}
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('inventory.sizesStock')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {Object.entries(inventory).map(([id, product]) => {
                  const sizes = Array.isArray(product.sizes) ? product.sizes : Object.values(product.sizes || {});
                  const totalStock = sizes.reduce(
                    (sum, s) => sum + (s.quantity || 0),
                    0
                  );
                  return (
                    <tr key={id} className="hover:bg-gray-50">
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm text-gray-500 font-mono">
                        <span className="hidden sm:inline">{id.substring(0, 20)}...</span>
                        <span className="sm:hidden">{id.substring(0, 8)}...</span>
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 font-medium text-gray-900 text-sm">
                        {product.name}
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-gray-500 text-sm hidden md:table-cell">
                        {product.brand || '-'}
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-gray-500 text-sm hidden sm:table-cell">
                        {product.category}
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-gray-900 text-sm">
                        {product.price} ден.
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4">
                        <div className="flex flex-wrap gap-1">
                          {sizes.map((s) => (
                            <span
                              key={s.size}
                              className={`inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded text-xs font-medium ${
                                s.quantity > 0
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-gray-100 text-gray-500 line-through'
                              }`}
                            >
                              {s.size}: {s.quantity}
                            </span>
                          ))}
                          <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            {t('common.total')}: {totalStock}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function LoginPrompt() {
  const { t } = useTranslation();
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center">
        <p className="text-xl text-gray-500 mb-4">
          {t('inventory.loginRequired')}
        </p>
        <Link
          href="/admin"
          className="text-blue-600 hover:text-blue-800 font-medium"
        >
          {t('inventory.goToLogin')}
        </Link>
      </div>
    </div>
  );
}

export default function AdminInventoryPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return <LoginPrompt />;
  }

  return <InventoryManagement />;
}
