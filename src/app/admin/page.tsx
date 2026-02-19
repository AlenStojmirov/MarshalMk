'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useProducts, createProduct, updateProduct, deleteProduct, uploadProductImage } from '@/hooks/useProducts';
import { Product, ProductFormData, ProductSize } from '@/types';
import { Plus, Edit2, Trash2, LogOut, X, Save, ImagePlus, Package, Database, PlusCircle, Trash, ShoppingBag, AlertTriangle, Receipt, Tag, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useTranslation } from '@/lib/i18n';

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
    category: product?.category || '',
    imageUrl: product?.imageUrl || '',
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
        percentageOff: isActive ? (prev.sale?.percentageOff || 0) : 0,
      },
    }));
  };

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

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('admin.productImage')}</label>
              <div className="flex items-start gap-4">
                {formData.imageUrl && (
                  <div className="relative w-24 h-24 rounded-lg overflow-hidden bg-gray-100">
                    <Image src={formData.imageUrl} alt="Preview" fill className="object-cover" sizes="96px" />
                  </div>
                )}
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

      {/* Navigation Links */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-6 sm:mb-8">
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
          href="/admin/expenses"
          className="flex items-center justify-center gap-2 px-3 py-3 bg-orange-50 border border-orange-200 text-orange-700 rounded-xl font-medium hover:bg-orange-100 transition-colors text-sm shadow-sm col-span-2 sm:col-span-1"
        >
          <Receipt className="h-4 w-4 sm:h-5 sm:w-5" />
          <span className="hidden xs:inline">{t('admin.expenses')}</span>
          <span className="xs:hidden">Expenses</span>
        </Link>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
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
                  <td colSpan={7} className="px-4 sm:px-6 py-12 text-center text-slate-400">
                    {t('admin.loadingProducts')}
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 sm:px-6 py-12 text-center text-slate-400">
                    {t('admin.noProducts')}
                  </td>
                </tr>
              ) : (
                products.map(product => {
                  // Check if imageUrl is a valid URL
                  const isValidImageUrl = product.imageUrl && (
                    product.imageUrl.startsWith('http://') ||
                    product.imageUrl.startsWith('https://') ||
                    product.imageUrl.startsWith('/')
                  );
                  return (
                  <tr key={product.id} className="hover:bg-slate-50/50 transition-colors">
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
                          <Link href={`/admin/product/${product.id}`} className="font-semibold text-slate-800 hover:text-blue-600 transition-colors text-sm sm:text-base truncate block max-w-[120px] sm:max-w-none">{product.name}</Link>
                          <span className="text-xs text-slate-400 sm:hidden">{product.category}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 sm:px-6 py-3.5 sm:py-4 text-slate-500 text-sm hidden sm:table-cell">{product.category}</td>
                    <td className="px-4 sm:px-6 py-3.5 sm:py-4 text-slate-700 font-medium text-sm">{product.price.toFixed(2)} ден.</td>
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
