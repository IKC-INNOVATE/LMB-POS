// app/admin/page.tsx
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import ReceiptModal, { ReceiptModalProps, ReceiptItem } from '@/components/pos/ReceiptModal';
import { Product, SaleReceipt } from '@/types';
import { createTransfer } from '@/lib/services/inventory';
import { updateProductPrice } from '@/lib/services/products';
import { getCurrentStaff, StaffRole } from '@/lib/services/auth';
import {
  Package,
  ShieldCheck,
  Building2,
  DollarSign,
  Tag,
  Plus,
  Trash2,
  Clock,
  Radio,
  Send,
  Truck,
  QrCode,
  AlertTriangle,
  Scale,
  Printer,
  Receipt,
  Boxes,
  FileCheck,
  Handshake
} from 'lucide-react';
import Input from '@/components/ui/Input';
import PrimaryButton from '@/components/ui/PrimaryButton';

type InlineTabId = 'STOCK' | 'INVENTORY_REPORTS' | 'ADMIN_FINANCES' | 'SALES_AUDIT';

interface LegacySaleItem {
  id?: string;
  product_id?: string;
  sku?: string;
  name?: string;
  quantity?: number;
  qty?: number;
  unit_price_xof?: number;
  appliedUnitPriceXof?: number;
  total_price_xof?: number;
  product?: {
    id?: string;
    sku?: string;
    name?: string;
    standard_retail_price_xof?: number;
  };
}

interface ShipmentCartItem {
  productId: string;
  name: string;
  sku: string;
  qty: number;
}

interface ProductSalesStat extends Product {
  qtySold: number;
  revenueXof: number;
  totalStock: number;
}

interface InventoryReportDetailItem {
  sku: string;
  name: string;
  theoretical: number;
  physical: number;
  discrepancy: number;
}

interface InventoryReportItem {
  id: string;
  created_at: string;
  cashier_name: string;
  location_country: string;
  total_expected: number;
  total_counted: number;
  net_variance: number;
  status: string;
  details: InventoryReportDetailItem[];
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [staffRole, setStaffRole] = useState<StaffRole | null>(null);
  // Horodatage de repli, figé une seule fois au montage (jamais recalculé
  // pendant le rendu), pour les rares ventes sans date enregistrée.
  const [fallbackNowIso] = useState(() => new Date().toISOString());

  // ---------------------------------------------------------------------------
  // DONNÉES CLOUD & ÉTATS
  // ---------------------------------------------------------------------------
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<SaleReceipt[]>([]);
  const [expenses, setExpenses] = useState<Record<string, unknown>[]>([]);
  const [, setTransfers] = useState<Record<string, unknown>[]>([]);
  const [inventoryReports, setInventoryReports] = useState<InventoryReportItem[]>([]);
  const [, setAttendanceRecords] = useState<Record<string, unknown>[]>([]);

  // NAVIGATION ONGLETS
  // Seuls STOCK / INVENTORY_REPORTS / ADMIN_FINANCES / SALES_AUDIT sont rendus
  // en ligne dans ce fichier - les autres onglets renvoient vers une page dédiée.
  const [activeTab, setActiveTab] = useState<InlineTabId>('STOCK');

  // MODALE DÉTAIL D'UN RAPPORT D'INVENTAIRE
  const [selectedReportDetail, setSelectedReportDetail] = useState<InventoryReportItem | null>(null);

  // TRI & RECHERCHE CATALOGUE
  const [stockSortMode] = useState<'SALES_DESC' | 'SALES_ASC' | 'SKU' | 'LOW_STOCK'>('SALES_DESC');
  const [searchStock, setSearchStock] = useState<string>('');

  // MODALE TICKET DE CAISSE
  const [saleReceiptToView, setSaleReceiptToView] = useState<ReceiptModalProps['receipt'] | null>(null);
  const [isSaleReceiptModalOpen, setIsSaleReceiptModalOpen] = useState<boolean>(false);

  // MODALE NOUVEAU SOIN
  const [isNewProductModalOpen, setIsNewProductModalOpen] = useState<boolean>(false);
  const [newProdName, setNewProdName] = useState<string>('');
  const [newProdSku, setNewProdSku] = useState<string>('');
  const [selectedGammeType, setSelectedGammeType] = useState<string>('Gamme Bleaching');
  const [customGammeName, setCustomGammeName] = useState<string>('');
  const [newProdPrice, setNewProdPrice] = useState<string>('');
  const [newProdCost, setNewProdCost] = useState<string>('');
  const [newProdStockDkr, setNewProdStockDkr] = useState<string>('0');
  const [newProdStockAbj, setNewProdStockAbj] = useState<string>('0');
  const [isAddingProduct, setIsAddingProduct] = useState<boolean>(false);

  // EXPÉDITION MULTI-PRODUITS
  const [shipmentCart, setShipmentCart] = useState<ShipmentCartItem[]>([]);
  const [selectedProdForShipment, setSelectedProdForShipment] = useState<string>('');
  const [selectedGammeForShipment, setSelectedGammeForShipment] = useState<string | null>(null);
  const [selectedQtyForShipment, setSelectedQtyForShipment] = useState<string>('');
  const [shippingCostXof, setShippingCostXof] = useState<string>('');
  const [shipmentTrackingRef, setShipmentTrackingRef] = useState<string>('');
  const [isSubmittingShipment, setIsSubmittingShipment] = useState<boolean>(false);
  const [, setSelectedTransferForSlip] = useState<Record<string, unknown> | null>(null);

  // ---------------------------------------------------------------------------
  // SYNCHRONISATION SUPABASE & LOCALSTORAGE
  // ---------------------------------------------------------------------------
  const fetchAdminData = useCallback(async () => {
    try {
      // 1. Produits
      const { data: pData } = await supabase.from('lmb_products').select('*');
      const combinedProducts: Product[] = pData ? (pData as Product[]) : [];
      const localAdded = localStorage.getItem('lmb_local_custom_products');
      if (localAdded) {
        const parsed: Product[] = JSON.parse(localAdded);
        parsed.forEach((lp) => {
          if (!combinedProducts.some((p) => p.id === lp.id || p.sku === lp.sku)) {
            combinedProducts.push(lp);
          }
        });
      }
      combinedProducts.sort((a, b) => {
        const numA = parseInt(a.sku.replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(b.sku.replace(/\D/g, ''), 10) || 0;
        return numA - numB;
      });
      setProducts(combinedProducts);
      if (combinedProducts.length > 0 && !selectedProdForShipment) {
        setSelectedProdForShipment(combinedProducts[0].id);
      }

      // 2. Ventes & Dépenses
      const { data: sData } = await supabase.from('lmb_sales').select('*').order('created_at', { ascending: false });
      if (sData) setSales(sData as SaleReceipt[]);

      const { data: customerOrdersData } = await supabase
        .from('lmb_customer_orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (customerOrdersData) {
        const customerIds = [...new Set(customerOrdersData.filter((order) => order.customer_id).map((order) => order.customer_id))];
        if (customerIds.length > 0) {
          const { data: customersData } = await supabase
            .from('lmb_customers')
            .select('*')
            .in('id', customerIds);

          const customerMap = new Map((customersData ?? []).map((customer) => [customer.id, customer]));
          setSales(() => {
            const enriched = [...(sData ?? [])];
            enriched.forEach((sale) => {
              const matchingOrder = customerOrdersData.find((order) => order.sale_id === sale.id);
              const customer = matchingOrder?.customer_id ? customerMap.get(matchingOrder.customer_id) : null;
              if (customer && !sale.customer_name) {
                sale.customer_name = customer.full_name ?? 'Client';
                sale.customer_phone = customer.phone ?? '';
                sale.customer_vip = customer.vip_status ?? 'STANDARD';
              }
            });
            return enriched;
          });
        }
      }

      const { data: eData } = await supabase.from('lmb_expenses').select('*').order('created_at', { ascending: false });
      const combinedExpenses: Record<string, unknown>[] = eData || [];
      const localExp = localStorage.getItem('lmb_local_expenses');
      if (localExp) {
        const parsedExp = JSON.parse(localExp);
        parsedExp.forEach((le: Record<string, unknown>) => {
          if (!combinedExpenses.some((e) => e.id === le.id)) {
            combinedExpenses.push(le);
          }
        });
      }
      setExpenses(combinedExpenses);

      // 3. Transferts Colis
      const { data: tData } = await supabase.from('lmb_transfers').select('*').order('created_at', { ascending: false });
      if (tData && tData.length > 0) {
        setTransfers(tData);
      } else {
        const localTrf = localStorage.getItem('lmb_local_transfers');
        if (localTrf) setTransfers(JSON.parse(localTrf));
      }

      // 4. Rapports d'Inventaires Physiques
      const { data: invData } = await supabase.from('inventory_reports').select('*').order('created_at', { ascending: false });
      const combinedReports: InventoryReportItem[] = invData ? (invData as InventoryReportItem[]) : [];
      const localInv = localStorage.getItem('lmb_inventory_reports');
      if (localInv) {
        const parsedInv = JSON.parse(localInv);
        parsedInv.forEach((li: InventoryReportItem) => {
          if (!combinedReports.some((r) => r.id === li.id)) {
            combinedReports.push(li);
          }
        });
      }
      setInventoryReports(combinedReports);

      // 5. Pointage RH
      const { data: attData } = await supabase.from('lmb_attendance').select('*').order('timestamp', { ascending: false }).limit(30);
      if (attData) setAttendanceRecords(attData);

    } catch (e) {
      console.error('Erreur chargement Supabase:', e);
    }
  }, [selectedProdForShipment]);

  useEffect(() => {
    fetchAdminData();
  }, [fetchAdminData]);

  // Rôle du compte connecté, pour n'afficher dans les onglets que les sections
  // pertinentes pour ce rôle (les pages elles-mêmes restent protégées par
  // AuthGuard/isPathForbiddenForRole indépendamment de cet affichage).
  useEffect(() => {
    let cancelled = false;
    getCurrentStaff()
      .then((current) => {
        if (!cancelled) setStaffRole(current?.staff.role ?? null);
      })
      .catch((err) => console.warn('getCurrentStaff failed', err));
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------------------------------------------------------------------------
  // NOUVEAU SOIN
  // ---------------------------------------------------------------------------
  const handleOpenNewProductModal = () => {
    let maxNum = 0;
    products.forEach((p) => {
      const match = p.sku.match(/LMB(\d+)/i);
      if (match) {
        const n = parseInt(match[1], 10);
        if (n > maxNum) maxNum = n;
      }
    });
    setNewProdSku(`LMB${maxNum + 1}`);
    setNewProdName('');
    setNewProdPrice('');
    setNewProdCost('');
    setNewProdStockDkr('0');
    setNewProdStockAbj('0');
    setSelectedGammeType('Gamme Bleaching');
    setCustomGammeName('');
    setIsNewProductModalOpen(true);
  };

  const handleAddNewProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProdName.trim() || !newProdSku.trim() || !newProdPrice) return;
    setIsAddingProduct(true);

    const priceNum = parseFloat(newProdPrice.replace(/\D/g, '')) || 0;
    const costNum = parseFloat(newProdCost.replace(/\D/g, '')) || 0;
    const stockDkrNum = parseInt(newProdStockDkr.replace(/\D/g, ''), 10) || 0;
    const stockAbjNum = parseInt(newProdStockAbj.replace(/\D/g, ''), 10) || 0;
    const finalCat = selectedGammeType === 'CUSTOM' ? (customGammeName.trim() || 'Gamme Personnalisée') : selectedGammeType;

    // id temporaire local (repli hors-ligne). NE PAS l'envoyer à Postgres :
    // lmb_products.id est de type uuid avec défaut -> un id texte type
    // `prod_<timestamp>` déclenche "invalid input syntax for type uuid".
    const tempLocalId = `local_prod_${Date.now()}`;
    const newProductFields = {
      sku: newProdSku.trim().toUpperCase(),
      name: newProdName.trim(),
      category_name: finalCat,
      standard_retail_price_xof: priceNum,
      floor_price_xof: Math.round(priceNum * 0.85),
      cost_price_xof: costNum,
      stock_dakar: stockDkrNum,
      stock_abidjan: stockAbjNum,
    };
    let newP: Product = { id: tempLocalId, ...newProductFields };

    try {
      // Insert SANS id -> Postgres génère l'uuid et nous le renvoie.
      const { data: inserted, error: insErr } = await supabase
        .from('lmb_products')
        .insert([newProductFields])
        .select()
        .single();
      if (insErr) throw insErr;
      if (inserted) newP = inserted as Product; // on adopte l'uuid réel

      await supabase.from('lmb_audit_logs').insert([
        {
          event_type: 'CREATION_PRODUIT_CATALOGUE',
          details: `Création soin ${newP.name} (${newP.sku}) - Prix: ${priceNum} FCFA, Stock DKR: ${stockDkrNum}, Stock ABJ: ${stockAbjNum}`,
          performed_by: 'Direction Générale',
        },
      ]);
    } catch (err) {
      console.error('Création produit : persistance base échouée, repli local', err);
    }

    setProducts((prev) => [...prev, newP]);

    const localAdded = localStorage.getItem('lmb_local_custom_products');
    const parsed = localAdded ? JSON.parse(localAdded) : [];
    parsed.push(newP);
    localStorage.setItem('lmb_local_custom_products', JSON.stringify(parsed));

    setIsNewProductModalOpen(false);
    setIsAddingProduct(false);
    alert(`✅ Nouveau soin "${newP.name}" (${newP.sku}) enregistré !`);
    fetchAdminData();
  };

  // ---------------------------------------------------------------------------
  // SAISIE DES STOCKS & PALMARÈS
  // ---------------------------------------------------------------------------
  const handleDirectStockChange = async (productId: string, city: 'DAKAR' | 'ABIDJAN', valueStr: string) => {
    const cleanDigits = valueStr.replace(/\D/g, '').replace(/^0+/, '');
    const numVal = cleanDigits === '' ? 0 : parseInt(cleanDigits, 10);
    const field = city === 'DAKAR' ? 'stock_dakar' : 'stock_abidjan';

    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, [field]: numVal } : p))
    );

    try {
      await supabase.from('lmb_products').update({ [field]: numVal }).eq('id', productId);
    } catch {
      // silencieux : mise à jour optimiste déjà appliquée côté UI
    }
  };

  /**
   * Édition inline du coût d'achat réel (cost_price_xof). Renseigner ce champ
   * fait passer la marge du produit d'« estimée » (65 %) à exacte dans
   * /admin/finance. 0 = non renseigné -> repli estimation.
   */
  const handleDirectCostChange = async (productId: string, valueStr: string) => {
    const cleanDigits = valueStr.replace(/\D/g, '').replace(/^0+/, '');
    const numVal = cleanDigits === '' ? 0 : parseInt(cleanDigits, 10);

    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, cost_price_xof: numVal } : p))
    );

    try {
      await updateProductPrice(productId, 'cost_price_xof', numVal);
    } catch (err) {
      console.error('handleDirectCostChange', err);
      alert(err instanceof Error ? err.message : 'Sauvegarde du coût impossible.');
    }
  };

  // Confirmation intégrée (remplace window.confirm) : un premier clic sur la
  // corbeille affiche "Confirmer / Annuler" à la place de l'icône, pour cette
  // seule ligne ; le second clic déclenche réellement la suppression.
  const [deleteConfirmProductId, setDeleteConfirmProductId] = useState<string | null>(null);

  const handleDeleteProduct = async (prodId: string, prodName: string) => {
    setDeleteConfirmProductId(null);
    setProducts((prev) => prev.filter((p) => p.id !== prodId));

    try {
      await supabase.from('lmb_products').delete().eq('id', prodId);
      await supabase.from('lmb_audit_logs').insert([
        {
          event_type: 'SUPPRESSION_PRODUIT_CATALOGUE',
          details: `Suppression du soin "${prodName}" (ID: ${prodId}).`,
          performed_by: 'Direction Générale',
        },
      ]);
    } catch {
      // silencieux : ajout optimiste déjà appliqué côté UI
    }
  };

  const productsWithSalesStats = useMemo<ProductSalesStat[]>(() => {
    const salesMap: Record<string, { qtySold: number; revenueXof: number }> = {};
    sales.forEach((s) => {
      if (s.items_json && Array.isArray(s.items_json)) {
        s.items_json.forEach((item: LegacySaleItem) => {
          const pId = item.product?.id;
          const qty = item.quantity || 1;
          const price = item.appliedUnitPriceXof || item.product?.standard_retail_price_xof || 0;
          if (pId) {
            if (!salesMap[pId]) salesMap[pId] = { qtySold: 0, revenueXof: 0 };
            salesMap[pId].qtySold += qty;
            salesMap[pId].revenueXof += price * qty;
          }
        });
      }
    });

    return products.map((p) => {
      const salesStat = salesMap[p.id] || { qtySold: 0, revenueXof: 0 };
      return {
        ...p,
        qtySold: salesStat.qtySold,
        revenueXof: salesStat.revenueXof,
        totalStock: (p.stock_dakar || 0) + (p.stock_abidjan || 0),
      };
    });
  }, [products, sales]);

  const sortedProducts = useMemo(() => {
    let list = [...productsWithSalesStats];
    if (searchStock.trim()) {
      list = list.filter((p) =>
        p.name.toLowerCase().includes(searchStock.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchStock.toLowerCase()) ||
        (p.category_name ?? '').toLowerCase().includes(searchStock.toLowerCase())
      );
    }
    if (stockSortMode === 'SALES_DESC') {
      return list.sort((a, b) => b.qtySold - a.qtySold || b.revenueXof - a.revenueXof);
    } else if (stockSortMode === 'SALES_ASC') {
      return list.sort((a, b) => a.qtySold - b.qtySold || a.revenueXof - b.revenueXof);
    } else if (stockSortMode === 'LOW_STOCK') {
      return list.sort((a, b) => a.totalStock - b.totalStock);
    } else {
      return list.sort((a, b) => {
        const numA = parseInt(a.sku.replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(b.sku.replace(/\D/g, ''), 10) || 0;
        return numA - numB;
      });
    }
  }, [productsWithSalesStats, stockSortMode, searchStock]);

  // ---------------------------------------------------------------------------
  // EXPÉDITION MULTI-PRODUITS
  // ---------------------------------------------------------------------------
  const shipmentGammes = useMemo(() => {
    const set = new Set<string>();
    let hasSansGamme = false;
    for (const p of products) {
      if (p.category_name) set.add(p.category_name);
      else hasSansGamme = true;
    }
    const sorted = Array.from(set).sort((a, b) => a.localeCompare(b));
    return hasSansGamme ? [...sorted, 'Sans gamme'] : sorted;
  }, [products]);

  const shipmentGridProducts = useMemo(() => {
    if (!selectedGammeForShipment) return products;
    if (selectedGammeForShipment === 'Sans gamme') return products.filter((p) => !p.category_name);
    return products.filter((p) => p.category_name === selectedGammeForShipment);
  }, [products, selectedGammeForShipment]);

  const SHIPMENT_TILE_COLORS = [
    'from-cyan-500/20 to-cyan-500/5 border-cyan-500/40',
    'from-fuchsia-500/20 to-fuchsia-500/5 border-fuchsia-500/40',
    'from-amber-500/20 to-amber-500/5 border-amber-500/40',
    'from-emerald-500/20 to-emerald-500/5 border-emerald-500/40',
    'from-violet-500/20 to-violet-500/5 border-violet-500/40',
    'from-rose-500/20 to-rose-500/5 border-rose-500/40',
  ];

  const shipmentTileColor = (gamme: string | null | undefined) => {
    const key = gamme ?? 'Sans gamme';
    let hash = 0;
    for (let i = 0; i < key.length; i += 1) hash = (hash + key.charCodeAt(i)) % SHIPMENT_TILE_COLORS.length;
    return SHIPMENT_TILE_COLORS[hash];
  };

  const handleAddProductToShipmentCart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProdForShipment || !selectedQtyForShipment) return;

    const cleanQty = selectedQtyForShipment.replace(/\D/g, '').replace(/^0+/, '');
    const qty = cleanQty === '' ? 0 : parseInt(cleanQty, 10);
    if (qty <= 0) return;

    const prod = products.find((p) => p.id === selectedProdForShipment);
    if (!prod) return;

    const availableAbj = prod.stock_abidjan || 0;
    const existingInCart = shipmentCart.find((item) => item.productId === prod.id)?.qty || 0;

    if (existingInCart + qty > availableAbj) {
      alert(`Stock insuffisant à Abidjan pour ${prod.name} (Disponible : ${availableAbj} flacons).`);
      return;
    }

    setShipmentCart((prev) => {
      const exists = prev.find((item) => item.productId === prod.id);
      if (exists) {
        return prev.map((item) =>
          item.productId === prod.id ? { ...item, qty: item.qty + qty } : item
        );
      }
      return [...prev, { productId: prod.id, name: prod.name, sku: prod.sku, qty }];
    });

    setSelectedQtyForShipment('');
  };

  const handleValidateAndSendShipment = async () => {
    if (shipmentCart.length === 0) return;
    setIsSubmittingShipment(true);

    try {
      const now = new Date();
      const cleanCost = shippingCostXof.replace(/\D/g, '').replace(/^0+/, '');
      const cost = cleanCost === '' ? 0 : parseFloat(cleanCost);
      const totalItems = shipmentCart.reduce((sum, item) => sum + item.qty, 0);
      const carrier = shipmentTrackingRef.trim() || 'Fret Cargo Standard Abidjan-Dakar';

      // UN SEUL point d'écriture dans lmb_transfers : le service inventory, au
      // format canonique. Le stock d'Abidjan/Dakar ne bouge PAS ici : il sera
      // déplacé à la confirmation de réception (/admin/transfers -> confirmTransfer),
      // pour éviter tout double décrément.
      const transfer = await createTransfer(
        'ABIDJAN',
        'DAKAR',
        shipmentCart.map((i) => ({ productId: i.productId, qty: i.qty })),
        {
          createdBy: 'Direction Générale (Abidjan)',
          carrier,
          shipping_fee_xof: cost,
          total_items: totalItems,
          lines: shipmentCart.map((i) => ({ productId: i.productId, name: i.name, sku: i.sku, qty: i.qty })),
        },
      );

      // Frais cargo : dépense réelle imputée sur Dakar. Erreur signalée, pas avalée.
      if (cost > 0) {
        const { error: expError } = await supabase.from('lmb_expenses').insert([
          {
            // Pas d'`id` fourni : la colonne est de type uuid avec un défaut
            // (gen_random_uuid()). Un id texte type `exp_trf_<timestamp>` viole
            // "invalid input syntax for type uuid". On laisse Postgres le générer.
            created_at: now.toISOString(),
            store_city: 'DAKAR',
            category: 'FRET_CARGO_DOUANE',
            reason: `Frais Cargo Colis ${transfer.transfer_number ?? ''} (${totalItems} flacons)`,
            amount_xof: cost,
            recorded_by: 'Direction Générale',
          },
        ]);
        if (expError) {
          alert(
            `Transfert ${transfer.transfer_number} créé, MAIS les frais cargo n'ont pas pu être enregistrés : ${expError.message}. Saisissez-les manuellement dans les charges.`,
          );
        }
      }

      setSelectedTransferForSlip({
        ...transfer,
        origin_store: 'ABIDJAN',
        destination_store: 'DAKAR',
        quantity_sent: totalItems,
        shipping_fee_xof: cost,
        tracking_reference: carrier,
        items_json: shipmentCart.map((i) => ({
          productId: i.productId,
          name: i.name,
          sku: i.sku,
          quantity_sent: i.qty,
          quantity_received: 0,
        })),
      });
      setShipmentCart([]);
      setShippingCostXof('');
      setShipmentTrackingRef('');
      alert(
        `Transfert ${transfer.transfer_number} créé (statut EN ATTENTE). Le stock sera déplacé à la confirmation de réception à Dakar.`,
      );
      await fetchAdminData();
    } catch (err) {
      alert(`Expédition NON enregistrée : ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSubmittingShipment(false);
    }
  };

  // STATS FINANCIÈRES
  const stats = useMemo(() => {
    const validSales = sales.filter((s) => !s.payment_method?.includes('ANNULÉ'));
    const totalRevenue = validSales.reduce((acc, s) => {
      const raw = s.total_amount_xof ?? s.totalAmountXof ?? 0;
      return acc + (Number(raw) || 0);
    }, 0);
    const totalExpenses = expenses.reduce((acc, e) => acc + (Number(e.amount_xof) || 0), 0);
    const realNetProfit = totalRevenue - totalExpenses;

    const totalStockDkr = products.reduce((acc, p) => acc + (p.stock_dakar || 0), 0);
    const totalStockAbj = products.reduce((acc, p) => acc + (p.stock_abidjan || 0), 0);
    const totalInventoryValue = products.reduce(
      (acc, p) => acc + ((p.stock_dakar || 0) + (p.stock_abidjan || 0)) * p.standard_retail_price_xof,
      0
    );

    return {
      totalRevenue,
      totalExpenses,
      realNetProfit,
      totalStockDkr,
      totalStockAbj,
      totalInventoryValue,
      inventoryReportsCount: inventoryReports.length,
      anomaliesCount: inventoryReports.filter((r) => r.status === 'ANOMALIE_CONSTATÉE' || r.net_variance !== 0).length,
    };
  }, [sales, expenses, products, inventoryReports]);

  return (
    <div className="min-h-screen bg-[#F9F9FB] text-[#111111] font-sans pb-12 selection:bg-[#D4AF37]/30 selection:text-[#111111]">
      {/* HEADER DIRECTION */}
      <header className="sticky top-0 z-30 border-b border-[#D4AF37]/30 bg-[#111111]/95 px-6 py-4 shadow-luxury backdrop-blur-xl">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-[#D4AF37] via-[#C5A059] to-[#F5E3B3] shadow-md shadow-[#D4AF37]/25">
              <ShieldCheck className="h-6 w-6 text-[#111111]" />
            </div>
            <div>
                <h1 className="text-base font-bold tracking-[0.14em] text-transparent bg-clip-text bg-gradient-to-r from-[#F5E3B3] via-[#D4AF37] to-[#C5A059] font-serif">
                LMBS • DIRECTION GÉNÉRALE
              </h1>
              <p className="text-xs font-medium text-[#D4AF37]">
                Supervision Consolidée Dakar 🇸🇳 & Abidjan 🇨🇮 • Administration, Finances & Vidéosurveillance
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#C5A059] px-3.5 py-2 text-xs font-bold text-[#111111] shadow-md shadow-[#D4AF37]/20 transition hover:brightness-105"
            >
              <Building2 className="h-3.5 w-3.5" />
              <span>🛒 Accéder à la Caisse</span>
            </Link>
          </div>
        </div>
      </header>

      {/* ONGLETS */}
      <div className="max-w-[1600px] mx-auto px-6 pt-6">
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none border-b border-[#D4AF37]/20 text-xs font-semibold">
          {[
            { id: 'STOCK', label: '📦 Stocks, Transferts & Palmarès', icon: Package },
            { id: 'INVENTORY_REPORTS', label: '📋 Rapports d\'Inventaires Physiques', icon: Boxes },
            { id: 'ADMIN_FINANCES', label: '🏛️ Charges & Bilan Financier', icon: Building2 },
            { id: 'COMPARATIVE', label: '⚖️ Comparatif Dakar vs Abidjan', icon: Scale },
            { id: 'LIVE_CAMERAS', label: '📹 Vidéosurveillance & Pointage', icon: Radio, directionOnly: true },
            { id: 'WAVE_OM_GATEWAY', label: '📱 Comptes Marchands', icon: QrCode, directionOnly: true },
            { id: 'PRICING', label: '🏷️ Grille Tarifaire', icon: Tag },
            { id: 'ATTENDANCE', label: '🕒 Registre RH', icon: Clock, directionOnly: true },
            { id: 'SERVICE_PROVIDERS', label: '🤝 Prestataires', icon: Handshake, directionOnly: true },
            { id: 'SALES_AUDIT', label: '🧾 Grand Livre des Ventes', icon: DollarSign },
          ]
            // Onglets menant à des pages réservées à la DIRECTION
            // (/admin/hr, /admin/merchant-accounts, /admin/surveillance) : pour
            // éviter d'afficher un bouton qui redirigerait quand même
            // l'utilisateur, on ne les montre pas à un GERANT. Les pages
            // restent protégées indépendamment de cet affichage (voir
            // isPathForbiddenForRole dans lib/services/auth.ts).
            .filter((tab) => !tab.directionOnly || staffRole === 'DIRECTION')
            .map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  // Le comparatif est une page dédiée (comme /admin/finance),
                  // pas un rendu inline dans ce fichier.
                  if (tab.id === 'COMPARATIVE') {
                    router.push('/admin/comparative');
                    return;
                  }
                  // La Grille Tarifaire est une page dédiée (/admin/pricing),
                  // pas un rendu inline dans ce fichier.
                  if (tab.id === 'PRICING') {
                    router.push('/admin/pricing');
                    return;
                  }
                  // Le Registre RH est une page dédiée (/admin/hr), réservée
                  // à la DIRECTION, pas un rendu inline dans ce fichier.
                  if (tab.id === 'ATTENDANCE') {
                    router.push('/admin/hr');
                    return;
                  }
                  // Les Comptes Marchands sont une page dédiée
                  // (/admin/merchant-accounts), réservée à la DIRECTION.
                  if (tab.id === 'WAVE_OM_GATEWAY') {
                    router.push('/admin/merchant-accounts');
                    return;
                  }
                  // La Vidéosurveillance est une page dédiée (/admin/surveillance),
                  // réservée à la DIRECTION : suivi honnête des 2 points bloquants
                  // (internet Dakar, capacité API caméra), pas un flux vidéo.
                  if (tab.id === 'LIVE_CAMERAS') {
                    router.push('/admin/surveillance');
                    return;
                  }
                  // Le Registre des Prestataires est une page dédiée
                  // (/admin/service-providers), réservée à la DIRECTION.
                  if (tab.id === 'SERVICE_PROVIDERS') {
                    router.push('/admin/service-providers');
                    return;
                  }
                  const inlineTabIds: InlineTabId[] = ['STOCK', 'INVENTORY_REPORTS', 'ADMIN_FINANCES', 'SALES_AUDIT'];
                  if ((inlineTabIds as string[]).includes(tab.id)) {
                    setActiveTab(tab.id as InlineTabId);
                  }
                }}
                className={`px-4 py-2.5 rounded-2xl font-bold flex items-center gap-2 transition whitespace-nowrap cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-gradient-to-r from-[#D4AF37] to-[#C5A059] text-[#111111] shadow-md shadow-[#D4AF37]/20'
                    : 'border border-[#D4AF37]/20 bg-[#F3F4F6] text-[#111111]/75 hover:text-[#111111]'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <main className="max-w-[1600px] mx-auto px-6 pt-6">
        {/* ========================================================================= */}
        {/* NOUVEL ONGLET : RAPPORTS D'INVENTAIRES PHYSIQUES ENREGISTRÉS */}
        {/* ========================================================================= */}
        {activeTab === 'INVENTORY_REPORTS' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-slate-900/90 border border-cyan-500/30 rounded-3xl p-5 shadow-lg">
                <p className="text-xs text-cyan-300 font-bold uppercase">Total Inventaires Réalisés</p>
                <p className="text-2xl font-bold text-slate-100 font-mono mt-1">{stats.inventoryReportsCount} <span className="text-xs text-slate-400">sessions</span></p>
              </div>

              <div className="bg-slate-900/90 border border-rose-500/30 rounded-3xl p-5 shadow-lg">
                <p className="text-xs text-rose-400 font-bold uppercase">Anomalies & Écarts Constatés</p>
                <p className="text-2xl font-bold text-rose-400 font-mono mt-1">{stats.anomaliesCount} <span className="text-xs text-slate-400">écarts signalés</span></p>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-lg flex justify-between items-center">
                <div>
                  <p className="text-xs text-slate-400 font-bold uppercase">Rapprochement Théorique vs Réel</p>
                  <p className="text-xs text-slate-300 mt-1">Audit automatique lors des clôtures de boutique.</p>
                </div>
                <FileCheck className="w-7 h-7 text-emerald-400" />
              </div>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <div>
                  <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                    <Boxes className="w-4 h-4 text-cyan-400" />
                    Historique des Rapports d&apos;Inventaires Physiques ({inventoryReports.length})
                  </h3>
                  <p className="text-xs text-slate-400">Données enregistrées en temps réel par les caissières à Dakar et Abidjan</p>
                </div>
              </div>

              {inventoryReports.length === 0 ? (
                <div className="text-center py-12 space-y-2">
                  <Boxes className="w-10 h-10 text-slate-600 mx-auto stroke-1" />
                  <p className="text-slate-400 text-xs">Aucun inventaire physique n&apos;a encore été transmis.</p>
                  <p className="text-[11px] text-slate-600">Effectuez un inventaire depuis la caisse POS pour voir apparaître le rapport ici.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                        <th className="py-3 px-3">Date & Heure</th>
                        <th className="py-3 px-3">Boutique / Pays</th>
                        <th className="py-3 px-3">Conseillère en Caisse</th>
                        <th className="py-3 px-3 text-center font-mono">Stock Théorique</th>
                        <th className="py-3 px-3 text-center font-mono">Stock Compté</th>
                        <th className="py-3 px-3 text-center">Écart Net</th>
                        <th className="py-3 px-3 text-center">Statut</th>
                        <th className="py-3 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {inventoryReports.map((report) => (
                        <tr key={report.id} className="hover:bg-slate-800/40 transition">
                          <td className="py-3 px-3 text-slate-300 font-sans">
                            {new Date(report.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}{' '}
                            <span className="text-slate-500 text-[10px]">({new Date(report.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })})</span>
                          </td>
                          <td className="py-3 px-3 font-sans font-bold text-slate-100">{report.location_country}</td>
                          <td className="py-3 px-3 font-sans text-cyan-300 font-semibold">{report.cashier_name}</td>
                          <td className="py-3 px-3 text-center text-slate-300">{report.total_expected} flacons</td>
                          <td className="py-3 px-3 text-center font-bold text-slate-100">{report.total_counted} flacons</td>
                          <td className="py-3 px-3 text-center">
                            {report.net_variance === 0 ? (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[10px] border border-emerald-500/30">
                                ✅ 0 (Conforme)
                              </span>
                            ) : report.net_variance > 0 ? (
                              <span className="px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 font-bold text-[10px] border border-teal-500/30">
                                +{report.net_variance} Surplus
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-bold text-[10px] border border-rose-500/30">
                                {report.net_variance} Manquants
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center font-sans text-[11px]">
                            {report.status === 'CONFORME' ? (
                              <span className="text-emerald-400 font-semibold">Validé</span>
                            ) : (
                              <span className="text-rose-400 font-bold">Anomalie</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right font-sans">
                            <button
                              type="button"
                              onClick={() => setSelectedReportDetail(report)}
                              className="px-3 py-1 bg-slate-800 hover:bg-cyan-500 hover:text-slate-950 text-slate-200 rounded-xl text-xs font-bold transition cursor-pointer"
                            >
                              📄 Voir Détail
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ONGLET 1 : STOCKS & CATALOGUE */}
        {activeTab === 'STOCK' && (
          <div className="space-y-6">
            {/* KPIS STOCKS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-900/90 border border-cyan-500/30 rounded-3xl p-5 shadow-lg">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs text-cyan-300 font-bold uppercase">Stock Dakar (Almadies)</p>
                    <p className="text-2xl font-bold text-slate-100 font-mono mt-1">{stats.totalStockDkr} <span className="text-xs text-slate-400">flacons</span></p>
                  </div>
                  <span className="text-2xl">🇸🇳</span>
                </div>
              </div>

              <div className="bg-slate-900/90 border border-teal-500/30 rounded-3xl p-5 shadow-lg">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs text-teal-300 font-bold uppercase">Stock Abidjan (Cocody)</p>
                    <p className="text-2xl font-bold text-slate-100 font-mono mt-1">{stats.totalStockAbj} <span className="text-xs text-slate-400">flacons</span></p>
                  </div>
                  <span className="text-2xl">🇨🇮</span>
                </div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-lg">
                <p className="text-xs text-slate-400 font-bold uppercase">Valeur Marchande Réseau</p>
                <p className="text-xl font-bold text-cyan-300 font-mono mt-1">{stats.totalInventoryValue.toLocaleString('fr-FR')} FCFA</p>
              </div>

              <div className="bg-slate-900/90 border border-rose-500/30 rounded-3xl p-5 shadow-lg">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs text-rose-400 font-bold uppercase">Alertes Écarts / Inventaires</p>
                    <p className="text-2xl font-bold text-rose-400 font-mono mt-1">{stats.anomaliesCount} <span className="text-xs text-slate-400">signalements</span></p>
                  </div>
                  <AlertTriangle className="w-6 h-6 text-rose-400" />
                </div>
              </div>
            </div>

            {/* EXPÉDITION MULTI-PRODUITS */}
            <div className="bg-slate-900/90 border border-amber-500/30 rounded-3xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Truck className="w-5 h-5 text-amber-400" />
                  <div>
                    <h3 className="font-bold text-sm text-slate-100">Expédier un Colis Multi-Produits (Abidjan 🇨🇮 ➔ Dakar 🇸🇳)</h3>
                    <p className="text-xs text-slate-400">Déduction automatique du stock d&apos;Abidjan et imputation des frais cargo sur Dakar.</p>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold text-amber-300 bg-amber-500/10 px-3 py-1 rounded-xl border border-amber-500/20">
                  {shipmentCart.length} soins ajoutés
                </span>
              </div>

              <form onSubmit={handleAddProductToShipmentCart} className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs">
                <div className="sm:col-span-12">
                  <label className="text-slate-400 block mb-1 font-semibold">Choisir un soin (stock Abidjan) :</label>
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedGammeForShipment(null)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                        selectedGammeForShipment === null
                          ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                          : 'border-slate-700 bg-slate-950 text-slate-400 hover:border-slate-500'
                      }`}
                    >
                      Toutes ({products.length})
                    </button>
                    {shipmentGammes.map((gamme) => {
                      const count = gamme === 'Sans gamme'
                        ? products.filter((p) => !p.category_name).length
                        : products.filter((p) => p.category_name === gamme).length;
                      return (
                        <button
                          key={gamme}
                          type="button"
                          onClick={() => setSelectedGammeForShipment(gamme)}
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                            selectedGammeForShipment === gamme
                              ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                              : 'border-slate-700 bg-slate-950 text-slate-400 hover:border-slate-500'
                          }`}
                        >
                          {gamme} ({count})
                        </button>
                      );
                    })}
                  </div>
                  <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 p-2">
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4">
                      {shipmentGridProducts.map((p) => {
                        const outOfStock = (p.stock_abidjan || 0) <= 0;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            disabled={outOfStock}
                            onClick={() => setSelectedProdForShipment(p.id)}
                            className={`flex flex-col items-center gap-0.5 rounded-lg border p-1.5 text-center transition ${
                              outOfStock
                                ? 'cursor-not-allowed border-slate-800 bg-slate-900 opacity-40'
                                : `bg-gradient-to-br ${shipmentTileColor(p.category_name)} hover:brightness-110`
                            } ${selectedProdForShipment === p.id ? 'ring-2 ring-amber-400' : ''}`}
                          >
                            <span className="line-clamp-2 text-[10px] font-medium leading-tight text-slate-100">{p.name}</span>
                            <span className="text-[9px] text-slate-400">{p.sku}</span>
                            <span className={`text-[9px] font-bold ${outOfStock ? 'text-rose-400' : 'text-emerald-300'}`}>
                              {outOfStock ? 'Rupture Abj' : `${p.stock_abidjan || 0} dispo`}
                            </span>
                          </button>
                        );
                      })}
                      {shipmentGridProducts.length === 0 && (
                        <div className="col-span-full py-3 text-center text-[11px] text-slate-500">Aucun produit dans cette gamme.</div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="sm:col-span-6">
                  <label className="text-slate-400 block mb-1 font-semibold">Quantité :</label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="ex: 15"
                    value={selectedQtyForShipment}
                    onFocus={(e) => (e.target as HTMLInputElement).select()}
                    onChange={(e) => setSelectedQtyForShipment(e.target.value.replace(/\D/g, '').replace(/^0+/, ''))}
                    className="text-center"
                  />
                </div>

                <div className="sm:col-span-6 flex items-end">
                  <PrimaryButton type="submit" className="w-full flex items-center justify-center gap-1.5 text-xs">
                    <Plus className="w-4 h-4" />
                    <span>Ajouter au Colis</span>
                  </PrimaryButton>
                </div>
              </form>

              {shipmentCart.length > 0 && (
                <div className="p-4 bg-slate-950 border border-amber-500/20 rounded-2xl space-y-3">
                  <p className="text-xs font-bold text-slate-300 uppercase">Contenu du Colis :</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                    {shipmentCart.map((item) => (
                      <div key={item.productId} className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl flex justify-between items-center">
                        <div>
                          <span className="font-mono font-bold text-amber-400 mr-1.5">{item.sku}</span>
                          <strong className="text-slate-200">{item.name}</strong>
                          <p className="text-[11px] text-slate-400">Qté : <strong className="text-slate-100 font-mono">{item.qty} flacons</strong></p>
                        </div>
                        <button onClick={() => setShipmentCart((prev) => prev.filter((i) => i.productId !== item.productId))} className="text-slate-500 hover:text-rose-400 p-1">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="pt-3 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs items-end">
                    <div>
                      <label className="text-slate-400 block mb-1 font-semibold">Frais Cargo (FCFA) :</label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder="ex: 120000"
                        value={shippingCostXof}
                        onFocus={(e) => (e.target as HTMLInputElement).select()}
                        onChange={(e) => setShippingCostXof(e.target.value.replace(/\D/g, '').replace(/^0+/, ''))}
                      />
                    </div>

                    <div>
                      <label className="text-slate-400 block mb-1 font-semibold">Transporteur :</label>
                      <Input
                        type="text"
                        placeholder="ex: GP Express / Fret Aérien"
                        value={shipmentTrackingRef}
                        onChange={(e) => setShipmentTrackingRef(e.target.value)}
                      />
                    </div>

                    <PrimaryButton onClick={handleValidateAndSendShipment} disabled={isSubmittingShipment} className="w-full flex items-center justify-center gap-2">
                      <Send className="w-4 h-4" />
                      <span>{isSubmittingShipment ? 'Expédition...' : '🚀 Valider & Expédier vers Dakar'}</span>
                    </PrimaryButton>
                  </div>
                </div>
              )}
            </div>

            {/* TABLEAU CATALOGUE */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-4">
                <div>
                  <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                    <Package className="w-4 h-4 text-cyan-400" />
                    Catalogue des Soins LMB ({sortedProducts.length} références)
                  </h3>
                  <p className="text-xs text-slate-400">Ajustez directement les stocks dans les cases numériques.</p>
                </div>

                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="Filtrer soin ou SKU..."
                    value={searchStock}
                    onChange={(e) => setSearchStock(e.target.value)}
                    className="w-48 text-xs"
                  />
                  <PrimaryButton onClick={handleOpenNewProductModal} className="px-3.5 py-1.5 text-xs inline-flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Nouveau Soin</span>
                  </PrimaryButton>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                      <th className="py-2.5 px-3 font-sans">Rang</th>
                      <th className="py-2.5 px-3">SKU</th>
                      <th className="py-2.5 px-3 font-sans">Nom du Soin</th>
                      <th className="py-2.5 px-3 font-sans">Gamme</th>
                      <th className="py-2.5 px-3 text-center">Vendus</th>
                      <th className="py-2.5 px-3 text-right">Prix (FCFA)</th>
                      <th className="py-2.5 px-3 text-center font-sans" title="Coût d'achat réel unitaire. Vide/0 = marge estimée à 65 % en finance.">Coût d’achat</th>
                      <th className="py-2.5 px-3 text-center">🇸🇳 Dakar</th>
                      <th className="py-2.5 px-3 text-center">🇨🇮 Abidjan</th>
                      <th className="py-2.5 px-3 text-center">Total</th>
                      <th className="py-2.5 px-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {sortedProducts.map((prod, index) => (
                      <tr key={prod.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-2.5 px-3 font-sans text-slate-400">#{index + 1}</td>
                        <td className="py-2.5 px-3 font-bold text-cyan-400">{prod.sku}</td>
                        <td className="py-2.5 px-3 font-sans font-semibold text-slate-100">{prod.name}</td>
                        <td className="py-2.5 px-3 font-sans text-slate-400 text-[11px]">{prod.category_name}</td>
                        <td className="py-2.5 px-3 text-center text-amber-300 font-bold">{prod.qtySold}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-cyan-300">{prod.standard_retail_price_xof.toLocaleString('fr-FR')} F</td>
                        <td className="py-2.5 px-3 text-center">
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="—"
                            value={prod.cost_price_xof ? prod.cost_price_xof.toString() : ''}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => handleDirectCostChange(prod.id, e.target.value)}
                            title={prod.cost_price_xof ? 'Coût réel — marge exacte en finance' : 'Non renseigné — marge estimée à 65 % en finance'}
                            className={`w-20 rounded-lg bg-[#111111] border p-1 text-center font-bold focus:outline-none focus:border-[#D4AF37] ${prod.cost_price_xof ? 'border-gray-700 text-white' : 'border-amber-600/60 text-amber-300 placeholder-amber-500/50'}`}
                          />
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={prod.stock_dakar === 0 ? '0' : (prod.stock_dakar || 0).toString()}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => handleDirectStockChange(prod.id, 'DAKAR', e.target.value)}
                            className="w-14 rounded-lg p-1 text-center font-bold"
                          />
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={prod.stock_abidjan === 0 ? '0' : (prod.stock_abidjan || 0).toString()}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => handleDirectStockChange(prod.id, 'ABIDJAN', e.target.value)}
                            className="w-14 rounded-lg p-1 text-center font-bold"
                          />
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-slate-100">{prod.totalStock}</td>
                        <td className="py-2.5 px-3 text-center">
                          {deleteConfirmProductId === prod.id ? (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleDeleteProduct(prod.id, prod.name)}
                                className="rounded-lg bg-rose-500 px-2 py-1 text-[10px] font-bold text-white"
                              >
                                Confirmer
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteConfirmProductId(null)}
                                className="rounded-lg border border-slate-600 px-2 py-1 text-[10px] font-bold text-slate-300"
                              >
                                Annuler
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmProductId(prod.id)}
                              className="p-1 text-slate-600 hover:text-rose-400 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ONGLET FINANCES */}
        {activeTab === 'ADMIN_FINANCES' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-lg">
                <p className="text-xs text-slate-400 font-bold uppercase">C.A Réseau Consolidé</p>
                <p className="text-2xl font-bold text-slate-100 font-mono mt-2">{stats.totalRevenue.toLocaleString('fr-FR')} FCFA</p>
              </div>
              <div className="bg-slate-900/90 border border-rose-500/30 rounded-3xl p-5 shadow-lg">
                <p className="text-xs text-rose-400 font-bold uppercase">Charges & Fret Réseau</p>
                <p className="text-2xl font-bold text-rose-400 font-mono mt-2">-{stats.totalExpenses.toLocaleString('fr-FR')} FCFA</p>
              </div>
              <div className="bg-emerald-950/60 border border-emerald-500/40 rounded-3xl p-5 shadow-lg">
                <p className="text-xs text-emerald-300 font-bold uppercase">Bénéfice Net Réel LMB</p>
                <p className="text-2xl font-bold text-emerald-400 font-mono mt-2">{stats.realNetProfit.toLocaleString('fr-FR')} FCFA</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'SALES_AUDIT' && (
          <div className="space-y-6">
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <div>
                  <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-cyan-400" />
                    Historique des Ventes & Reçus
                  </h3>
                  <p className="text-xs text-slate-400">Transactions récentes issues de Supabase et de l’audit caisse.</p>
                </div>
              </div>

              {sales.length === 0 ? (
                <div className="text-center py-12 space-y-2">
                  <Receipt className="w-10 h-10 text-slate-600 mx-auto stroke-1" />
                  <p className="text-slate-400 text-xs">Aucune vente n’a encore été enregistrée.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                        <th className="py-3 px-3">N° Vente</th>
                        <th className="py-3 px-3">Date & Heure</th>
                        <th className="py-3 px-3">Client</th>
                        <th className="py-3 px-3 text-right">Montant</th>
                        <th className="py-3 px-3 text-right">Remise</th>
                        <th className="py-3 px-3">Paiement</th>
                        <th className="py-3 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {sales.map((sale, saleIndex) => {
                        const safeTotal = Number(sale.total_amount_xof ?? sale.totalAmountXof ?? 0);
                        const safeDiscount = Number(sale.discount_xof ?? sale.totalDiscountXof ?? 0);
                        const customerName = sale.customer_name ?? sale.customerName ?? 'Client non identifié';
                        const customerPhone = sale.customer_phone ?? sale.customerPhone ?? '—';
                        const rawVipStatus = sale.customer_vip ?? sale.customerVip ?? 'STANDARD';
                        const vipStatus: 'STANDARD' | 'VIP' | 'VIP_PREMIUM' =
                          rawVipStatus === 'VIP' || rawVipStatus === 'VIP_PREMIUM' ? rawVipStatus : 'STANDARD';

                        return (
                          <tr key={sale.id ?? sale.receiptNumber ?? `sale-${saleIndex}`} className="hover:bg-slate-800/40 transition align-top">
                            <td className="py-3 px-3 text-cyan-300 font-bold align-top break-all">{sale.receipt_number ?? sale.receiptNumber ?? sale.id ?? '—'}</td>
                            <td className="py-3 px-3 text-slate-300 font-sans">
                              {new Date(sale.created_at ?? sale.createdAt ?? fallbackNowIso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}{' '}
                              <span className="text-slate-500 text-[10px]">
                                ({new Date(sale.created_at ?? sale.createdAt ?? fallbackNowIso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })})
                              </span>
                            </td>
                            <td className="py-3 px-3 font-sans text-slate-200">
                              <div className="font-semibold text-white">{customerName}</div>
                              <div className="text-[10px] text-slate-400">{customerPhone}</div>
                              <div className="text-[10px] text-cyan-300">{vipStatus}</div>
                            </td>
                            <td className="py-3 px-3 text-right text-slate-100 font-bold">{safeTotal.toLocaleString('fr-FR')} FCFA</td>
                            <td className="py-3 px-3 text-right text-amber-300">-{safeDiscount.toLocaleString('fr-FR')} FCFA</td>
                            <td className="py-3 px-3 font-sans text-slate-200">{sale.payment_method ?? sale.paymentMethod ?? '—'}</td>
                            <td className="py-3 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  const items: ReceiptItem[] = Array.isArray(sale.items_json) ? sale.items_json.map((item: LegacySaleItem) => ({
                                    id: item.id ?? item.product_id ?? `${sale.id}-${Math.random()}`,
                                    sku: item.sku ?? item.product?.sku ?? 'SKU',
                                    name: item.name ?? item.product?.name ?? 'Produit',
                                    quantity: Number(item.quantity ?? item.qty ?? 1),
                                    unit_price_xof: Number(item.unit_price_xof ?? item.appliedUnitPriceXof ?? item.product?.standard_retail_price_xof ?? 0),
                                    total_price_xof: Number(item.total_price_xof ?? ((item.unit_price_xof ?? item.appliedUnitPriceXof ?? item.product?.standard_retail_price_xof ?? 0) * (item.quantity ?? item.qty ?? 1))),
                                  })) : (sale.items ?? []).map((item: LegacySaleItem) => ({
                                    id: item.product?.id ?? item.id ?? `${sale.id}-${Math.random()}`,
                                    sku: item.product?.sku ?? 'SKU',
                                    name: item.product?.name ?? item.name ?? 'Produit',
                                    quantity: Number(item.quantity ?? 1),
                                    unit_price_xof: Number(item.appliedUnitPriceXof ?? item.product?.standard_retail_price_xof ?? 0),
                                    total_price_xof: Number(item.appliedUnitPriceXof ?? item.product?.standard_retail_price_xof ?? 0) * Number(item.quantity ?? 1),
                                  }));

                                  setSaleReceiptToView({
                                    receiptNumber: sale.receiptNumber ?? sale.id ?? 'LMB-000',
                                    createdAt: sale.created_at ?? sale.createdAt ?? new Date().toISOString(),
                                    cashierName: sale.cashierName ?? 'Inconnu',
                                    storeName: sale.storeName ?? sale.store_code ?? 'Inconnu',
                                    customer: {
                                      full_name: customerName,
                                      phone: customerPhone,
                                      vip_status: vipStatus,
                                      loyalty_points: sale.customer_points ?? 0,
                                    },
                                    items,
                                    subtotalXof: safeTotal + safeDiscount,
                                    discountXof: safeDiscount,
                                    totalXof: safeTotal,
                                    paymentMethod: sale.payment_method ?? sale.paymentMethod ?? 'ESPECES',
                                    pointsEarned: sale.points_earned ?? Math.max(0, Math.floor(Number(safeTotal) / 1000)),
                                    pointsBalance: Number(sale.customer_points ?? 0),
                                    vipStatus,
                                  });
                                  setIsSaleReceiptModalOpen(true);
                                }}
                                className="px-3 py-1 bg-slate-800 hover:bg-cyan-500 hover:text-slate-950 text-slate-200 rounded-xl text-xs font-bold transition cursor-pointer"
                              >
                                Réimprimer Ticket
                              </button>
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
        )}
      </main>

      {/* ========================================================================= */}
      {/* MODALE DÉTAIL D'UN RAPPORT D'INVENTAIRE */}
      {/* ========================================================================= */}
      {selectedReportDetail && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-cyan-500/40 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-4 text-xs font-mono">
            <div className="flex justify-between items-start border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-100 font-serif flex items-center gap-2">
                  <Boxes className="w-5 h-5 text-cyan-400" />
                  Détail du Rapport d&apos;Inventaire
                </h3>
                <p className="text-slate-400 text-[11px] font-sans mt-0.5">
                  {selectedReportDetail.location_country} • Effectué par : <strong className="text-cyan-300">{selectedReportDetail.cashier_name}</strong>
                </p>
                <p className="text-slate-500 text-[10px]">
                  Date : {new Date(selectedReportDetail.created_at).toLocaleString('fr-FR')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReportDetail(null)}
                className="text-slate-400 hover:text-slate-200 text-sm"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 bg-slate-950 p-3 rounded-2xl border border-slate-800 text-center">
              <div>
                <span className="text-slate-500 text-[10px] block">THÉORIQUE</span>
                <strong className="text-slate-200 text-sm">{selectedReportDetail.total_expected} flacons</strong>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">PHYSIQUE COMPTÉ</span>
                <strong className="text-slate-100 text-sm">{selectedReportDetail.total_counted} flacons</strong>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">ÉCART GLOBAL</span>
                <strong className={`text-sm ${selectedReportDetail.net_variance === 0 ? 'text-emerald-400' : selectedReportDetail.net_variance > 0 ? 'text-teal-300' : 'text-rose-400'}`}>
                  {selectedReportDetail.net_variance > 0 ? `+${selectedReportDetail.net_variance}` : selectedReportDetail.net_variance}
                </strong>
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                    <th className="py-2">SKU</th>
                    <th className="py-2 font-sans">Nom du Soin</th>
                    <th className="py-2 text-center">Théorique</th>
                    <th className="py-2 text-center">Compté</th>
                    <th className="py-2 text-right">Écart</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {(selectedReportDetail.details || []).map((d, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-800/20">
                      <td className="py-1.5 font-bold text-cyan-400">{d.sku}</td>
                      <td className="py-1.5 font-sans text-slate-200 truncate max-w-[220px]">{d.name}</td>
                      <td className="py-1.5 text-center text-slate-400">{d.theoretical}</td>
                      <td className="py-1.5 text-center font-bold text-slate-100">{d.physical}</td>
                      <td className="py-1.5 text-right font-bold">
                        {d.discrepancy === 0 ? (
                          <span className="text-emerald-400">0</span>
                        ) : d.discrepancy > 0 ? (
                          <span className="text-teal-300">+{d.discrepancy}</span>
                        ) : (
                          <span className="text-rose-400">{d.discrepancy}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedReportDetail(null)}
                className="py-2.5 bg-slate-800 text-slate-300 font-bold rounded-xl text-xs cursor-pointer font-sans"
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="py-2.5 bg-gradient-to-r from-cyan-500 to-teal-300 text-slate-950 font-bold rounded-xl text-xs shadow-md flex items-center justify-center gap-1.5 cursor-pointer font-sans"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Imprimer l&apos;Audit</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {isSaleReceiptModalOpen && saleReceiptToView && (
        <ReceiptModal
          isOpen={isSaleReceiptModalOpen}
          onClose={() => {
            setIsSaleReceiptModalOpen(false);
            setSaleReceiptToView(null);
          }}
          receipt={saleReceiptToView}
        />
      )}

      {/* MODALE NOUVEAU SOIN */}
      {isNewProductModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-cyan-500/40 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 text-slate-100">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Plus className="w-5 h-5 text-cyan-400" />
                Enregistrer un Nouveau Soin LMB
              </h3>
              <button type="button" onClick={() => setIsNewProductModalOpen(false)} className="text-slate-400 hover:text-slate-200" aria-label="Fermer">
                ✕
              </button>
            </div>

            <form onSubmit={handleAddNewProductSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">SKU Auto :</label>
                  <input
                    type="text"
                    required
                    value={newProdSku}
                    onChange={(e) => setNewProdSku(e.target.value.toUpperCase())}
                    className="w-full bg-slate-950 border border-cyan-500/40 rounded-xl p-2 font-mono font-bold text-cyan-300 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Gamme :</label>
                  <select
                    value={selectedGammeType}
                    onChange={(e) => setSelectedGammeType(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-slate-200 font-semibold"
                  >
                    <option value="Gamme Bleaching">Gamme Bleaching</option>
                    <option value="Gamme Exclusive">Gamme Exclusive</option>
                    <option value="Gamme Gold">Gamme Gold ✨</option>
                    <option value="Gamme Gluta">Gamme Gluta</option>
                    <option value="Soins Visage">Soins Visage</option>
                    <option value="Soins Corps">Soins Corps</option>
                    <option value="CUSTOM">➕ Créer Nouvelle Gamme...</option>
                  </select>
                </div>
              </div>

              {selectedGammeType === 'CUSTOM' && (
                <div>
                  <label className="text-teal-300 font-semibold block mb-1">Nom de la Nouvelle Gamme :</label>
                  <input
                    type="text"
                    required
                    placeholder="ex: Gamme Diamant Noir"
                    value={customGammeName}
                    onChange={(e) => setCustomGammeName(e.target.value)}
                    className="w-full bg-slate-950 border border-teal-500/40 rounded-xl p-2 text-teal-300 font-semibold"
                  />
                </div>
              )}

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Nom du Soin :</label>
                <input
                  type="text"
                  required
                  placeholder="ex: Lait Corps Éclat 500ml"
                  value={newProdName}
                  onChange={(e) => setNewProdName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-slate-100 font-semibold focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Prix Standard (FCFA) :</label>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  placeholder="ex: 25000"
                  value={newProdPrice}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setNewProdPrice(e.target.value.replace(/\D/g, '').replace(/^0+/, ''))}
                  className="w-full bg-slate-950 border border-cyan-500/40 rounded-xl p-2 font-mono font-bold text-cyan-300 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  Coût d’achat réel (FCFA) <span className="text-slate-500 font-normal">— optionnel</span> :
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Laisser vide = marge estimée à 65 %"
                  value={newProdCost}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setNewProdCost(e.target.value.replace(/\D/g, '').replace(/^0+/, ''))}
                  className="w-full bg-slate-950 border border-amber-500/40 rounded-xl p-2 font-mono font-bold text-amber-300 focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Renseigné, il donne une marge exacte dans Finance ; sinon la marge est estimée et signalée comme telle.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-400 block mb-1">🇸🇳 Stock Initial Dakar :</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={newProdStockDkr}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setNewProdStockDkr(e.target.value.replace(/\D/g, '').replace(/^0+/, ''))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-center font-mono font-bold text-cyan-300"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">🇨🇮 Stock Initial Abidjan :</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={newProdStockAbj}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setNewProdStockAbj(e.target.value.replace(/\D/g, '').replace(/^0+/, ''))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-center font-mono font-bold text-teal-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsNewProductModalOpen(false)}
                  className="bg-slate-800 py-2.5 rounded-xl font-bold text-slate-300 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isAddingProduct}
                  className="bg-gradient-to-r from-cyan-500 to-teal-300 hover:from-cyan-400 text-slate-950 font-bold py-2.5 rounded-xl shadow-md cursor-pointer"
                >
                  {isAddingProduct ? 'Enregistrement...' : 'Enregistrer dans Supabase'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}