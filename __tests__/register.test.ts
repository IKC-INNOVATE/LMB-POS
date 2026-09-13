import { afterEach, describe, expect, it, vi } from 'vitest';
import { queueSupabaseFrom } from './testUtils/supabaseMock';

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

async function loadServiceWithFrom(fromMock: ReturnType<typeof vi.fn>) {
  const { supabase } = await import('@/lib/supabase');
  (supabase as any).from = fromMock;
  return import('@/lib/services/register');
}

const openRegisterRow = {
  id: 'reg-1',
  store_code: 'DAKAR',
  cashier_name: 'Caisse Dakar',
  initial_cash: 20_000,
  opened_at: '2026-08-01T08:00:00.000Z',
  status: 'OPEN',
};

describe('closeRegister — calcul du solde théorique et de l’écart', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('calcule theoretical_cash = fond initial + ventes espèces - sorties de caisse', async () => {
    const from = queueSupabaseFrom([
      { data: [openRegisterRow], error: null }, // findOpenRegister
      { data: [{ total_amount_xof: 40_000 }], error: null }, // ventes espèces
      { data: [{ amount: 12_000 }], error: null }, // sorties de caisse
      { data: { ...openRegisterRow, status: 'CLOSED' }, error: null }, // update de clôture
    ]);
    const { closeRegister } = await loadServiceWithFrom(from);

    const result = await closeRegister(48_000, undefined, 'DAKAR');

    // 20 000 (fond initial) + 40 000 (ventes espèces) - 12 000 (sorties) = 48 000
    expect(result.theoretical_cash).toBe(48_000);
    expect(result.variance).toBe(0); // caissier a compté exactement 48 000
  });

  it("remonte un écart positif quand la caisse compte plus que le solde théorique", async () => {
    const from = queueSupabaseFrom([
      { data: [openRegisterRow], error: null },
      { data: [{ total_amount_xof: 40_000 }], error: null },
      { data: [{ amount: 12_000 }], error: null },
      { data: { ...openRegisterRow, status: 'CLOSED' }, error: null },
    ]);
    const { closeRegister } = await loadServiceWithFrom(from);

    const result = await closeRegister(50_000, undefined, 'DAKAR');

    expect(result.theoretical_cash).toBe(48_000);
    expect(result.variance).toBe(2_000);
  });

  it('additionne correctement plusieurs ventes et plusieurs sorties de caisse', async () => {
    const from = queueSupabaseFrom([
      { data: [openRegisterRow], error: null },
      { data: [{ total_amount_xof: 15_000 }, { total_amount_xof: 25_000 }, { total_amount_xof: 8_000 }], error: null },
      { data: [{ amount: 3_000 }, { amount: 5_000 }], error: null },
      { data: { ...openRegisterRow, status: 'CLOSED' }, error: null },
    ]);
    const { closeRegister } = await loadServiceWithFrom(from);

    const result = await closeRegister(60_000, undefined, 'DAKAR');

    // 20 000 + (15 000+25 000+8 000) - (3 000+5 000) = 60 000
    expect(result.total_cash_sales).toBe(48_000);
    expect(result.total_expenses).toBe(8_000);
    expect(result.theoretical_cash).toBe(60_000);
    expect(result.variance).toBe(0);
  });

  it("refuse de clôturer si aucune caisse n'est ouverte pour la boutique", async () => {
    const from = queueSupabaseFrom([
      { data: [], error: null }, // findOpenRegister -> aucune ligne
    ]);
    const { closeRegister } = await loadServiceWithFrom(from);

    await expect(closeRegister(10_000, undefined, 'ABIDJAN')).rejects.toThrow(/No open register/i);
  });

  it("refuse la clôture (plutôt que de supposer 0) si la lecture des ventes échoue", async () => {
    const from = queueSupabaseFrom([
      { data: [openRegisterRow], error: null },
      { data: null, error: { message: 'connexion perdue' } }, // lecture ventes en échec
    ]);
    const { closeRegister } = await loadServiceWithFrom(from);

    await expect(closeRegister(48_000, undefined, 'DAKAR')).rejects.toThrow(/Clôture impossible/i);
  });
});

describe('openRegister — anti-doublon par boutique', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("refuse d'ouvrir une deuxième caisse sur une boutique où une caisse est déjà ouverte", async () => {
    const from = queueSupabaseFrom([
      { data: [openRegisterRow], error: null }, // findOpenRegister trouve déjà une caisse OPEN
    ]);
    const { openRegister } = await loadServiceWithFrom(from);

    await expect(openRegister('DAKAR', 20_000, 'Caisse Dakar 2')).rejects.toThrow(/déjà ouverte/i);
  });

  it('exige une boutique pour ouvrir une caisse', async () => {
    const from = queueSupabaseFrom([]);
    const { openRegister } = await loadServiceWithFrom(from);

    await expect(openRegister('', 20_000, 'Caisse')).rejects.toThrow(/Boutique manquante/i);
  });
});
