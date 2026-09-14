// Helpers de résolution de coût partagés entre la page Finance
// (`getFinancialOverview`) et le Comparatif boutiques (`getStoreComparison`).
//
// EXTRACTION SANS CHANGEMENT DE COMPORTEMENT : ce code provient tel quel de
// `lib/services/finance.ts` (Tâche 1.x). Toute modification ici impacte les
// deux écrans — ne pas toucher à la logique sans test de non-régression Finance.

export const parseNumber = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const parseJson = (value: unknown): unknown => {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  return value ?? null;
};

export const findFirstNumber = (values: unknown[]): number => {
  for (const value of values) {
    const parsed = parseNumber(value);
    if (parsed > 0) return parsed;
  }
  return 0;
};

/** Fraction du prix de vente retenue comme coût quand le coût réel est inconnu. */
export const ESTIMATED_COST_RATIO = 0.65;

export type RawRecord = Record<string, unknown>;

export const getItemSellingPrice = (item: RawRecord): number =>
  parseNumber(item?.unit_price_xof ?? item?.price_xof ?? item?.selling_price_xof ?? item?.total_price_xof);

/**
 * Coût unitaire d'une ligne de vente.
 *  - `real` : coût d'achat réel (cost_price_xof du produit ou coût porté par la
 *    ligne) — utilisé tel quel, marge exacte.
 *  - sinon `estimated` : repli 65 % du prix de vente, PRODUIT PAR PRODUIT.
 */
export const resolveUnitCost = (
  item: RawRecord,
  costByKey: Map<string, number>,
): { cost: number; estimated: boolean } => {
  if (!item || typeof item !== 'object') return { cost: 0, estimated: false };

  const lineCost = findFirstNumber([
    item.unit_cost_xof,
    item.unit_cost,
    item.cost_xof,
    item.cost_price_xof,
    item.purchase_price_xof,
    item.cost_price,
    item.cost,
  ]);
  if (lineCost > 0) return { cost: lineCost, estimated: false };

  const key = String(item.product_id ?? item.id ?? item.sku ?? '').toLowerCase();
  const productCost = key ? costByKey.get(key) ?? 0 : 0;
  if (productCost > 0) return { cost: productCost, estimated: false };

  return { cost: getItemSellingPrice(item) * ESTIMATED_COST_RATIO, estimated: true };
};

/**
 * Construit la table clé (id OU sku, minuscules) -> coût d'achat réel > 0
 * à partir des lignes `lmb_products` (`cost_price_xof`). Identique à la logique
 * inline de `getFinancialOverview`.
 */
export const buildCostByKey = <
  T extends { id?: unknown; sku?: unknown; cost_price_xof?: unknown },
>(
  products: T[] | null | undefined,
): Map<string, number> => {
  const costByKey = new Map<string, number>();
  (products ?? []).forEach((product) => {
    const cost = parseNumber(product.cost_price_xof);
    if (cost > 0) {
      if (product.id != null) costByKey.set(String(product.id).toLowerCase(), cost);
      if (product.sku) costByKey.set(String(product.sku).toLowerCase(), cost);
    }
  });
  return costByKey;
};
