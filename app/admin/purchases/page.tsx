'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  createPurchaseOrder,
  createSupplier,
  listSuppliers,
  receivePurchaseOrder,
  type PurchaseOrder,
  type PurchaseOrderItem,
  type Supplier,
} from '@/lib/services/purchases';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import PrimaryButton from '@/components/ui/PrimaryButton';
import LoadingState from '@/components/ui/LoadingState';

export default function PurchasesPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [supplierForm, setSupplierForm] = useState({
    name: '',
    contact_person: '',
    email: '',
    phone: '',
    address: '',
  });
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [orderItems, setOrderItems] = useState<PurchaseOrderItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedQty, setSelectedQty] = useState('1');
  const [selectedUnitCost, setSelectedUnitCost] = useState('0');
  const [selectedGamme, setSelectedGamme] = useState<string | null>(null);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [validatingReception, setValidatingReception] = useState<string | null>(null);
  const [confirmReceiveOrderId, setConfirmReceiveOrderId] = useState<string | null>(null);

  const totalOrderAmount = useMemo(
    () => orderItems.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_cost || 0), 0),
    [orderItems],
  );

  const gammes = useMemo(() => {
    const set = new Set<string>();
    let hasSansGamme = false;
    for (const p of products) {
      if (p.category_name) set.add(p.category_name);
      else hasSansGamme = true;
    }
    const sorted = Array.from(set).sort((a, b) => a.localeCompare(b));
    return hasSansGamme ? [...sorted, 'Sans gamme'] : sorted;
  }, [products]);

  const gridProducts = useMemo(() => {
    if (!selectedGamme) return products;
    if (selectedGamme === 'Sans gamme') return products.filter((p) => !p.category_name);
    return products.filter((p) => p.category_name === selectedGamme);
  }, [products, selectedGamme]);

  const PRODUCT_TILE_COLORS = [
    'from-cyan-500/20 to-cyan-500/5 border-cyan-500/40',
    'from-fuchsia-500/20 to-fuchsia-500/5 border-fuchsia-500/40',
    'from-amber-500/20 to-amber-500/5 border-amber-500/40',
    'from-emerald-500/20 to-emerald-500/5 border-emerald-500/40',
    'from-violet-500/20 to-violet-500/5 border-violet-500/40',
    'from-rose-500/20 to-rose-500/5 border-rose-500/40',
  ];

  const productTileColor = (gamme: string | null | undefined) => {
    const key = gamme ?? 'Sans gamme';
    let hash = 0;
    for (let i = 0; i < key.length; i += 1) hash = (hash + key.charCodeAt(i)) % PRODUCT_TILE_COLORS.length;
    return PRODUCT_TILE_COLORS[hash];
  };

  const productInitials = (name: string) => {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  };

  const fetchSuppliers = async () => {
    const data = await listSuppliers();
    setSuppliers(data);
    if (!selectedSupplierId && data[0]?.id) {
      setSelectedSupplierId(data[0].id);
    }
  };

  const fetchOrders = async () => {
    const { data } = await supabase
      .from('lmb_purchase_orders')
      .select('*')
      .order('created_at', { ascending: false });

    setOrders((data ?? []) as PurchaseOrder[]);
  };

  const fetchProducts = async () => {
    const { data } = await supabase.from('lmb_products').select('*').order('name', { ascending: true });
    setProducts(data ?? []);
    if (!selectedProductId && (data ?? [])[0]?.id) {
      setSelectedProductId((data ?? [])[0].id);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      await Promise.all([fetchSuppliers(), fetchOrders(), fetchProducts()]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateSupplier = async () => {
    try {
      const supplier = await createSupplier(supplierForm);
      setSupplierForm({ name: '', contact_person: '', email: '', phone: '', address: '' });
      await fetchSuppliers();
      setSelectedSupplierId(supplier.id ?? selectedSupplierId);
      alert('Fournisseur ajouté.');
    } catch (err: any) {
      alert(String(err?.message ?? err));
    }
  };

  const addOrderItem = () => {
    if (!selectedProductId) {
      alert('Sélectionnez un produit.');
      return;
    }

    const qty = Number(selectedQty || 0);
    const unitCost = Number(selectedUnitCost || 0);
    if (qty <= 0 || unitCost < 0) {
      alert('Quantité et coût unitaire doivent être valides.');
      return;
    }

    const product = products.find((p) => p.id === selectedProductId);
    setOrderItems((prev) => {
      const existingIndex = prev.findIndex((item) => (item.product_id ?? item.productId) === selectedProductId);
      if (existingIndex >= 0) {
        const updated = [...prev];
        const current = updated[existingIndex];
        const nextQty = Number(current.quantity ?? current.qty ?? 0) + qty;
        updated[existingIndex] = {
          ...current,
          quantity: nextQty,
          qty: nextQty,
          unit_cost: unitCost,
          unitCost,
          product_name: product?.name ?? current.product_name ?? current.name,
          name: product?.name ?? current.name ?? current.product_name,
          sku: product?.sku ?? current.sku,
          product_id: selectedProductId,
          productId: selectedProductId,
          total_amount: nextQty * unitCost,
          totalAmount: nextQty * unitCost,
        };
        return updated;
      }

      return [
        ...prev,
        {
          product_id: selectedProductId,
          productId: selectedProductId,
          product_name: product?.name ?? 'Produit',
          name: product?.name ?? 'Produit',
          sku: product?.sku,
          quantity: qty,
          qty,
          unit_cost: unitCost,
          unitCost,
          total_amount: qty * unitCost,
          totalAmount: qty * unitCost,
        },
      ];
    });

    setSelectedQty('1');
    setSelectedUnitCost('0');
  };

  const removeOrderItem = (productId: string) => {
    setOrderItems((prev) => prev.filter((item) => (item.product_id ?? item.productId) !== productId));
  };

  const handleCreateOrder = async () => {
    if (!selectedSupplierId) {
      alert('Sélectionnez un fournisseur.');
      return;
    }
    if (!orderItems.length) {
      alert('Ajoutez au moins un article avant de valider le bon de commande.');
      return;
    }

    setCreatingOrder(true);
    try {
      await createPurchaseOrder(selectedSupplierId, orderItems, totalOrderAmount, 'ORDERED');
      setOrderItems([]);
      await fetchOrders();
      alert('Bon de commande créé avec succès.');
    } catch (err: any) {
      alert(String(err?.message ?? err));
    } finally {
      setCreatingOrder(false);
    }
  };

  const handleReceiveOrder = async (orderId?: string) => {
    if (!orderId) return;
    setConfirmReceiveOrderId(null);

    setValidatingReception(orderId);
    try {
      await receivePurchaseOrder(orderId);
      await fetchOrders();
      alert('Réception validée. Les quantités reçues ont été ajoutées à la réserve centrale.');
    } catch (err: any) {
      alert(String(err?.message ?? err));
    } finally {
      setValidatingReception(null);
    }
  };

  const statusBadge = (status?: string) => {
    switch (status) {
      case 'DRAFT':
        return <span className="rounded-full bg-slate-600 px-2 py-1 text-xs font-semibold text-white">DRAFT</span>;
      case 'ORDERED':
        return <span className="rounded-full bg-amber-500 px-2 py-1 text-xs font-semibold text-slate-950">ORDERED</span>;
      case 'RECEIVED':
        return <span className="rounded-full bg-emerald-600 px-2 py-1 text-xs font-semibold text-white">RECEIVED</span>;
      default:
        return <span className="rounded-full bg-slate-600 px-2 py-1 text-xs font-semibold text-white">{status}</span>;
    }
  };

  return (
    <div className="min-h-screen bg-[#F9F9FB] px-6 py-8 text-[#111111]">
      <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-[#C5A059]">Purchases</p>
          <h1 className="mt-1 text-3xl font-black text-[#111111]">Achats & Fournisseurs</h1>
          <p className="mt-1 text-sm text-[#444444]">Suivi des commandes fournisseurs et réception en réserve centrale.</p>
        </div>
        <Link
          href="/admin"
          className="mt-3 sm:mt-0 rounded-xl border border-[#D4AF37]/30 bg-[#111111] px-4 py-2 text-sm font-bold text-[#F9F9FB]"
        >
          ← Retour dashboard
        </Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-[#D4AF37]/20 bg-[#111111] p-5 shadow-md shadow-[#D4AF37]/10">
            <h2 className="mb-4 text-lg font-bold text-white">Nouveau fournisseur</h2>
            <div className="space-y-3">
              <Input
                value={supplierForm.name}
                onChange={(e) => setSupplierForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Nom du fournisseur"
              />
              <Input
                value={supplierForm.contact_person}
                onChange={(e) => setSupplierForm((prev) => ({ ...prev, contact_person: e.target.value }))}
                placeholder="Personne de contact"
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  value={supplierForm.email}
                  onChange={(e) => setSupplierForm((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="Email"
                />
                <Input
                  value={supplierForm.phone}
                  onChange={(e) => setSupplierForm((prev) => ({ ...prev, phone: e.target.value }))}
                  placeholder="Téléphone"
                />
              </div>
              <Textarea
                value={supplierForm.address}
                onChange={(e) => setSupplierForm((prev) => ({ ...prev, address: e.target.value }))}
                placeholder="Adresse"
                rows={3}
              />
              <PrimaryButton onClick={handleCreateSupplier} className="w-full">
                Enregistrer le fournisseur
              </PrimaryButton>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="mb-4 text-lg font-semibold">Sélection fournisseur</h2>
            <Select value={selectedSupplierId} onChange={(e) => setSelectedSupplierId(e.target.value)}>
              <option value="">Sélectionner un fournisseur</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Créer un bon de commande</h2>
              <div className="text-sm font-semibold text-cyan-300">Total: {totalOrderAmount.toLocaleString('fr-FR')} XOF</div>
            </div>

            {products.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedGamme(null)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    selectedGamme === null
                      ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                      : 'border-slate-700 bg-slate-950 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  Toutes ({products.length})
                </button>
                {gammes.map((gamme) => {
                  const count = gamme === 'Sans gamme'
                    ? products.filter((p) => !p.category_name).length
                    : products.filter((p) => p.category_name === gamme).length;
                  return (
                    <button
                      key={gamme}
                      type="button"
                      onClick={() => setSelectedGamme(gamme)}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                        selectedGamme === gamme
                          ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                          : 'border-slate-700 bg-slate-950 text-slate-400 hover:border-slate-500'
                      }`}
                    >
                      {gamme} ({count})
                    </button>
                  );
                })}
              </div>
            )}

            <div className="mb-4 max-h-72 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 p-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {gridProducts.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => {
                      setSelectedProductId(product.id);
                      if (product.cost_price_xof != null) {
                        setSelectedUnitCost(String(Math.round(Number(product.cost_price_xof))));
                      }
                    }}
                    className={`flex flex-col items-center gap-1 rounded-xl border bg-gradient-to-br p-2 text-center transition ${productTileColor(product.category_name)} ${
                      selectedProductId === product.id ? 'ring-2 ring-cyan-400' : 'hover:brightness-110'
                    }`}
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-950/60 text-xs font-bold text-white">
                      {productInitials(product.name)}
                    </div>
                    <div className="line-clamp-2 text-[11px] font-medium leading-tight text-slate-100">{product.name}</div>
                    <div className="text-[10px] text-slate-400">{product.sku}</div>
                  </button>
                ))}
                {gridProducts.length === 0 && (
                  <div className="col-span-full py-4 text-center text-xs text-slate-500">Aucun produit dans cette gamme.</div>
                )}
              </div>
            </div>

            <div className="mb-4 grid gap-3 md:grid-cols-[1.8fr_0.8fr_0.8fr_auto]">
              <div className="flex items-center rounded-xl border border-slate-800 bg-slate-950 px-3 text-sm text-slate-300">
                {selectedProductId
                  ? (products.find((p) => p.id === selectedProductId)?.name ?? 'Produit sélectionné')
                  : 'Cliquez un produit ci-dessus'}
              </div>
              <Input
                type="number"
                min={1}
                value={selectedQty}
                onChange={(e) => setSelectedQty(e.target.value)}
                placeholder="Qté"
              />
              <Input
                type="number"
                min={0}
                step="0.01"
                value={selectedUnitCost}
                onChange={(e) => setSelectedUnitCost(e.target.value)}
                placeholder="Coût"
              />
              <PrimaryButton onClick={addOrderItem} className="py-2 px-3">
                Ajouter
              </PrimaryButton>
            </div>

            {orderItems.length > 0 ? (
              <div className="overflow-hidden rounded-xl border border-slate-800">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-800 text-slate-300">
                    <tr>
                      <th className="px-3 py-2 text-left">Produit</th>
                      <th className="px-3 py-2 text-left">Qté</th>
                      <th className="px-3 py-2 text-left">PU</th>
                      <th className="px-3 py-2 text-left">Total</th>
                      <th className="px-3 py-2 text-left">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderItems.map((item) => (
                      <tr key={`${item.product_id ?? item.productId}`} className="border-t border-slate-800">
                        <td className="px-3 py-2">{item.product_name ?? item.name ?? item.sku ?? 'Produit'}</td>
                        <td className="px-3 py-2">{Number(item.quantity ?? item.qty ?? 0)}</td>
                        <td className="px-3 py-2">{Number(item.unit_cost ?? item.unitCost ?? 0).toLocaleString('fr-FR')} XOF</td>
                        <td className="px-3 py-2">{Number(item.total_amount ?? item.totalAmount ?? 0).toLocaleString('fr-FR')} XOF</td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => removeOrderItem(String(item.product_id ?? item.productId))}
                            className="text-rose-400"
                          >
                            Retirer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950 p-4 text-sm text-slate-400">
                Aucun article ajouté pour le moment.
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <PrimaryButton onClick={handleCreateOrder} disabled={creatingOrder} className="">
                {creatingOrder ? 'Création...' : 'Valider le Bon de Commande'}
              </PrimaryButton>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="mb-4 text-lg font-semibold">Suivi des bons de commande</h2>
            {loading ? (
              <LoadingState />
            ) : orders.length === 0 ? (
              <p className="text-sm text-slate-400">Aucune commande enregistrée.</p>
            ) : (
              <div className="space-y-3">
                {orders.map((order) => (
                  <div key={order.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="text-sm text-cyan-300">{order.order_number}</div>
                        <div className="text-sm text-slate-400">
                          Fournisseur: {suppliers.find((s) => s.id === (order.supplier_id ?? order.supplierId))?.name ?? order.supplier_id}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {statusBadge(order.status)}
                        {order.status !== 'RECEIVED' && confirmReceiveOrderId === order.id && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-amber-300">Confirmer la réception ?</span>
                            <PrimaryButton onClick={() => handleReceiveOrder(order.id)} disabled={validatingReception === order.id} className="py-1 px-3 text-xs">
                              {validatingReception === order.id ? 'Validation...' : 'Confirmer'}
                            </PrimaryButton>
                            <button
                              type="button"
                              onClick={() => setConfirmReceiveOrderId(null)}
                              className="rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-slate-500"
                            >
                              Annuler
                            </button>
                          </div>
                        )}
                        {order.status !== 'RECEIVED' && confirmReceiveOrderId !== order.id && (
                          <PrimaryButton onClick={() => setConfirmReceiveOrderId(order.id ?? null)} disabled={validatingReception === order.id} className="py-1 px-3 text-xs">
                            Valider la Réception
                          </PrimaryButton>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 text-sm text-slate-300">
                      <div>Montant total: {Number(order.total_amount ?? 0).toLocaleString('fr-FR')} XOF</div>
                      <div>Créé le: {order.created_at ? new Date(order.created_at).toLocaleString('fr-FR') : ''}</div>
                      {order.received_at ? <div>Réception: {new Date(order.received_at).toLocaleString('fr-FR')}</div> : null}
                    </div>

                    <div className="mt-3 space-y-2">
                      {Array.isArray(order.items) && order.items.map((item, index) => (
                        <div key={`${order.id}-${index}`} className="flex items-center justify-between rounded-lg bg-slate-900 px-3 py-2 text-xs text-slate-300">
                          <span>{item.product_name ?? item.name ?? item.sku ?? 'Produit'}</span>
                          <span>
                            {Number(item.quantity ?? item.qty ?? 0)} x {Number(item.unit_cost ?? item.unitCost ?? 0).toLocaleString('fr-FR')} XOF
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
