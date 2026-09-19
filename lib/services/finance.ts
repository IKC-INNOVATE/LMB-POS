import { supabase } from '@/lib/supabase';
import {
  ESTIMATED_COST_RATIO,
  buildCostByKey,
  parseJson,
  parseNumber,
  resolveUnitCost,
  type RawRecord,
} from '@/lib/services/cost';
import { normalizeStore, type StoreKey } from '@/lib/services/store-comparison';
import { getTotalCharges } from '@/lib/services/charges';
import { getTotalPayroll } from '@/lib/services/payroll';

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
  /**
   * Charges d'exploitation (loyer, électricité, eau...) enregistrées dans
   * l'écran Charges (voir lib/services/charges.ts), manuelles ou générées
   * automatiquement depuis un modèle récurrent — Phase 4 du chantier Charges.
   * Distinct de `totalCashExpenses` (sorties de caisse en espèces).
   */
  totalOperatingCharges: number;
  /**
   * Masse salariale chargée (salaire brut + cotisations patronales) des
   * bulletins de paie déjà générés dans le Registre RH — Phase 6 du
   * chantier Charges. Voir lib/services/payroll.ts → getTotalPayroll().
   * Distincte de `totalOperatingCharges` (loyer, électricité...).
   */
  totalPayroll: number;
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

/**
 * @param storeFilter Boutique unique ('DAKAR' | 'ABIDJAN'), ou undefined/null pour
 *   le réseau entier (comportement historique, inchangé par défaut).
 */
export async function getFinancialOverview(
  startDate: string,
  endDate: string,
  storeFilter?: StoreKey | null,
): Promise<FinancialOverview> {
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

  const allSales = (salesResult.data ?? []) as RawRecord[];
  let expenses = (expensesResult.data ?? []) as RawRecord[];

  // Filtre boutique (ventes) : même logique de normalisation que le Comparatif
  // Boutiques (`store_name` -> 'DAKAR' | 'ABIDJAN' | null), pour rester
  // cohérent avec cet écran plutôt que de filtrer côté requête sur une valeur
  // dont la casse/espacement réels en base ne sont pas garantis.
  const sales = storeFilter
    ? allSales.filter((sale) => normalizeStore(sale.store_name) === storeFilter)
    : allSales;

  // Filtre boutique (dépenses de caisse) : `lmb_register_expenses` n'a pas de
  // colonne boutique directe — elle est rattachée à une caisse (`register_id`)
  // qui, elle, porte `store_code`. On récupère donc les caisses de la
  // boutique choisie pour ne garder que leurs sorties de caisse.
  if (storeFilter) {
    const registersResult = await supabase.from('lmb_registers').select('id').eq('store_code', storeFilter);
    if (registersResult.error) {
      console.warn(
        'getFinancialOverview: lecture des caisses par boutique impossible, dépenses de caisse non filtrées',
        registersResult.error,
      );
    } else {
      const registerIds = new Set((registersResult.data ?? []).map((r: RawRecord) => r.id));
      expenses = expenses.filter((expense) => registerIds.has(expense.register_id));
    }
  }

  // Clé (id OU sku, en minuscules) -> coût d'achat réel > 0.
  const costByKey = buildCostByKey(productsResult.data as RawRecord[] | null);

  // Charges d'exploitation (Phase 4) : non bloquant, comme le coût produit
  // ci-dessus — une erreur ici (table absente, RLS...) ne doit pas casser le
  // reste du rapport financier, seulement laisser cette ligne à 0.
  let totalOperatingCharges = 0;
  try {
    totalOperatingCharges = await getTotalCharges(safeStart.slice(0, 10), safeEnd.slice(0, 10), storeFilter ?? null);
  } catch (err) {
    console.warn(
      "getFinancialOverview: lecture des charges d'exploitation impossible, ligne ignorée dans le rapport",
      err,
    );
  }

  // Masse salariale (Phase 6) : même principe non bloquant — une erreur ici
  // ne doit pas casser le reste du rapport financier.
  let totalPayroll = 0;
  try {
    totalPayroll = await getTotalPayroll(safeStart.slice(0, 10), safeEnd.slice(0, 10), storeFilter ?? null);
  } catch (err) {
    console.warn(
      'getFinancialOverview: lecture de la masse salariale impossible, ligne ignorée dans le rapport',
      err,
    );
  }

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
    totalOperatingCharges,
    totalPayroll,
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
