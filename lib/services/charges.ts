import { supabase } from '@/lib/supabase';

// Phase 1 du chantier "Charges d'exploitation" (voir la feuille de route
// claude/roadmap-module-charges-exploitation-2026-09-19.md, projet LMB) :
// service technique de base pour la table `lmb_charges` (migration
// 20260923_create_charges_table.sql). Aucun écran ne l'utilise encore à ce
// stade — l'écran « Charges » arrive en Phase 2, la déduction dans le
// rapport financier en Phase 4.
//
// Charges ponctuelles uniquement pour l'instant : les modèles de charges
// récurrentes (ex. loyer mensuel généré automatiquement) sont prévus en
// Phase 3, dans une migration et un service séparés.

const sanitizeForSupabase = <T extends Record<string, any>>(data: T) =>
  Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  ) as T;

export type ChargeStore = 'DAKAR' | 'ABIDJAN';

export type ChargeCategory =
  | 'LOYER'
  | 'ELECTRICITE'
  | 'EAU'
  | 'INTERNET_TELEPHONE'
  | 'ASSURANCE'
  | 'AUTRE';

export type ChargePaymentMethod = 'ESPECES' | 'VIREMENT' | 'MOBILE_MONEY' | 'CHEQUE' | 'AUTRE';

export const CHARGE_CATEGORY_LABELS: Record<ChargeCategory, string> = {
  LOYER: 'Loyer',
  ELECTRICITE: 'Électricité',
  EAU: 'Eau',
  INTERNET_TELEPHONE: 'Internet / Téléphone',
  ASSURANCE: 'Assurance',
  AUTRE: 'Autre',
};

export const CHARGE_PAYMENT_METHOD_LABELS: Record<ChargePaymentMethod, string> = {
  ESPECES: 'Espèces',
  VIREMENT: 'Virement',
  MOBILE_MONEY: 'Mobile Money',
  CHEQUE: 'Chèque',
  AUTRE: 'Autre',
};

export interface Charge {
  id: string;
  created_at: string;
  store_code: ChargeStore;
  category: ChargeCategory;
  amount_xof: number;
  charge_date: string;
  payment_method: ChargePaymentMethod | null;
  note: string | null;
  recorded_by_name: string;
  recorded_by_role: string | null;
}

export interface CreateChargeInput {
  store_code: ChargeStore;
  category: ChargeCategory;
  amount_xof: number;
  charge_date: string;
  payment_method?: ChargePaymentMethod | null;
  note?: string | null;
  recorded_by_name: string;
  recorded_by_role?: string | null;
}

export interface UpdateChargeInput {
  store_code?: ChargeStore;
  category?: ChargeCategory;
  amount_xof?: number;
  charge_date?: string;
  payment_method?: ChargePaymentMethod | null;
  note?: string | null;
}

export interface ListChargesFilters {
  storeCode?: ChargeStore | null;
  startDate?: string;
  endDate?: string;
  category?: ChargeCategory | null;
}

/**
 * Liste les charges, filtrable par boutique / période / catégorie.
 * La RLS (voir migration 20260923) restreint déjà un compte GERANT à sa
 * propre boutique côté base — le filtre `storeCode` ici sert surtout à
 * l'usage DIRECTION (choisir une boutique précise) et au calcul du rapport
 * financier (Phase 4).
 */
export async function listCharges(filters: ListChargesFilters = {}): Promise<Charge[]> {
  let query = supabase.from('lmb_charges').select('*').order('charge_date', { ascending: false });

  if (filters.storeCode) query = query.eq('store_code', filters.storeCode);
  if (filters.category) query = query.eq('category', filters.category);
  if (filters.startDate) query = query.gte('charge_date', filters.startDate);
  if (filters.endDate) query = query.lte('charge_date', filters.endDate);

  const { data, error } = await query;
  if (error) {
    throw new Error(`Lecture des charges impossible : ${error.message}`);
  }
  return (data ?? []) as Charge[];
}

export async function createCharge(input: CreateChargeInput): Promise<Charge> {
  if (!input.store_code) {
    throw new Error('Boutique manquante : une charge doit toujours être rattachée à Dakar ou Abidjan.');
  }
  if (!input.amount_xof || input.amount_xof <= 0) {
    throw new Error('Montant invalide : le montant de la charge doit être supérieur à 0.');
  }

  const payload = sanitizeForSupabase({
    store_code: input.store_code,
    category: input.category,
    amount_xof: input.amount_xof,
    charge_date: input.charge_date,
    payment_method: input.payment_method ?? null,
    note: input.note ?? null,
    recorded_by_name: input.recorded_by_name,
    recorded_by_role: input.recorded_by_role ?? null,
  });

  const { data, error } = await supabase.from('lmb_charges').insert([payload]).select().single();
  if (error) {
    throw new Error(`Charge NON enregistrée : ${error.message}. Vérifiez la connexion et réessayez.`);
  }
  if (!data) {
    throw new Error('Charge NON enregistrée : aucune ligne renvoyée par la base.');
  }
  return data as Charge;
}

export async function updateCharge(id: string, input: UpdateChargeInput): Promise<Charge> {
  if (!id) {
    throw new Error('Identifiant de charge manquant.');
  }
  if (input.amount_xof !== undefined && input.amount_xof <= 0) {
    throw new Error('Montant invalide : le montant de la charge doit être supérieur à 0.');
  }

  const payload = sanitizeForSupabase({ ...input });

  const { data, error } = await supabase.from('lmb_charges').update(payload).eq('id', id).select().single();
  if (error) {
    throw new Error(`Modification NON enregistrée : ${error.message}. Vérifiez la connexion et réessayez.`);
  }
  if (!data) {
    throw new Error('Modification NON enregistrée : aucune ligne renvoyée par la base (charge introuvable ou accès refusé).');
  }
  return data as Charge;
}

export async function deleteCharge(id: string): Promise<void> {
  if (!id) {
    throw new Error('Identifiant de charge manquant.');
  }
  const { error } = await supabase.from('lmb_charges').delete().eq('id', id);
  if (error) {
    throw new Error(`Suppression impossible : ${error.message}`);
  }
}

/**
 * Total des charges d'exploitation sur une période, pour une boutique donnée
 * (ou toutes les boutiques si `storeCode` est null/absent). Utilisé par
 * Finance & Reporting (Phase 4) pour la ligne « Charges d'exploitation » du
 * bénéfice théorique — même principe que `getFinancialOverview` dans
 * lib/services/finance.ts, qui reçoit déjà startDate/endDate/storeFilter.
 */
export async function getTotalCharges(
  startDate: string,
  endDate: string,
  storeCode?: ChargeStore | null,
): Promise<number> {
  const charges = await listCharges({ startDate, endDate, storeCode: storeCode ?? null });
  return charges.reduce((sum, charge) => sum + Number(charge.amount_xof ?? 0), 0);
}
