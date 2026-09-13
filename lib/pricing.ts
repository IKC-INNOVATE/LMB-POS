// Calcul du total du panier de la caisse : sous-total, remise VIP, remise
// code promo, et plafond sur leur CUMUL.
//
// EXTRACTION SANS CHANGEMENT DE COMPORTEMENT : ce code provient tel quel de
// `app/page.tsx` (Tâche 2.3 de la feuille de route). Il est isolé ici pour
// pouvoir être testé (Tâche 3.6) indépendamment du composant React. Toute
// modification ici impacte directement le total facturé en caisse — ne pas
// changer la logique sans test de non-régression.

/**
 * Plafond sur le CUMUL des remises (remise VIP + code promo) rapporté au
 * sous-total d'une vente. Au-delà, la remise est automatiquement écrêtée à
 * cette valeur (jamais de blocage de vente). N'affecte PAS le garde-fou de
 * prix plancher par ligne de produit (isUnderFloorPrice), qui est distinct.
 */
export const MAX_TOTAL_DISCOUNT_RATE = 0.3; // 30 % du sous-total

export interface CartTotals {
  subtotal: number;
  vipDiscountAmount: number;
  requestedDiscountAmount: number;
  maxDiscountAmount: number;
  discountIsCapped: boolean;
  discountAmount: number;
  total: number;
}

export function computeCartTotals(
  subtotal: number,
  vipDiscountRate: number,
  promoDiscount: number,
  maxTotalDiscountRate: number = MAX_TOTAL_DISCOUNT_RATE
): CartTotals {
  const vipDiscountAmount = subtotal * vipDiscountRate;
  // Remise cumulée demandée (VIP + promo) puis écrêtage éventuel au plafond.
  const requestedDiscountAmount = vipDiscountAmount + promoDiscount;
  const maxDiscountAmount = subtotal * maxTotalDiscountRate;
  // Marge de 0,5 FCFA pour éviter un faux "plafonné" dû aux arrondis flottants.
  const discountIsCapped = requestedDiscountAmount > maxDiscountAmount + 0.5;
  const discountAmount = Math.min(requestedDiscountAmount, maxDiscountAmount);
  const total = Math.max(0, subtotal - discountAmount);

  return {
    subtotal,
    vipDiscountAmount,
    requestedDiscountAmount,
    maxDiscountAmount,
    discountIsCapped,
    discountAmount,
    total,
  };
}
