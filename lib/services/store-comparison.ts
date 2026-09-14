import { supabase } from '@/lib/supabase';
import {
  ESTIMATED_COST_RATIO,
  buildCostByKey,
  getItemSellingPrice,
  parseJson,
  parseNumber,
  resolveUnitCost,
  type RawRecord,
} from '@/lib/services/cost';

// =====================================================================
// Comparatif boutiques Dakar / Abidjan — LECTURE SEULE.
//
// Sources :
//   - CA / ventes / panier / marge : lmb_sales (filtré par store_name)
//   - COGS / marge : items_json de lmb_sales + cost_price_xof de lmb_products,
//     via EXACTEMENT la même logique que lib/services/finance.ts (resolveUnitCost :
//     coût de ligne réel › cost_price_xof produit › estimation 65 % du prix de vente).
//   - Dépenses : lmb_expenses (filtré par store_city) — PAS lmb_register_expenses
//     (dépenses de caisse, notion distincte affichée sur la page Finance).
//
// Aucune jointure : items_json contient nom + sku + quantité + total_price_xof.
// =====================================================================

export type StoreKey = 'DAKAR' | 'ABIDJAN';
export const STORE_KEYS: StoreKey[] = ['DAKAR', 'ABIDJAN'];

/** upper(trim()) défensif → 'DAKAR' | 'ABIDJAN' | null (valeur inattendue / vide). */
export const normalizeStore = (value: unknown): StoreKey | null => {
  const v = String(value ?? '').trim().toUpperCase();
  return v === 'DAKAR' || v === 'ABIDJAN' ? v : null;
};

export interface StoreTopProduct {
  name: string;
  sku: string | null;
  quantity: number;
  revenue: number;
}

export interface StoreComparisonMetrics {
  store: StoreKey;
  totalRevenue: number;
  salesCount: number;
  /** total_amount_xof moyen par ticket. */
  averageBasket: number;
  costOfGoodsSold: number;
  grossMargin: number;
  grossMarginRate: number;
  /** true dès qu'une partie du CA de la boutique repose sur l'estimation 65 %. */
  grossMarginIsEstimated: boolean;
  /** Part du CA (0-100) dont la marge est estimée faute de coût d'achat réel. */
  estimatedRevenueShare: number;
  totalExpenses: number;
  /** CA − COGS − dépenses (peut être négatif). */
  netResult: number;
  topProducts: StoreTopProduct[];
}

export interface StoreComparisonResult {
  startDate: string;
  endDate: string;
  stores: Record<StoreKey, StoreComparisonMetrics>;
  /** Dépenses lmb_expenses dont store_city ≠ DAKAR/ABIDJAN une fois normalisé. */
  unassignedExpenses: {
    total: number;
    count: number;
    /** Valeurs brutes de store_city rencontrées (pour diagnostic). */
    labels: string[];
  };
  /** Ventes lmb_sales dont store_name ≠ DAKAR/ABIDJAN une fois normalisé. */
  unassignedSales: {
    count: number;
    revenue: number;
    labels: string[];
  };
}

const emptyMetrics = (store: StoreKey): StoreComparisonMetrics & {
  _estimatedBasisRevenue: number;
} => ({
  store,
  totalRevenue: 0,
  salesCount: 0,
  averageBasket: 0,
  costOfGoodsSold: 0,
  grossMargin: 0,
  grossMarginRate: 0,
  grossMarginIsEstimated: false,
  estimatedRevenueShare: 0,
  totalExpenses: 0,
  netResult: 0,
  topProducts: [],
  _estimatedBasisRevenue: 0,
});

const getSaleTotal = (sale: RawRecord): number =>
  parseNumber(sale?.total_amount_xof ?? sale?.total_amount ?? sale?.totalAmountXof ?? sale?.amount ?? sale?.total);

const getSaleItems = (sale: RawRecord): RawRecord[] => {
  const fromJson = parseJson(sale?.items_json);
  if (Array.isArray(fromJson)) return fromJson;
  const metadata = parseJson(sale?.metadata) as RawRecord | null;
  if (Array.isArray(metadata?.items)) return metadata.items;
  if (Array.isArray(sale?.items)) return sale.items as RawRecord[];
  return [];
};

const getItemLineRevenue = (item: RawRecord): number => {
  const total = parseNumber(item?.total_price_xof ?? item?.total_xof ?? item?.line_total_xof);
  if (total > 0) return total;
  return getItemSellingPrice(item) * parseNumber(item?.quantity ?? 1);
};

export async function getStoreComparison(
  startDate: string,
  endDate: string,
): Promise<StoreComparisonResult> {
  const safeStart = new Date(startDate).toISOString();
  const safeEnd = new Date(endDate).toISOString();

  const [salesResult, expensesResult, productsResult] = await Promise.all([
    supabase
      .from('lmb_sales')
      .select('*')
      .gte('created_at', safeStart)
      .lte('created_at', safeEnd)
      .order('created_at', { ascending: false }),
    supabase
      .from('lmb_expenses')
      .select('*')
      .gte('created_at', safeStart)
      .lte('created_at', safeEnd)
      .order('created_at', { ascending: false }),
    // cost_price_xof par produit — non bloquant (cf. finance.ts).
    supabase.from('lmb_products').select('*'),
  ]);

  if (salesResult.error) throw salesResult.error;
  if (expensesResult.error) throw expensesResult.error;
  if (productsResult.error) {
    console.warn(
      'getStoreComparison: lecture des coûts produits impossible, marge estimée à 65 %',
      productsResult.error,
    );
  }

  const sales = (salesResult.data ?? []) as RawRecord[];
  const expenses = (expensesResult.data ?? []) as RawRecord[];
  const costByKey = buildCostByKey(productsResult.data as RawRecord[] | null);

  const buckets: Record<StoreKey, ReturnType<typeof emptyMetrics>> = {
    DAKAR: emptyMetrics('DAKAR'),
    ABIDJAN: emptyMetrics('ABIDJAN'),
  };
  const topAgg: Record<StoreKey, Map<string, StoreTopProduct>> = {
    DAKAR: new Map(),
    ABIDJAN: new Map(),
  };

  const unassignedSales = { count: 0, revenue: 0, labels: new Set<string>() };

  sales.forEach((sale) => {
    const store = normalizeStore(sale.store_name);
    const saleTotal = getSaleTotal(sale);

    if (!store) {
      unassignedSales.count += 1;
      unassignedSales.revenue += saleTotal;
      unassignedSales.labels.add(String(sale.store_name ?? '(vide)'));
      return;
    }

    const bucket = buckets[store];
    bucket.totalRevenue += saleTotal;
    bucket.salesCount += 1;

    const items = getSaleItems(sale);

    if (items.length > 0) {
      let itemCost = 0;
      let saleHasEstimate = false;

      items.forEach((item: RawRecord) => {
        const quantity = parseNumber(item?.quantity ?? 1);
        const { cost, estimated } = resolveUnitCost(item, costByKey);
        itemCost += quantity * cost;
        if (estimated) saleHasEstimate = true;

        // Agrégation top produits (nom prioritaire, sinon sku).
        const product = item?.product as RawRecord | undefined;
        const name = String(item?.name ?? item?.product_name ?? product?.name ?? '').trim();
        const sku = item?.sku ?? product?.sku ?? item?.product_id ?? null;
        const key = (name || String(sku ?? '') || 'Produit inconnu').toLowerCase();
        const entry = topAgg[store].get(key) ?? {
          name: name || String(sku ?? 'Produit inconnu'),
          sku: sku ? String(sku) : null,
          quantity: 0,
          revenue: 0,
        };
        entry.quantity += quantity;
        entry.revenue += getItemLineRevenue(item);
        topAgg[store].set(key, entry);
      });

      // Coût plafonné au CA de la vente : garde grossMargin ≥ 0 par ticket et
      // l'identité CA − COGS = grossMargin (cf. finance.ts qui fait max(0, …)).
      const cappedCost = Math.min(itemCost, saleTotal);
      bucket.costOfGoodsSold += cappedCost;
      bucket.grossMargin += saleTotal - cappedCost;
      if (saleHasEstimate) bucket._estimatedBasisRevenue += saleTotal;
    } else {
      // Aucun détail d'articles -> marge forcément estimée (identique finance.ts).
      bucket.costOfGoodsSold += saleTotal * ESTIMATED_COST_RATIO;
      bucket.grossMargin += saleTotal * (1 - ESTIMATED_COST_RATIO);
      bucket._estimatedBasisRevenue += saleTotal;
    }
  });

  const unassignedExpenses = { total: 0, count: 0, labels: new Set<string>() };

  expenses.forEach((expense) => {
    const amount = parseNumber(expense.amount_xof ?? expense.amount ?? expense.total_amount);
    const store = normalizeStore(expense.store_city);
    if (!store) {
      unassignedExpenses.total += amount;
      unassignedExpenses.count += 1;
      unassignedExpenses.labels.add(String(expense.store_city ?? '(vide)'));
      return;
    }
    buckets[store].totalExpenses += amount;
  });

  STORE_KEYS.forEach((store) => {
    const b = buckets[store];
    b.averageBasket = b.salesCount > 0 ? b.totalRevenue / b.salesCount : 0;
    b.grossMarginRate = b.totalRevenue > 0 ? (b.grossMargin / b.totalRevenue) * 100 : 0;
    b.estimatedRevenueShare =
      b.totalRevenue > 0 ? (b._estimatedBasisRevenue / b.totalRevenue) * 100 : 0;
    b.grossMarginIsEstimated = b._estimatedBasisRevenue > 0;
    b.netResult = b.totalRevenue - b.costOfGoodsSold - b.totalExpenses;
    b.topProducts = [...topAgg[store].values()]
      .sort((a, c) => c.quantity - a.quantity || c.revenue - a.revenue)
      .slice(0, 10);
  });

  const strip = (b: ReturnType<typeof emptyMetrics>): StoreComparisonMetrics => ({
    store: b.store,
    totalRevenue: b.totalRevenue,
    salesCount: b.salesCount,
    averageBasket: b.averageBasket,
    costOfGoodsSold: b.costOfGoodsSold,
    grossMargin: b.grossMargin,
    grossMarginRate: b.grossMarginRate,
    grossMarginIsEstimated: b.grossMarginIsEstimated,
    estimatedRevenueShare: b.estimatedRevenueShare,
    totalExpenses: b.totalExpenses,
    netResult: b.netResult,
    topProducts: b.topProducts,
  });

  return {
    startDate: safeStart,
    endDate: safeEnd,
    stores: {
      DAKAR: strip(buckets.DAKAR),
      ABIDJAN: strip(buckets.ABIDJAN),
    },
    unassignedExpenses: {
      total: unassignedExpenses.total,
      count: unassignedExpenses.count,
      labels: [...unassignedExpenses.labels],
    },
    unassignedSales: {
      count: unassignedSales.count,
      revenue: unassignedSales.revenue,
      labels: [...unassignedSales.labels],
    },
  };
}
