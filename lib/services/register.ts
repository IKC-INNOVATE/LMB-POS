import { supabase } from '@/lib/supabase';
import { parseJson, parseNumber } from '@/lib/services/cost';

const sanitizeForSupabase = <T extends Record<string, unknown>>(data: T) =>
  Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  ) as T;

export interface RegisterSession {
  id?: string;
  store_code: string;
  cashier_name: string;
  initial_cash: number;
  opened_at: string;
  closed_at?: string | null;
  counted_cash?: number | null;
  theoretical_cash?: number | null;
  variance?: number | null;
  status?: 'OPEN' | 'CLOSED';
  notes?: string | null;
}

export interface RegisterExpense {
  id?: string;
  register_id?: string;
  amount: number;
  reason?: string | null;
  cashier_name?: string | null;
  created_at?: string;
}

export async function openRegister(store_code: string, initial_cash: number, cashier_name: string) {
  const now = new Date().toISOString();

  if (!store_code) {
    throw new Error("Boutique manquante : impossible d'ouvrir une caisse sans boutique rattachée au compte.");
  }

  // Anti-doublon : une seule caisse OPEN par boutique à la fois.
  const existing = await findOpenRegister(store_code);
  if (existing) {
    const openedBy = existing.cashier_name ?? 'un autre compte';
    const openedAt = existing.opened_at ? new Date(existing.opened_at).toLocaleString('fr-FR') : 'récemment';
    throw new Error(
      `Une caisse est déjà ouverte pour ${store_code} (ouverte par ${openedBy} le ${openedAt}). Clôturez-la avant d'en ouvrir une nouvelle.`
    );
  }

  const payload = sanitizeForSupabase({
    store_code,
    initial_cash,
    cashier_name,
    opened_at: now,
    status: 'OPEN',
  });

  const { data, error } = await supabase.from('lmb_registers').insert([payload]).select().single();
  if (error) {
    throw new Error(`Ouverture de caisse impossible : ${error.message}. Vérifiez la connexion et réessayez.`);
  }
  if (!data) {
    throw new Error('Ouverture de caisse impossible : aucune ligne renvoyée par la base.');
  }
  return data as RegisterSession;
}

async function findOpenRegister(store_code?: string) {
  let query = supabase.from('lmb_registers').select('*').eq('status', 'OPEN').order('opened_at', { ascending: false }).limit(1);
  if (store_code) query = query.eq('store_code', store_code);
  const { data, error } = await query;
  // Une erreur ici = problème réel (réseau/permissions), pas "aucune caisse ouverte".
  // On la fait remonter au lieu de la confondre avec l'absence de caisse.
  if (error) {
    throw new Error(`Impossible de vérifier l'état de la caisse : ${error.message}`);
  }
  return (data && data[0]) as RegisterSession | null;
}

export async function addCashExpense(amount: number, reason: string, cashier_name?: string, store_code?: string) {
  const now = new Date().toISOString();

  const register = await findOpenRegister(store_code);
  if (!register) throw new Error('No open register found');

  const payload = sanitizeForSupabase({
    register_id: register.id,
    amount,
    reason,
    cashier_name,
    created_at: now,
  });

  const { data, error } = await supabase.from('lmb_register_expenses').insert([payload]).select().single();
  if (error) {
    throw new Error(`Sortie de caisse NON enregistrée : ${error.message}. Vérifiez la connexion et réessayez.`);
  }
  if (!data) {
    throw new Error('Sortie de caisse NON enregistrée : aucune ligne renvoyée par la base.');
  }
  return data as RegisterExpense;
}

export interface CloseRegisterReport {
  register: RegisterSession;
  total_cash_sales: number;
  total_expenses: number;
  theoretical_cash: number;
  variance: number;
}

export async function closeRegister(
  counted_cash: number,
  notes?: string,
  store_code?: string,
): Promise<CloseRegisterReport> {
  const now = new Date().toISOString();
  const register = await findOpenRegister(store_code);
  if (!register) throw new Error('No open register to close');

  // Sum cash sales since opened_at.
  // Une erreur de lecture fausserait le rapport Z : on refuse la clôture
  // plutôt que de supposer 0 en silence.
  // Schéma réel de `lmb_sales` (table legacy, sans migration de création — documenté
  // en Tâche 1.2) : le montant total est `total_amount_xof`, la boutique est
  // `store_name`, et le mode de paiement espèces vaut littéralement 'ESPECES'.
  //
  // On inclut aussi les ventes 'SPLIT' (paiement mixte) : leur part réellement
  // encaissée en espèces (metadata.payment_details.cash) doit compter dans le
  // fond de caisse théorique, alors qu'avant cette correction elle était
  // purement et simplement ignorée (seul payment_method === 'ESPECES' était lu).
  //
  // Cas particulier d'un acompte payé en espèces (payment_method === 'ESPECES'
  // ET metadata.payment_details.isDeposit === 1) : total_amount_xof porte le
  // montant TOTAL de la vente (prix plein), pas la somme réellement remise en
  // espèces aujourd'hui — seul metadata.payment_details.paid l'est. On utilise
  // donc ce montant précis pour ces ventes-là, jamais le total de la vente.
  const salesRes = await supabase
    .from('lmb_sales')
    .select('total_amount_xof,payment_method,metadata,created_at')
    .eq('store_name', register.store_code)
    .gte('created_at', register.opened_at)
    .lte('created_at', now)
    .in('payment_method', ['ESPECES', 'SPLIT']);

  if (salesRes.error) {
    throw new Error(`Clôture impossible : lecture des ventes espèces échouée (${salesRes.error.message}).`);
  }
  const sales = (salesRes.data as Array<{ total_amount_xof?: number; payment_method?: string; metadata?: unknown }>) || [];
  const total_cash_sales = sales.reduce((sum, r) => {
    const meta = parseJson(r.metadata);
    const details = meta && typeof meta === 'object' ? (meta as Record<string, unknown>).payment_details : null;
    const detailsObj = details && typeof details === 'object' ? (details as Record<string, unknown>) : null;

    if (r.payment_method === 'SPLIT') {
      // Seule la jambe espèces du paiement mixte est du liquide réel en caisse.
      return sum + (detailsObj ? parseNumber(detailsObj.cash) : 0);
    }

    // payment_method === 'ESPECES'
    const isDeposit = detailsObj && Number(detailsObj.isDeposit ?? 0) === 1;
    if (isDeposit) {
      return sum + parseNumber(detailsObj!.paid);
    }
    return sum + parseNumber(r.total_amount_xof);
  }, 0);

  // Sum expenses for this register
  const expRes = await supabase
    .from('lmb_register_expenses')
    .select('amount')
    .eq('register_id', register.id);
  if (expRes.error) {
    throw new Error(`Clôture impossible : lecture des sorties de caisse échouée (${expRes.error.message}).`);
  }
  const exps = (expRes.data as Array<{ amount?: number }>) || [];
  const total_expenses = exps.reduce((s, r) => s + Number(r.amount ?? 0), 0);

  const theoretical_cash = Number(register.initial_cash ?? 0) + Number(total_cash_sales ?? 0) - Number(total_expenses ?? 0);
  const variance = Number(counted_cash) - theoretical_cash;

  const updatePayload = sanitizeForSupabase({
    closed_at: now,
    counted_cash,
    theoretical_cash,
    // Colonnes présentes dès 20260821_create_register_tables.sql : on y persiste
    // les totaux calculés pour que le rapport Z reste consultable a posteriori.
    total_cash_sales,
    total_expenses,
    variance,
    status: 'CLOSED',
    notes,
  });

  const { data, error } = await supabase.from('lmb_registers').update(updatePayload).eq('id', register.id).select().single();
  if (error) {
    throw new Error(`Clôture NON enregistrée : ${error.message}. La caisse reste ouverte, réessayez.`);
  }
  if (!data) {
    throw new Error('Clôture NON enregistrée : aucune ligne renvoyée par la base.');
  }
  return {
    register: data as RegisterSession,
    total_cash_sales,
    total_expenses,
    theoretical_cash,
    variance,
  };
}

export async function getOpenRegister(store_code?: string) {
  return findOpenRegister(store_code);
}
