import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeRpcMock, queueSupabaseFrom } from './testUtils/supabaseMock';

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

async function loadServiceWithMocks(rpcMock: ReturnType<typeof vi.fn>, fromMock?: ReturnType<typeof vi.fn>) {
  const { supabase } = await import('@/lib/supabase');
  Object.assign(supabase, { rpc: rpcMock, from: fromMock ?? queueSupabaseFrom([]) });
  return import('@/lib/services/sales');
}

const basePayload = {
  cashier_name: 'Caisse Dakar',
  store_name: 'DAKAR',
  payment_method: 'ESPECES',
  items: [
    { product_id: 'p1', name: 'Créme vergeture', sku: 'LMB24', quantity: 2, unit_price_xof: 15_000, total_price_xof: 30_000 },
  ],
};

describe('createSaleWithCustomer — refus explicite, jamais de faux succès', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("lève une InsufficientStockError nommée quand la fonction Postgres refuse la vente pour stock insuffisant", async () => {
    const rpc = makeRpcMock([
      { data: null, error: { message: "stock insuffisant pour 'Créme vergeture' à DAKAR — 2 demandé(s), 1 disponible(s)." } },
    ]);
    const { createSaleWithCustomer, InsufficientStockError } = await loadServiceWithMocks(rpc);

    await expect(createSaleWithCustomer(basePayload)).rejects.toBeInstanceOf(InsufficientStockError);
  });

  it('lève une erreur explicite (pas un succès silencieux) sur toute autre erreur de la base', async () => {
    const rpc = makeRpcMock([{ data: null, error: { message: 'connexion perdue' } }]);
    const { createSaleWithCustomer } = await loadServiceWithMocks(rpc);

    await expect(createSaleWithCustomer(basePayload)).rejects.toThrow(/Échec de l.enregistrement de la vente/i);
  });

  it("refuse une vente dont la boutique n'est ni DAKAR ni ABIDJAN, avant tout appel réseau", async () => {
    const rpc = makeRpcMock([{ data: { id: 'sale-1' }, error: null }]);
    const { createSaleWithCustomer } = await loadServiceWithMocks(rpc);

    await expect(
      createSaleWithCustomer({ ...basePayload, store_name: 'LMB Boutique Abidjan (Cocody)' })
    ).rejects.toThrow(/Boutique de vente invalide/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('renvoie un reçu avec le vrai mode de paiement et le bon total quand la vente réussit', async () => {
    const rpc = makeRpcMock([{ data: { id: 'sale-1', receipt_number: 'LMB-1' }, error: null }]);
    const { createSaleWithCustomer } = await loadServiceWithMocks(rpc);

    const result = await createSaleWithCustomer({
      ...basePayload,
      payment_method: 'WAVE',
      subtotal_xof: 30_000,
      discount_xof: 0,
      total_xof: 30_000,
    });

    expect(result.receipt.paymentMethod).toBe('WAVE');
    expect(result.receipt.totalXof).toBe(30_000);
  });
});
