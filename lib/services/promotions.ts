import { supabase } from '@/lib/supabase';

export type PromotionDiscountType = 'PERCENT' | 'FIXED';

export interface Promotion {
  id?: string;
  code: string;
  discount_type: PromotionDiscountType;
  discount_value: number;
  min_order_amount: number;
  start_date?: string | null;
  end_date?: string | null;
  usage_limit?: number | null;
  usage_count?: number;
  is_active?: boolean;
  created_at?: string;
}

export interface PromoValidationResult {
  valid: boolean;
  message: string;
  discountAmount: number;
  promotion?: Promotion | null;
}

const normalizeCode = (code: string) => (code ?? '').trim().toUpperCase();

export async function listPromotions(): Promise<Promotion[]> {
  const { data, error } = await supabase
    .from('lmb_promotions')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('listPromotions error:', error);
    return [];
  }

  return (data ?? []) as Promotion[];
}

export async function createPromotion(input: Partial<Promotion>): Promise<Promotion | null> {
  const code = normalizeCode(input.code ?? '');
  const discountType = (input.discount_type ?? 'PERCENT') as PromotionDiscountType;
  const discountValue = Number(input.discount_value ?? 0);

  if (!code) throw new Error('Le code promo est requis.');
  if (discountType !== 'PERCENT' && discountType !== 'FIXED') {
    throw new Error("Type de réduction invalide (attendu 'PERCENT' ou 'FIXED').");
  }
  if (discountType === 'PERCENT') {
    if (discountValue <= 0 || discountValue > 100) {
      throw new Error('Un pourcentage de réduction doit être compris entre 1 et 100.');
    }
  } else if (discountValue <= 0) {
    throw new Error('Le montant de la réduction (FCFA) doit être supérieur à 0.');
  }

  const payload = {
    code,
    discount_type: discountType,
    discount_value: discountValue,
    min_order_amount: Number(input.min_order_amount ?? 0),
    start_date: input.start_date ?? new Date().toISOString(),
    end_date: input.end_date ?? null,
    usage_limit: input.usage_limit ?? null,
    usage_count: Number(input.usage_count ?? 0),
    is_active: input.is_active ?? true,
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from('lmb_promotions').insert([payload]).select().single();
  if (error) {
    console.warn('createPromotion error:', error);
    // 23505 = violation de contrainte UNIQUE sur `code`.
    if ((error as { code?: string }).code === '23505') {
      throw new Error(`Le code promo « ${code} » existe déjà. Choisissez-en un autre.`);
    }
    throw new Error(error.message || 'Création de la promotion impossible.');
  }

  return data as Promotion;
}

export async function togglePromotionStatus(id: string, isActive: boolean): Promise<Promotion | null> {
  if (!id) return null;

  const { data, error } = await supabase
    .from('lmb_promotions')
    .update({ is_active: isActive })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.warn('togglePromotionStatus error:', error);
    throw new Error(error.message || 'Changement de statut impossible.');
  }

  return data as Promotion;
}

export async function validateAndApplyPromoCode(code: string, cartTotal: number): Promise<PromoValidationResult> {
  const normalizedCode = normalizeCode(code);
  const safeCartTotal = Number(cartTotal ?? 0);

  if (!normalizedCode) {
    return { valid: false, message: 'Code promo requis.', discountAmount: 0 };
  }

  if (safeCartTotal <= 0) {
    return { valid: false, message: 'Le panier est vide.', discountAmount: 0 };
  }

  const { data, error } = await supabase
    .from('lmb_promotions')
    .select('*')
    .eq('code', normalizedCode)
    .maybeSingle();

  if (error) {
    console.warn('validateAndApplyPromoCode query error:', error);
    throw error;
  }

  if (!data) {
    return { valid: false, message: 'Code promo introuvable.', discountAmount: 0 };
  }

  const promotion = data as Promotion;
  const isActive = promotion.is_active ?? true;
  const minOrderAmount = Number(promotion.min_order_amount ?? 0);
  const usageLimit = promotion.usage_limit ? Number(promotion.usage_limit) : null;
  const usageCount = Number(promotion.usage_count ?? 0);
  const now = Date.now();

  if (!isActive) {
    return { valid: false, message: 'Ce code est désactivé.', discountAmount: 0, promotion };
  }

  if (promotion.start_date && new Date(promotion.start_date).getTime() > now) {
    return { valid: false, message: 'Ce code n’est pas encore actif.', discountAmount: 0, promotion };
  }

  if (promotion.end_date && new Date(promotion.end_date).getTime() < now) {
    return { valid: false, message: 'Ce code promo a expiré.', discountAmount: 0, promotion };
  }

  if (safeCartTotal < minOrderAmount) {
    return {
      valid: false,
      message: `Montant minimum requis: ${minOrderAmount.toLocaleString('fr-FR')} FCFA.`,
      discountAmount: 0,
      promotion,
    };
  }

  if (usageLimit !== null && usageCount >= usageLimit) {
    return { valid: false, message: 'Limite d’utilisation atteinte.', discountAmount: 0, promotion };
  }

  let discountAmount = 0;

  if (promotion.discount_type === 'PERCENT') {
    discountAmount = (safeCartTotal * Number(promotion.discount_value ?? 0)) / 100;
  } else {
    discountAmount = Number(promotion.discount_value ?? 0);
  }

  if (discountAmount > safeCartTotal) {
    discountAmount = safeCartTotal;
  }

  return {
    valid: true,
    message: `Réduction appliquée: ${discountAmount.toLocaleString('fr-FR')} FCFA.`,
    discountAmount,
    promotion,
  };
}
