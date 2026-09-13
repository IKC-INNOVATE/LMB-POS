import { describe, expect, it } from 'vitest';
import { computeCartTotals, MAX_TOTAL_DISCOUNT_RATE } from '@/lib/pricing';

describe('computeCartTotals — remise VIP + code promo, plafonnée à 30 %', () => {
  it('applique la remise demandée telle quelle quand elle reste sous le plafond', () => {
    // Client VIP (5 %) + code promo fixe, panier 100 000 FCFA : cumul demandé
    // 5 000 + 10 000 = 15 000, soit 15 % du sous-total, sous le plafond 30 %.
    const totals = computeCartTotals(100_000, 0.05, 10_000);

    expect(totals.vipDiscountAmount).toBe(5_000);
    expect(totals.requestedDiscountAmount).toBe(15_000);
    expect(totals.discountIsCapped).toBe(false);
    expect(totals.discountAmount).toBe(15_000);
    expect(totals.total).toBe(85_000);
  });

  it("écrête au plafond de 30 % quand VIP_PREMIUM (10 %) + un code promo à 30 % sont cumulés (cas de l'audit)", () => {
    // Reproduit le scénario testé manuellement lors de la Tâche 2.3 :
    // panier 100 000 FCFA, VIP_PREMIUM 10 % (10 000) + promo 30 % (30 000)
    // = 40 000 demandés (40 %) → écrêté à 30 000 (30 %), jamais bloqué.
    const totals = computeCartTotals(100_000, 0.1, 30_000);

    expect(totals.requestedDiscountAmount).toBe(40_000);
    expect(totals.maxDiscountAmount).toBe(30_000);
    expect(totals.discountIsCapped).toBe(true);
    expect(totals.discountAmount).toBe(30_000);
    expect(totals.total).toBe(70_000);
  });

  it("n'affiche pas d'écrêtage quand la remise tombe exactement sur le plafond", () => {
    // Promo seule à -30 %, sans VIP : exactement au plafond, pas de bandeau.
    const totals = computeCartTotals(100_000, 0, 30_000);

    expect(totals.discountIsCapped).toBe(false);
    expect(totals.discountAmount).toBe(30_000);
    expect(totals.total).toBe(70_000);
  });

  it('ne descend jamais sous 0, même avec une remise incohérente supérieure au sous-total', () => {
    const totals = computeCartTotals(10_000, 0, 999_999, 1); // plafond volontairement large pour isoler ce cas
    expect(totals.total).toBe(0);
  });

  it('gère un sous-total nul sans division ni valeur négative', () => {
    const totals = computeCartTotals(0, 0.1, 5_000);
    expect(totals.maxDiscountAmount).toBe(0);
    expect(totals.discountAmount).toBe(0);
    expect(totals.total).toBe(0);
  });

  it('respecte un plafond personnalisé quand il est fourni explicitement', () => {
    const totals = computeCartTotals(100_000, 0, 20_000, 0.15); // plafond à 15 % au lieu de 30 %
    expect(totals.maxDiscountAmount).toBe(15_000);
    expect(totals.discountIsCapped).toBe(true);
    expect(totals.discountAmount).toBe(15_000);
  });

  it('expose la constante métier à 30 % (politique commerciale actuelle)', () => {
    expect(MAX_TOTAL_DISCOUNT_RATE).toBe(0.3);
  });
});
