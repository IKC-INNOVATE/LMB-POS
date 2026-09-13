import { supabase } from '@/lib/supabase';
import { Customer, LoyaltyEvent } from '@/types';

const normalizeCustomer = (row: Partial<Customer> | null | undefined): Partial<Customer> | null => {
  if (!row) return null;

  return {
    ...row,
    id: row.id,
    full_name: row.full_name ?? '',
    phone: row.phone ?? '',
    email: row.email ?? null,
    country: row.country ?? 'SN',
    loyalty_points: Number(row.loyalty_points ?? 0),
    vip_status: row.vip_status ?? 'STANDARD',
    total_spent_xof: Number(row.total_spent_xof ?? 0),
    total_orders: Number(row.total_orders ?? 0),
    last_purchase_at: row.last_purchase_at ?? null,
    notes: row.notes ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

export async function listCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase
    .from('lmb_customers')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('listCustomers error:', error);
    return [];
  }

  return (data ?? []).map((row) => normalizeCustomer(row) as Customer).filter(Boolean) as Customer[];
}

export async function getCustomerById(customerId: string): Promise<Customer | null> {
  if (!customerId) return null;

  const { data, error } = await supabase
    .from('lmb_customers')
    .select('*')
    .eq('id', customerId)
    .single();

  if (error) {
    console.warn('getCustomerById error:', error);
    return null;
  }

  return normalizeCustomer(data) as Customer;
}

export async function searchCustomers(query: string): Promise<Customer[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const searchTerm = `%${trimmed}%`;

  const { data, error } = await supabase
    .from('lmb_customers')
    .select('*')
    .or(
      `full_name.ilike.${searchTerm},phone.ilike.${searchTerm},email.ilike.${searchTerm}`
    )
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.warn('searchCustomers error:', error);
    return [];
  }

  return (data ?? []).map((row) => normalizeCustomer(row) as Customer).filter(Boolean) as Customer[];
}

export async function createCustomer(data: Partial<Customer>): Promise<Customer | null> {
  const fullName = data.full_name ?? '';
  const phone = data.phone ?? '';
  const email = data.email ?? null;
  const vipStatus = (data.vip_status ?? 'STANDARD') as string;
  const totalSpent = Number(data.total_spent_xof ?? 0);
  const loyaltyPoints = Number(data.loyalty_points ?? 0);

  // Schéma réel de lmb_customers (vérifié via information_schema) : pas de
  // colonnes name / pays / vip_level / total_spent / total_depense / statut_vip /
  // points_fidelite. loyalty_points est l'unique source de vérité des points.
  const payload = {
    full_name: fullName,
    phone,
    email,
    country: data.country ?? 'SN',
    vip_status: vipStatus,
    loyalty_points: loyaltyPoints,
    total_spent_xof: totalSpent,
    total_orders: Number(data.total_orders ?? 0),
    notes: data.notes ?? {},
  };

  if (!payload.full_name && !payload.phone && !payload.email) {
    throw new Error('Un identifiant client est requis pour créer la fiche.');
  }

  const { data: inserted, error } = await supabase
    .from('lmb_customers')
    .insert([payload])
    .select()
    .single();

  if (error) {
    console.warn('createCustomer error:', error);
    throw error;
  }

  return normalizeCustomer(inserted) as Customer;
}

const computeVipStatus = (totalSpentXof: number): 'STANDARD' | 'VIP' | 'VIP_PREMIUM' => {
  if (totalSpentXof >= 250000) return 'VIP_PREMIUM';
  if (totalSpentXof >= 150000) return 'VIP';
  return 'STANDARD';
};

export async function addLoyaltyPoints(customerId: string, amountSpent: number): Promise<Customer | null> {
  const safeAmount = Number(amountSpent) || 0;
  if (!customerId) {
    throw new Error('customerId requis pour calculer les points de fidélité.');
  }

  const customer = await getCustomerById(customerId);
  if (!customer) {
    throw new Error('Client introuvable.');
  }

  const currentSpent = Number(customer.total_spent_xof ?? 0);
  const pointsEarned = Math.max(0, Math.floor(safeAmount / 1000));
  const newSpent = currentSpent + safeAmount;
  const nextStatus = computeVipStatus(newSpent);
  const currentPoints = Number(customer.loyalty_points ?? 0);
  const attemptedPoints = currentPoints + pointsEarned;

  const { data: updated, error } = await supabase
    .from('lmb_customers')
    .update({
      total_spent_xof: newSpent,
      loyalty_points: attemptedPoints,
      vip_status: nextStatus,
      last_purchase_at: new Date().toISOString(),
    })
    .eq('id', customerId)
    .select()
    .single();

  if (error) {
    console.warn('addLoyaltyPoints update error:', error);
    throw error;
  }

  await supabase.from('lmb_customer_loyalty_events').insert([
    {
      customer_id: customerId,
      event_type: 'PURCHASE',
      points_delta: pointsEarned,
      reason: 'Achat vendu - calcul automatique points fidélité',
      metadata: {
        amount_spent_xof: safeAmount,
        new_total_spent_xof: newSpent,
        vip_status: nextStatus,
      },
    },
  ]);

  return normalizeCustomer(updated) as Customer;
}

export async function useLoyaltyPoints(customerId: string, pointsToUse: number): Promise<Customer | null> {
  const safePoints = Number(pointsToUse) || 0;
  if (!customerId || safePoints <= 0) throw new Error('Points à utiliser invalides.');

  const customer = await getCustomerById(customerId);
  if (!customer) throw new Error('Client introuvable.');

  const currentPoints = Number(customer.loyalty_points ?? 0);
  if (currentPoints < safePoints) {
    throw new Error('Le client ne dispose pas d’assez de points pour cette utilisation.');
  }

  const nextPoints = currentPoints - safePoints;
  const { data: updated, error } = await supabase
    .from('lmb_customers')
    .update({
      loyalty_points: nextPoints,
    })
    .eq('id', customerId)
    .select()
    .single();

  if (error) {
    console.warn('useLoyaltyPoints update error:', error);
    throw error;
  }

  await supabase.from('lmb_customer_loyalty_events').insert([
    {
      customer_id: customerId,
      event_type: 'REDEMPTION',
      points_delta: -safePoints,
      reason: 'Utilisation de points de fidélité',
      metadata: {
        points_used: safePoints,
        remaining_points: nextPoints,
      },
    },
  ]);

  return normalizeCustomer(updated) as Customer;
}
