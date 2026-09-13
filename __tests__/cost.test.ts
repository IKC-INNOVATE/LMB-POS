import { describe, expect, it } from 'vitest';
import { buildCostByKey, resolveUnitCost, ESTIMATED_COST_RATIO } from '@/lib/services/cost';

describe('resolveUnitCost — coût réel > coût produit > estimation à 65 %', () => {
  it('utilise le coût porté par la ligne de vente en priorité absolue', () => {
    const item = { unit_price_xof: 10_000, unit_cost_xof: 4_000 };
    const result = resolveUnitCost(item, new Map([['x', 9_999]]));

    expect(result.cost).toBe(4_000);
    expect(result.estimated).toBe(false);
  });

  it('utilise le coût produit réel (cost_price_xof) si la ligne ne porte pas de coût', () => {
    const item = { product_id: 'p1', unit_price_xof: 10_000 };
    const costByKey = buildCostByKey([{ id: 'p1', cost_price_xof: 6_500 }]);
    const result = resolveUnitCost(item, costByKey);

    expect(result.cost).toBe(6_500);
    expect(result.estimated).toBe(false);
  });

  it("retombe sur l'estimation à 65 % du prix de vente quand aucun coût réel n'est disponible", () => {
    const item = { product_id: 'inconnu', unit_price_xof: 10_000 };
    const result = resolveUnitCost(item, new Map());

    expect(result.cost).toBe(10_000 * ESTIMATED_COST_RATIO);
    expect(result.estimated).toBe(true);
  });

  it('retrouve le coût produit par SKU quand product_id est absent', () => {
    const item = { sku: 'LMB24', unit_price_xof: 20_000 };
    const costByKey = buildCostByKey([{ id: 'other-id', sku: 'LMB24', cost_price_xof: 8_000 }]);
    const result = resolveUnitCost(item, costByKey);

    expect(result.cost).toBe(8_000);
    expect(result.estimated).toBe(false);
  });

  it('ignore un cost_price_xof à 0 (produit jamais renseigné) et retombe sur l’estimation', () => {
    const item = { product_id: 'p1', unit_price_xof: 10_000 };
    const costByKey = buildCostByKey([{ id: 'p1', cost_price_xof: 0 }]);
    const result = resolveUnitCost(item, costByKey);

    expect(result.estimated).toBe(true);
    expect(result.cost).toBe(6_500);
  });
});
