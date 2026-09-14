import { supabase } from '@/lib/supabase';
import {
  ESTIMATED_COST_RATIO,
  buildCostByKey,
  parseJson,
  parseNumber,
  resolveUnitCost,
  type RawRecord,
} from '@/lib/services/cost';

export type FinancialPeriodFilter = 'TODAY' | 'LAST_7_DAYS' | 'THIS_MONTH';

export interface FinancialPaymentBreakdown {
  cash: number;
  mobile_money: number;
  mixed: number;
  deposit: number;
  other: number;
}

export interface FinancialOverview {
  startDate: string;
  endDate: string;
  totalRevenue: number;
  salesCount: number;
  averageBasket: number;
  paymentBreakdown: FinancialPaymentBreakdown;
  totalCashExpenses: number;
  grossMarginEstimate: number;
  grossMarginRate: number;
  /**
   * true dès qu'une partie de la marge repose sur l'estimation 65 % de coût
   * (produit sans `cost_price_xof` renseigné, ou vente sans détail d'articles).
   * L'écran affiche alors une mention « estimation » explicite.
   */
  grossMarginIsEstimated: boolean;
  /** Part du CA (0-100) dont la marge est estimée faute de coût d'achat réel. */
  estimatedRevenueShare: number;
  sales: Array<{
    id: string | number | null;
    total_amount: number;
    payment_method: string | null;
    created_at: string | null;
    payment_details?: unknown;
  }>;
}

const normalizePaymentBucket = (paymentMethod?: string | null, paymentDetails?: unknown): keyof FinancialPaymentBreakdown => {
  const raw = `${paymentMethod ?? ''} ${JSON.stringify(paymentDetails ?? {})}`.toUpperCase();

  if (/CASH|ESPECES|LIQUIDE/.test(raw)) return 'cash';
  if (/ACOMPTE|DEPOSIT|AVANCE|VERSEMENT|PREPAY|SOMME|PARTIEL/.test(raw)) return 'deposit';
  if (/MIXTE|MIXED|HYBRIDE|SPLIT|MULTI|COMBINE|PARTIAL/.test(raw)) return 'mixed';
  if (/WAVE|MOBILE|MOMO|MOOV|ORANGE|CARTE|CB|CARD|BANCAIRE|BANK|PAYPAL/.test(raw)) return 'mobile_money';

  return 'other';
};

const getSalesTotal = (sale: RawRecord): number => {
  const rawValue = sale?.total_amount ?? sale?.totalAmountXof ?? sale?.total_amount_xof ?? sale?.amount ?? sale?.total;
  return parseNumber(rawValue);
};

export async function getFinancialOverview(startDate: string, endDate: string): Promise<FinancialOverview> {
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
      .from('lmb_register_expenses')
      .select('*')
      .gte('created_at', safeStart)
      .lte('created_at', safeEnd)
      .order('created_at', { ascending: false }),
    // Coût d'achat réel par produit — `cost_price_xof` de lmb_products.
    // On sélectionne `*` (comme partout ailleurs dans le code) plutôt qu'une
    // liste de colonnes explicite : si la colonne `cost_price_xof` n'existe pas
    // encore en base (migration non appliquée), `select('id, sku, cost_price_xof')`
    // renvoie une 400 "column ... does not exist" alors que `select('*')`
    // fonctionne et laisse simplement `cost_price_xof` indéfini.
    supabase.from('lmb_products').select('*'),
  ]);

  if (salesResult.error) throw salesResult.error;
  if (expensesResult.error) throw expensesResult.error;
  // Coût produit = NON bloquant : en cas d'erreur (colonne absente, RLS...),
  // on retombe simplement sur l'estimation 65 % au lieu de casser toute la page.
  if (productsResult.error) {
    console.warn(
      'getFinancialOverview: lecture des coûts produits impossible, marge estimée à 65 %',
      productsResult.error,
    );
  }

  const sales = (salesResult.data ?? []) as RawRecord[];
  const expenses = (expensesResult.data ?? []) as RawRecord[];

  // Clé (id OU sku, en minuscules) -> coût d'achat réel > 0.
  const costByKey = buildCostByKey(productsResult.data as RawRecord[] | null);

  const paymentBreakdown: FinancialPaymentBreakdown = {
    cash: 0,
    mobile_money: 0,
    mixed: 0,
    deposit: 0,
    other: 0,
  };

  let totalRevenue = 0;
  let grossMarginEstimate = 0;
  // CA dont la marge repose (au moins en partie) sur l'estimation 65 %.
  let estimatedBasisRevenue = 0;

  sales.forEach((sale) => {
    const saleTotal = getSalesTotal(sale);
    totalRevenue += saleTotal;

    const metadata = parseJson(sale.metadata ?? null) as RawRecord | null;
    const paymentDetails = parseJson(metadata?.payment_details ?? sale.payment_details ?? null);
    const bucket = normalizePaymentBucket(sale.payment_method as string | null | undefined, paymentDetails);
    paymentBreakdown[bucket] += saleTotal;

    const items: RawRecord[] = Array.isArray(metadata?.items)
      ? metadata.items
      : Array.isArray(sale.items)
        ? (sale.items as RawRecord[])
        : [];

    if (items.length > 0) {
      let itemCost = 0;
      let saleHasEstimate = false;
      items.forEach((item: RawRecord) => {
        const quantity = parseNumber(item?.quantity ?? 1);
        const { cost, estimated } = resolveUnitCost(item, costByKey);
        itemCost += quantity * cost;
        if (estimated) saleHasEstimate = true;
      });

      grossMarginEstimate += Math.max(0, saleTotal - itemCost);
      if (saleHasEstimate) estimatedBasisRevenue += saleTotal;
    } else {
      // Aucun détail d'articles -> marge forcément estimée.
      grossMarginEstimate += Math.max(0, saleTotal * (1 - ESTIMATED_COST_RATIO));
      estimatedBasisRevenue += saleTotal;
    }
  });

  const salesCount = sales.length;
  const averageBasket = salesCount > 0 ? totalRevenue / salesCount : 0;
  const totalCashExpenses = expenses.reduce((sum, expense) => sum + parseNumber(expense.amount ?? expense.total_amount), 0);
  const grossMarginRate = totalRevenue > 0 ? (grossMarginEstimate / totalRevenue) * 100 : 0;
  const estimatedRevenueShare = totalRevenue > 0 ? (estimatedBasisRevenue / totalRevenue) * 100 : 0;
  const grossMarginIsEstimated = estimatedBasisRevenue > 0;

  return {
    startDate: safeStart,
    endDate: safeEnd,
    totalRevenue,
    salesCount,
    averageBasket,
    paymentBreakdown,
    totalCashExpenses,
    grossMarginEstimate,
    grossMarginRate,
    grossMarginIsEstimated,
    estimatedRevenueShare,
    sales: sales.map((sale) => {
      const saleMetadata = parseJson(sale.metadata ?? null) as RawRecord | null;
      return {
        id: (sale.id ?? sale.receiptNumber ?? null) as string | number | null,
        total_amount: getSalesTotal(sale),
        payment_method: (sale.payment_method as string | undefined) ?? null,
        created_at: (sale.created_at as string | undefined) ?? null,
        payment_details: parseJson(saleMetadata?.payment_details ?? sale.payment_details ?? null),
      };
    }),
  };
}
