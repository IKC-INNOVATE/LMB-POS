import { afterEach, describe, expect, it, vi } from 'vitest';
import { queueSupabaseFrom } from './testUtils/supabaseMock';

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

async function loadServiceWithFrom(fromMock: ReturnType<typeof vi.fn>) {
  const { supabase } = await import('@/lib/supabase');
  Object.assign(supabase, { from: fromMock });
  return import('@/lib/services/promotions');
}

describe('validateAndApplyPromoCode', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('refuse un code introuvable', async () => {
    const from = queueSupabaseFrom([{ data: null, error: null }]);
    const { validateAndApplyPromoCode } = await loadServiceWithFrom(from);

    const result = await validateAndApplyPromoCode('INEXISTANT', 10_000);

    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/introuvable/i);
    expect(result.discountAmount).toBe(0);
  });

  it('refuse un code désactivé', async () => {
    const from = queueSupabaseFrom([
      { data: { code: 'PROMO10', discount_type: 'PERCENT', discount_value: 10, is_active: false }, error: null },
    ]);
    const { validateAndApplyPromoCode } = await loadServiceWithFrom(from);

    const result = await validateAndApplyPromoCode('promo10', 10_000);

    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/désactivé/i);
  });

  it('refuse un code pas encore actif (start_date dans le futur)', async () => {
    const from = queueSupabaseFrom([
      {
        data: {
          code: 'FUTUR',
          discount_type: 'PERCENT',
          discount_value: 10,
          is_active: true,
          start_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
        error: null,
      },
    ]);
    const { validateAndApplyPromoCode } = await loadServiceWithFrom(from);

    const result = await validateAndApplyPromoCode('FUTUR', 10_000);

    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/pas encore actif/i);
  });

  it('refuse un code expiré (end_date dans le passé)', async () => {
    const from = queueSupabaseFrom([
      {
        data: {
          code: 'EXPIRE',
          discount_type: 'PERCENT',
          discount_value: 10,
          is_active: true,
          end_date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        },
        error: null,
      },
    ]);
    const { validateAndApplyPromoCode } = await loadServiceWithFrom(from);

    const result = await validateAndApplyPromoCode('EXPIRE', 10_000);

    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/expiré/i);
  });

  it('refuse quand le panier est sous le montant minimum requis', async () => {
    const from = queueSupabaseFrom([
      {
        data: {
          code: 'MIN50000',
          discount_type: 'FIXED',
          discount_value: 5_000,
          is_active: true,
          min_order_amount: 50_000,
        },
        error: null,
      },
    ]);
    const { validateAndApplyPromoCode } = await loadServiceWithFrom(from);

    const result = await validateAndApplyPromoCode('MIN50000', 20_000);

    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/Montant minimum requis/i);
  });

  it("refuse quand la limite d'utilisation est atteinte", async () => {
    const from = queueSupabaseFrom([
      {
        data: {
          code: 'LIMITE3',
          discount_type: 'PERCENT',
          discount_value: 10,
          is_active: true,
          usage_limit: 3,
          usage_count: 3,
        },
        error: null,
      },
    ]);
    const { validateAndApplyPromoCode } = await loadServiceWithFrom(from);

    const result = await validateAndApplyPromoCode('LIMITE3', 10_000);

    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/Limite d.utilisation atteinte/i);
  });

  it('calcule correctement une remise en pourcentage', async () => {
    const from = queueSupabaseFrom([
      { data: { code: 'PROMO20', discount_type: 'PERCENT', discount_value: 20, is_active: true }, error: null },
    ]);
    const { validateAndApplyPromoCode } = await loadServiceWithFrom(from);

    const result = await validateAndApplyPromoCode('PROMO20', 100_000);

    expect(result.valid).toBe(true);
    expect(result.discountAmount).toBe(20_000);
  });

  it('calcule correctement une remise fixe', async () => {
    const from = queueSupabaseFrom([
      { data: { code: 'FIXE5000', discount_type: 'FIXED', discount_value: 5_000, is_active: true }, error: null },
    ]);
    const { validateAndApplyPromoCode } = await loadServiceWithFrom(from);

    const result = await validateAndApplyPromoCode('FIXE5000', 20_000);

    expect(result.valid).toBe(true);
    expect(result.discountAmount).toBe(5_000);
  });

  it('ne fait jamais dépasser la remise fixe au-delà du total du panier', async () => {
    const from = queueSupabaseFrom([
      { data: { code: 'GROS', discount_type: 'FIXED', discount_value: 50_000, is_active: true }, error: null },
    ]);
    const { validateAndApplyPromoCode } = await loadServiceWithFrom(from);

    const result = await validateAndApplyPromoCode('GROS', 10_000);

    expect(result.valid).toBe(true);
    expect(result.discountAmount).toBe(10_000); // plafonné au panier, jamais négatif après application
  });

  it('refuse un panier vide avant même de consulter la base', async () => {
    const from = queueSupabaseFrom([]);
    const { validateAndApplyPromoCode } = await loadServiceWithFrom(from);

    const result = await validateAndApplyPromoCode('PROMO', 0);

    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/panier est vide/i);
    expect(from).not.toHaveBeenCalled();
  });
});
