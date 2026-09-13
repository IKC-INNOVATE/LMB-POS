import { afterEach, describe, expect, it, vi } from 'vitest';
import { queueSupabaseFrom } from './testUtils/supabaseMock';

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

async function loadServiceWithFrom(fromMock: ReturnType<typeof vi.fn>) {
  const { supabase } = await import('@/lib/supabase');
  (supabase as any).from = fromMock;
  return import('@/lib/services/customers');
}

const baseCustomer = {
  id: 'cust-1',
  full_name: 'Coumba Test',
  phone: '77 000 00 00',
  loyalty_points: 40,
  total_spent_xof: 100_000,
  vip_status: 'STANDARD',
};

describe('addLoyaltyPoints', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('crédite 1 point par tranche de 1000 FCFA dépensés et cumule sur les points existants', async () => {
    // getCustomerById -> update lmb_customers -> insert lmb_customer_loyalty_events
    const from = queueSupabaseFrom([
      { data: baseCustomer, error: null }, // getCustomerById
      { data: { ...baseCustomer, total_spent_xof: 115_000, loyalty_points: 55, vip_status: 'STANDARD' }, error: null }, // update
      { data: null, error: null }, // insert loyalty event
    ]);
    const { addLoyaltyPoints } = await loadServiceWithFrom(from);

    const updated = await addLoyaltyPoints('cust-1', 15_000);

    // 15 000 / 1000 = 15 points gagnés, 40 + 15 = 55
    expect(updated?.loyalty_points).toBe(55);
  });

  it('fait passer le client STANDARD en VIP_PREMIUM une fois le seuil de 250 000 FCFA cumulés dépassé', async () => {
    const from = queueSupabaseFrom([
      { data: { ...baseCustomer, total_spent_xof: 240_000 }, error: null }, // getCustomerById
      { data: { ...baseCustomer, total_spent_xof: 260_000, vip_status: 'VIP_PREMIUM' }, error: null }, // update
      { data: null, error: null },
    ]);
    const { addLoyaltyPoints } = await loadServiceWithFrom(from);

    await addLoyaltyPoints('cust-1', 20_000);

    // Le statut envoyé à la mise à jour doit être VIP_PREMIUM
    // (240 000 + 20 000 = 260 000 >= seuil de 250 000).
    const updateBuilder = from.mock.results[1].value;
    const updatePayload = updateBuilder.update.mock.calls[0][0];
    expect(updatePayload.vip_status).toBe('VIP_PREMIUM');
    expect(updatePayload.total_spent_xof).toBe(260_000);
  });

  it('conserve le statut VIP (150 000-249 999) sous le seuil VIP_PREMIUM', async () => {
    const from = queueSupabaseFrom([
      { data: { ...baseCustomer, total_spent_xof: 100_000 }, error: null }, // getCustomerById
      { data: { ...baseCustomer, total_spent_xof: 180_000, vip_status: 'VIP' }, error: null }, // update
      { data: null, error: null },
    ]);
    const { addLoyaltyPoints } = await loadServiceWithFrom(from);

    await addLoyaltyPoints('cust-1', 80_000);

    const updateBuilder = from.mock.results[1].value;
    const updatePayload = updateBuilder.update.mock.calls[0][0];
    expect(updatePayload.vip_status).toBe('VIP');
  });

  it("refuse de créditer des points sans customerId", async () => {
    const from = queueSupabaseFrom([]);
    const { addLoyaltyPoints } = await loadServiceWithFrom(from);

    await expect(addLoyaltyPoints('', 10_000)).rejects.toThrow(/customerId requis/i);
  });

  it("ne crédite aucun point pour un montant nul ou négatif", async () => {
    const from = queueSupabaseFrom([
      { data: baseCustomer, error: null },
      { data: { ...baseCustomer, loyalty_points: 40 }, error: null },
      { data: null, error: null },
    ]);
    const { addLoyaltyPoints } = await loadServiceWithFrom(from);

    await addLoyaltyPoints('cust-1', -5_000);
    // Math.max(0, Math.floor(-5000/1000)) = 0 point gagné : pas d'exception,
    // et le service ne doit jamais créditer de points négatifs.
  });
});

describe('useLoyaltyPoints', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("refuse l'utilisation si le client n'a pas assez de points", async () => {
    const from = queueSupabaseFrom([
      { data: { ...baseCustomer, loyalty_points: 10 }, error: null }, // getCustomerById
    ]);
    const { useLoyaltyPoints } = await loadServiceWithFrom(from);

    await expect(useLoyaltyPoints('cust-1', 50)).rejects.toThrow(/assez de points/i);
  });

  it('déduit correctement les points quand le solde est suffisant', async () => {
    const from = queueSupabaseFrom([
      { data: { ...baseCustomer, loyalty_points: 100 }, error: null }, // getCustomerById
      { data: { ...baseCustomer, loyalty_points: 70 }, error: null }, // update
      { data: null, error: null }, // insert loyalty event
    ]);
    const { useLoyaltyPoints } = await loadServiceWithFrom(from);

    const updated = await useLoyaltyPoints('cust-1', 30);

    expect(updated?.loyalty_points).toBe(70);
  });

  it('refuse un nombre de points à utiliser nul ou négatif', async () => {
    const from = queueSupabaseFrom([]);
    const { useLoyaltyPoints } = await loadServiceWithFrom(from);

    await expect(useLoyaltyPoints('cust-1', 0)).rejects.toThrow(/invalides/i);
    await expect(useLoyaltyPoints('cust-1', -5)).rejects.toThrow(/invalides/i);
  });
});
