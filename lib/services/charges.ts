import { supabase } from '@/lib/supabase';

// Chantier "Charges d'exploitation" (voir la feuille de route
// claude/roadmap-module-charges-exploitation-2026-09-19.md, projet LMB).
// Phase 1 : table `lmb_charges` + CRUD de base (charges ponctuelles).
// Phase 3 : `lmb_charge_templates` (migration 20260924) + génération
// "paresseuse" des charges récurrentes (ensureRecurringChargesGeneratedForMonth,
// en bas de ce fichier) — aucune tâche indépendante en arrière-plan, ce
// projet n'a pas cette infrastructure : la génération se déclenche quand
// l'écran Charges est ouvert pour un mois donné (voir app/admin/charges/page.tsx).
// La déduction dans le rapport financier arrive en Phase 4.

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
  /** NULL pour une charge ponctuelle. Renseigné si générée depuis un modèle récurrent (Phase 3). */
  template_id: string | null;
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
  /** Renseigné uniquement par ensureRecurringChargesGeneratedForMonth (Phase 3). */
  template_id?: string | null;
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
    template_id: input.template_id ?? null,
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

// =====================================================================
// Phase 3 — Charges récurrentes (modèles + génération "paresseuse")
// Migration 20260924_create_charge_templates_table.sql
// =====================================================================

export interface ChargeTemplate {
  id: string;
  created_at: string;
  store_code: ChargeStore;
  category: ChargeCategory;
  amount_xof: number;
  /** Jour du mois où la charge est générée, borné à 1–28 (valable sur tous les mois). */
  day_of_month: number;
  payment_method: ChargePaymentMethod | null;
  note: string | null;
  /** false = modèle en pause : ne génère plus de nouvelles charges, historique conservé. */
  is_active: boolean;
  created_by_name: string;
  created_by_role: string | null;
}

export interface CreateChargeTemplateInput {
  store_code: ChargeStore;
  category: ChargeCategory;
  amount_xof: number;
  day_of_month: number;
  payment_method?: ChargePaymentMethod | null;
  note?: string | null;
  created_by_name: string;
  created_by_role?: string | null;
}

export interface UpdateChargeTemplateInput {
  store_code?: ChargeStore;
  category?: ChargeCategory;
  amount_xof?: number;
  day_of_month?: number;
  payment_method?: ChargePaymentMethod | null;
  note?: string | null;
  is_active?: boolean;
}

export async function listChargeTemplates(storeCode?: ChargeStore | null): Promise<ChargeTemplate[]> {
  let query = supabase.from('lmb_charge_templates').select('*').order('created_at', { ascending: false });
  if (storeCode) query = query.eq('store_code', storeCode);

  const { data, error } = await query;
  if (error) {
    throw new Error(`Lecture des charges récurrentes impossible : ${error.message}`);
  }
  return (data ?? []) as ChargeTemplate[];
}

export async function createChargeTemplate(input: CreateChargeTemplateInput): Promise<ChargeTemplate> {
  if (!input.store_code) {
    throw new Error('Boutique manquante : un modèle récurrent doit toujours être rattaché à Dakar ou Abidjan.');
  }
  if (!input.amount_xof || input.amount_xof <= 0) {
    throw new Error('Montant invalide : le montant doit être supérieur à 0.');
  }
  if (!input.day_of_month || input.day_of_month < 1 || input.day_of_month > 28) {
    throw new Error('Jour du mois invalide : choisissez un jour entre 1 et 28 (pour rester valable sur tous les mois).');
  }

  const payload = sanitizeForSupabase({
    store_code: input.store_code,
    category: input.category,
    amount_xof: input.amount_xof,
    day_of_month: input.day_of_month,
    payment_method: input.payment_method ?? null,
    note: input.note ?? null,
    is_active: true,
    created_by_name: input.created_by_name,
    created_by_role: input.created_by_role ?? null,
  });

  const { data, error } = await supabase.from('lmb_charge_templates').insert([payload]).select().single();
  if (error) {
    throw new Error(`Modèle récurrent NON enregistré : ${error.message}. Vérifiez la connexion et réessayez.`);
  }
  if (!data) {
    throw new Error('Modèle récurrent NON enregistré : aucune ligne renvoyée par la base.');
  }
  return data as ChargeTemplate;
}

export async function updateChargeTemplate(id: string, input: UpdateChargeTemplateInput): Promise<ChargeTemplate> {
  if (!id) {
    throw new Error('Identifiant de modèle manquant.');
  }
  if (input.amount_xof !== undefined && input.amount_xof <= 0) {
    throw new Error('Montant invalide : le montant doit être supérieur à 0.');
  }
  if (input.day_of_month !== undefined && (input.day_of_month < 1 || input.day_of_month > 28)) {
    throw new Error('Jour du mois invalide : choisissez un jour entre 1 et 28.');
  }

  const payload = sanitizeForSupabase({ ...input });

  const { data, error } = await supabase.from('lmb_charge_templates').update(payload).eq('id', id).select().single();
  if (error) {
    throw new Error(`Modification NON enregistrée : ${error.message}. Vérifiez la connexion et réessayez.`);
  }
  if (!data) {
    throw new Error('Modification NON enregistrée : aucune ligne renvoyée par la base (modèle introuvable ou accès refusé).');
  }
  return data as ChargeTemplate;
}

export async function deleteChargeTemplate(id: string): Promise<void> {
  if (!id) {
    throw new Error('Identifiant de modèle manquant.');
  }
  const { error } = await supabase.from('lmb_charge_templates').delete().eq('id', id);
  if (error) {
    throw new Error(`Suppression impossible : ${error.message}`);
  }
}

const daysInMonth = (month: string): number => {
  const [year, m] = month.split('-').map(Number);
  return new Date(year, m, 0).getDate();
};

const monthBounds = (month: string) => {
  const lastDay = daysInMonth(month);
  return { startDate: `${month}-01`, endDate: `${month}-${String(lastDay).padStart(2, '0')}` };
};

/**
 * Génération "paresseuse" des charges récurrentes pour un mois donné (voir
 * la feuille de route, section "récurrence automatique") : ce projet n'a pas
 * de tâche indépendante qui tournerait seule en arrière-plan, donc au lieu
 * de générer le loyer à minuit le 1er de chaque mois, on le génère dès que
 * quelqu'un ouvre l'écran Charges pour ce mois — avec le même résultat
 * concret pour l'utilisateur (jamais de ressaisie), juste déclenché
 * différemment. Appelée par app/admin/charges/page.tsx à chaque chargement
 * de la liste, avant `listCharges`.
 *
 * Idempotente : pour chaque modèle actif, vérifie qu'aucune charge n'a déjà
 * été générée pour CE modèle sur CE mois (via `template_id`) avant d'en
 * créer une — rouvrir la page plusieurs fois dans le mois ne crée jamais de
 * doublon.
 *
 * @param storeCode boutique à traiter, ou null pour toutes les boutiques
 *   (utilisé quand la Direction filtre sur "Toutes les boutiques" — un
 *   GERANT passe toujours sa propre boutique, jamais null).
 * @returns le nombre de charges effectivement générées.
 */
export async function ensureRecurringChargesGeneratedForMonth(
  month: string,
  storeCode: ChargeStore | null,
  actor: { name: string; role: string | null },
): Promise<number> {
  const templates = await listChargeTemplates(storeCode ?? null);
  const activeTemplates = templates.filter((t) => t.is_active);
  if (activeTemplates.length === 0) return 0;

  const { startDate, endDate } = monthBounds(month);
  const existingCharges = await listCharges({ startDate, endDate, storeCode: storeCode ?? null });
  const alreadyGenerated = new Set(existingCharges.map((c) => c.template_id).filter(Boolean));

  let created = 0;
  for (const template of activeTemplates) {
    if (alreadyGenerated.has(template.id)) continue;

    const day = Math.min(template.day_of_month, daysInMonth(month));
    const chargeDate = `${month}-${String(day).padStart(2, '0')}`;

    try {
      await createCharge({
        store_code: template.store_code,
        category: template.category,
        amount_xof: template.amount_xof,
        charge_date: chargeDate,
        payment_method: template.payment_method,
        note: template.note
          ? `${template.note} (généré automatiquement depuis un modèle récurrent)`
          : 'Généré automatiquement depuis un modèle récurrent.',
        recorded_by_name: `Génération automatique (${actor.name})`,
        recorded_by_role: actor.role,
        template_id: template.id,
      });
      created++;
    } catch (err) {
      // On ne bloque pas l'affichage de l'écran si un modèle échoue à
      // générer (ex. conflit réseau passager) : on log et on continue avec
      // les autres modèles — la prochaine ouverture de l'écran réessaiera
      // celui-ci, puisqu'aucune charge n'aura été créée pour lui.
      console.warn('ensureRecurringChargesGeneratedForMonth: échec pour le modèle', template.id, err);
    }
  }
  return created;
}
