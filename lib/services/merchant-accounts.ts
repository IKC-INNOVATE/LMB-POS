import { supabase } from '@/lib/supabase';
import { parseJson, parseNumber, type RawRecord } from '@/lib/services/cost';

// =====================================================================
// Comptes Marchands (Wave / Orange Money) — LECTURE + saisie manuelle.
//
// Aucune API opérateur : la Direction saisit à la main les soldes de compte
// marchand (lmb_merchant_balance_snapshots, historisé) et les retraits vers la
// banque (lmb_merchant_withdrawals). Le volet 3 (réconciliation) confronte ces
// saisies au total réel des ventes encaissées en Wave / OM d'après lmb_sales.
//
// La correspondance ventes -> plateforme passe TOUJOURS par
// classifyPaymentMethod() (mots-clés, jamais d'égalité stricte), parce que la
// base contient plusieurs générations de codes (WAVE, WAVE_SN, ORANGE_MONEY_CI,
// 'LIVRAISON: WAVE_SN'...) et des lignes annulées où payment_method a été écrasé
// par un texte descriptif ('ANNULÉ / REMBOURSÉ (...)').
// =====================================================================

export type MerchantPlatform = 'WAVE' | 'OM';
export const MERCHANT_PLATFORMS: MerchantPlatform[] = ['WAVE', 'OM'];

export const PLATFORM_LABEL: Record<MerchantPlatform, string> = {
  WAVE: 'Wave',
  OM: 'Orange Money',
};

export type StoreCode = 'DAKAR' | 'ABIDJAN';
export const MERCHANT_STORES: StoreCode[] = ['DAKAR', 'ABIDJAN'];

/** Écart toléré (FCFA) avant de signaler une anomalie de réconciliation. */
export const RECONCILIATION_TOLERANCE_XOF = 0;

/** upper(trim()) défensif -> 'DAKAR' | 'ABIDJAN' | null. */
export const normalizeStoreCode = (value: unknown): StoreCode | null => {
  const v = String(value ?? '').trim().toUpperCase();
  return v === 'DAKAR' || v === 'ABIDJAN' ? v : null;
};

// ---------------------------------------------------------------------
// Classification d'un mode de paiement brut (lmb_sales.payment_method
// ou un label de jambe de paiement mixte).
//
// Ordre VOLONTAIRE : les exclusions (VOID / CASH / CARD) passent AVANT la
// détection Wave / OM pour éviter qu'un futur libellé du type
// « REMBOURSÉ VIA WAVE » soit compté comme une entrée Wave.
// ---------------------------------------------------------------------
export type PaymentClass = 'WAVE' | 'OM' | 'CASH' | 'CARD' | 'VOID' | 'SPLIT' | 'OTHER' | 'IGNORE';

export function classifyPaymentMethod(raw: unknown): PaymentClass {
  const s = String(raw ?? '').trim().toUpperCase();
  if (s === '') return 'IGNORE';

  // 1. Exclusions explicites.
  if (s.includes('ANNUL') || s.includes('REMBOURS')) return 'VOID';
  if (s.includes('ESPECE') || s.includes('ESPÈCE') || s.includes('CASH')) return 'CASH';
  if (s.includes('CARTE') || s === 'CB' || s.includes('BANCAIRE')) return 'CARD';

  // 2. Plateformes mobiles — sous-chaîne, couvre toutes les variantes connues
  //    (WAVE, WAVE_SN, WAVE_CI, 'LIVRAISON: WAVE_SN', 'Wave / Mobile'...).
  if (s.includes('WAVE')) return 'WAVE';
  //    OM, ORANGE_MONEY_SN, ORANGE_MONEY_CI, 'ORANGE MONEY'. Le \bOM\b évite les
  //    faux positifs (aucun autre code métier ne contient 'OM' isolé).
  if (s.includes('ORANGE') || /(^|[^A-Z])OM([^A-Z]|$)/.test(s)) return 'OM';

  // 3. Paiement mixte — à éclater via metadata.payment_details.
  if (s === 'SPLIT' || s.includes('MIXTE')) return 'SPLIT';

  // 4. Tout le reste (MTN_MOMO_CI, MOOV_MONEY_CI, valeur inconnue...).
  return 'OTHER';
}

// =====================================================================
// VOLET 1 — Soldes (relevés historisés)
// =====================================================================

export interface BalanceSnapshot {
  id: string;
  store_code: string;
  platform: MerchantPlatform;
  balance_xof: number;
  observed_at: string; // 'yyyy-mm-dd'
  recorded_by: string;
  note: string | null;
  created_at: string;
}

export interface CurrentBalance {
  store: StoreCode;
  platform: MerchantPlatform;
  /** null tant qu'aucun relevé n'a été saisi pour ce couple. */
  snapshot: BalanceSnapshot | null;
}

const mapSnapshot = (row: RawRecord): BalanceSnapshot => ({
  id: String(row.id),
  store_code: String(row.store_code ?? ''),
  platform: (row.platform === 'OM' ? 'OM' : 'WAVE') as MerchantPlatform,
  balance_xof: parseNumber(row.balance_xof),
  observed_at: String(row.observed_at ?? '').slice(0, 10),
  recorded_by: String(row.recorded_by ?? ''),
  note: (row.note as string | null | undefined) ?? null,
  created_at: String(row.created_at ?? ''),
});

/** Relevés, du plus récent au plus ancien. Filtre boutique optionnel. */
export async function listBalanceSnapshots(store?: StoreCode | null): Promise<BalanceSnapshot[]> {
  let query = supabase
    .from('lmb_merchant_balance_snapshots')
    .select('*')
    .order('observed_at', { ascending: false })
    .order('created_at', { ascending: false });

  if (store) query = query.eq('store_code', store);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapSnapshot);
}

/**
 * Solde actuel = dernier relevé (observed_at, puis created_at) pour chaque
 * couple boutique x plateforme. Renvoie toujours les 4 couples (snapshot null
 * si rien n'a été saisi).
 */
export async function getCurrentBalances(): Promise<CurrentBalance[]> {
  const all = await listBalanceSnapshots();

  const result: CurrentBalance[] = [];
  for (const store of MERCHANT_STORES) {
    for (const platform of MERCHANT_PLATFORMS) {
      const latest = all.find(
        (s) => normalizeStoreCode(s.store_code) === store && s.platform === platform,
      );
      result.push({ store, platform, snapshot: latest ?? null });
    }
  }
  return result;
}

export interface RecordBalanceInput {
  store_code: string;
  platform: MerchantPlatform;
  balance_xof: number;
  observed_at: string; // 'yyyy-mm-dd'
  recorded_by: string;
  note?: string | null;
}

export async function recordBalanceSnapshot(input: RecordBalanceInput): Promise<BalanceSnapshot> {
  const store = normalizeStoreCode(input.store_code);
  if (!store) throw new Error(`Boutique invalide ("${input.store_code}"). Attendu DAKAR ou ABIDJAN.`);
  if (input.platform !== 'WAVE' && input.platform !== 'OM') {
    throw new Error(`Plateforme invalide ("${input.platform}"). Attendu WAVE ou OM.`);
  }
  const balance = parseNumber(input.balance_xof);
  if (!(balance >= 0)) throw new Error('Le solde doit être un nombre positif ou nul.');
  if (!input.observed_at) throw new Error('La date du relevé est obligatoire.');
  if (!input.recorded_by?.trim()) throw new Error('Auteur du relevé manquant (session expirée ?).');

  const { data, error } = await supabase
    .from('lmb_merchant_balance_snapshots')
    .insert([
      {
        store_code: store,
        platform: input.platform,
        balance_xof: balance,
        observed_at: input.observed_at,
        recorded_by: input.recorded_by.trim(),
        note: input.note?.trim() || null,
      },
    ])
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return mapSnapshot(data);
}

// =====================================================================
// VOLET 2 — Retraits compte marchand -> banque
// =====================================================================

export interface MerchantWithdrawal {
  id: string;
  store_code: string;
  platform: MerchantPlatform;
  amount_xof: number;
  transfer_date: string; // 'yyyy-mm-dd'
  bank_reference: string | null;
  recorded_by: string;
  note: string | null;
  created_at: string;
}

const mapWithdrawal = (row: RawRecord): MerchantWithdrawal => ({
  id: String(row.id),
  store_code: String(row.store_code ?? ''),
  platform: (row.platform === 'OM' ? 'OM' : 'WAVE') as MerchantPlatform,
  amount_xof: parseNumber(row.amount_xof),
  transfer_date: String(row.transfer_date ?? '').slice(0, 10),
  bank_reference: (row.bank_reference as string | null | undefined) ?? null,
  recorded_by: String(row.recorded_by ?? ''),
  note: (row.note as string | null | undefined) ?? null,
  created_at: String(row.created_at ?? ''),
});

export interface WithdrawalFilters {
  store?: StoreCode | null;
  platform?: MerchantPlatform | null;
  /** 'yyyy-mm-dd' inclus. */
  from?: string | null;
  /** 'yyyy-mm-dd' inclus. */
  to?: string | null;
}

export async function listWithdrawals(filters: WithdrawalFilters = {}): Promise<MerchantWithdrawal[]> {
  let query = supabase
    .from('lmb_merchant_withdrawals')
    .select('*')
    .order('transfer_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters.store) query = query.eq('store_code', filters.store);
  if (filters.platform) query = query.eq('platform', filters.platform);
  if (filters.from) query = query.gte('transfer_date', filters.from);
  if (filters.to) query = query.lte('transfer_date', filters.to);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapWithdrawal);
}

export interface RecordWithdrawalInput {
  store_code: string;
  platform: MerchantPlatform;
  amount_xof: number;
  transfer_date: string; // 'yyyy-mm-dd'
  bank_reference?: string | null;
  recorded_by: string;
  note?: string | null;
}

export async function recordWithdrawal(input: RecordWithdrawalInput): Promise<MerchantWithdrawal> {
  const store = normalizeStoreCode(input.store_code);
  if (!store) throw new Error(`Boutique invalide ("${input.store_code}"). Attendu DAKAR ou ABIDJAN.`);
  if (input.platform !== 'WAVE' && input.platform !== 'OM') {
    throw new Error(`Plateforme invalide ("${input.platform}"). Attendu WAVE ou OM.`);
  }
  const amount = parseNumber(input.amount_xof);
  if (!(amount > 0)) throw new Error('Le montant du retrait doit être strictement positif.');
  if (!input.transfer_date) throw new Error('La date du transfert est obligatoire.');
  if (!input.recorded_by?.trim()) throw new Error('Auteur de la saisie manquant (session expirée ?).');

  const { data, error } = await supabase
    .from('lmb_merchant_withdrawals')
    .insert([
      {
        store_code: store,
        platform: input.platform,
        amount_xof: amount,
        transfer_date: input.transfer_date,
        bank_reference: input.bank_reference?.trim() || null,
        recorded_by: input.recorded_by.trim(),
        note: input.note?.trim() || null,
      },
    ])
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return mapWithdrawal(data);
}

// =====================================================================
// VOLET 3 — Réconciliation
// =====================================================================

export interface PlatformReconciliation {
  store: StoreCode;
  platform: MerchantPlatform;

  /** Ventes encaissées Wave/OM sur la période (payment_method direct). */
  directSalesXof: number;
  directSalesCount: number;
  /** Part Wave/OM extraite de ventes SPLIT via metadata.payment_details. */
  splitAttributedXof: number;
  splitAttributedCount: number;
  /** directSalesXof + splitAttributedXof. */
  salesInflowXof: number;

  /** Retraits saisis sur la période. */
  withdrawalsOutflowXof: number;
  withdrawalsCount: number;

  /** Dernier relevé <= début de période (null si aucun). */
  openingBalanceXof: number | null;
  openingBalanceDate: string | null;
  /** Dernier relevé <= fin de période (null si aucun). */
  closingBalanceXof: number | null;
  closingBalanceDate: string | null;

  /** openingBalance + salesInflow - withdrawalsOutflow (null si pas de solde d'ouverture). */
  expectedClosingXof: number | null;
  /** closingBalance - expectedClosing (null si un des deux manque). */
  varianceXof: number | null;
  /** true si varianceXof calculable et |varianceXof| > tolérance. */
  hasVariance: boolean;
  /** 'OK' | 'ANOMALIE' | 'INCOMPLET' (relevés de solde manquants). */
  status: 'OK' | 'ANOMALIE' | 'INCOMPLET';
}

export interface ReconciliationResult {
  startDate: string; // ISO
  endDate: string; // ISO
  stores: StoreCode[];
  lines: PlatformReconciliation[];

  /** Ventes SPLIT sans metadata.payment_details exploitable — JAMAIS imputées. */
  splitUnventilated: {
    count: number;
    totalXof: number;
    /** receipt_number (ou id) des ventes concernées, pour vérif manuelle. */
    receipts: string[];
  };

  /** payment_method non reconnus (ni Wave, ni OM, ni espèces/CB/annulé). */
  unrecognized: {
    count: number;
    totalXof: number;
    labels: string[];
  };

  /** Ventes annulées/remboursées exclues du calcul (pour information). */
  voided: {
    count: number;
    totalXof: number;
  };

  /** Ventes hors DAKAR/ABIDJAN (store_name inattendu) — exclues. */
  unassignedSales: {
    count: number;
    totalXof: number;
    labels: string[];
  };
}

const getSaleTotal = (sale: RawRecord): number =>
  parseNumber(sale?.total_amount_xof ?? sale?.total_amount ?? sale?.amount ?? sale?.total);

/**
 * Montant RÉELLEMENT encaissé aujourd'hui sur le canal direct (Wave/OM) de
 * cette vente. Pour une vente normale, c'est le total de la vente. Pour un
 * acompte (metadata.payment_details.isDeposit === 1), total_amount_xof porte
 * le prix TOTAL de la vente — pas la somme réellement reçue sur Wave/OM
 * aujourd'hui, qui est metadata.payment_details.paid. Sans cette distinction,
 * un acompte Wave/OM gonflerait artificiellement le total encaissé du jour du
 * montant du solde restant, qui n'a pourtant pas encore été payé.
 */
const getSaleCollectedAmount = (sale: RawRecord): number => {
  const meta = parseJson(sale?.metadata);
  const details = meta && typeof meta === 'object' ? (meta as RawRecord).payment_details : null;
  const detailsObj = details && typeof details === 'object' ? (details as RawRecord) : null;
  const isDeposit = detailsObj && Number(detailsObj.isDeposit ?? 0) === 1;
  return isDeposit ? parseNumber(detailsObj!.paid) : getSaleTotal(sale);
};

const getSaleRef = (sale: RawRecord): string =>
  String(sale?.receipt_number ?? sale?.id ?? '(sans référence)');

/**
 * Éclate le metadata.payment_details d'une vente SPLIT.
 * Shape connu (app/page.tsx) : { cash: number, [label]: number } où `label`
 * est saisi par le caissier (ex. « WAVE », « OM », « CB », « Autre »).
 * Renvoie null si la structure est inexploitable -> la vente ira dans
 * splitUnventilated (jamais imputée à une plateforme).
 */
// Clés d'information sur un acompte (voir app/page.tsx) qui peuvent cohabiter
// dans le même payment_details qu'une ventilation de paiement mixte — ce ne
// sont PAS des jambes de paiement supplémentaires et doivent être ignorées
// ici, sous peine de les voir classées comme jambes « non identifiées ».
const DEPOSIT_INFO_KEYS = new Set(['isDeposit', 'paid', 'balance']);

function splitLegs(sale: RawRecord): Array<{ cls: PaymentClass; amount: number }> | null {
  const meta = parseJson(sale?.metadata);
  const details = meta && typeof meta === 'object' ? (meta as RawRecord).payment_details : null;
  if (!details || typeof details !== 'object') return null;

  const legs: Array<{ cls: PaymentClass; amount: number }> = [];
  let sawAny = false;
  for (const [label, value] of Object.entries(details)) {
    if (DEPOSIT_INFO_KEYS.has(label)) continue;
    const amount = parseNumber(value);
    if (!(amount > 0)) continue;
    sawAny = true;
    legs.push({ cls: classifyPaymentMethod(label === 'cash' ? 'ESPECES' : label), amount });
  }
  return sawAny ? legs : null;
}

export async function getReconciliation(
  startISO: string,
  endISO: string,
  store?: StoreCode | null,
): Promise<ReconciliationResult> {
  const safeStart = new Date(startISO).toISOString();
  const safeEnd = new Date(endISO).toISOString();
  const startDay = safeStart.slice(0, 10);
  const endDay = safeEnd.slice(0, 10);
  const targetStores: StoreCode[] = store ? [store] : [...MERCHANT_STORES];

  const [salesResult, withdrawals, snapshots] = await Promise.all([
    supabase
      .from('lmb_sales')
      .select('*')
      .gte('created_at', safeStart)
      .lte('created_at', safeEnd)
      .order('created_at', { ascending: false }),
    listWithdrawals({ store: store ?? null, from: startDay, to: endDay }),
    listBalanceSnapshots(store ?? null),
  ]);

  if (salesResult.error) throw salesResult.error;
  const sales = (salesResult.data ?? []) as RawRecord[];

  // Accumulateurs par couple boutique|plateforme.
  const key = (s: StoreCode, p: MerchantPlatform) => `${s}|${p}`;
  const acc = new Map<
    string,
    {
      directSalesXof: number;
      directSalesCount: number;
      splitAttributedXof: number;
      splitAttributedCount: number;
    }
  >();
  for (const s of targetStores) {
    for (const p of MERCHANT_PLATFORMS) {
      acc.set(key(s, p), {
        directSalesXof: 0,
        directSalesCount: 0,
        splitAttributedXof: 0,
        splitAttributedCount: 0,
      });
    }
  }

  const splitUnventilated = { count: 0, totalXof: 0, receipts: [] as string[] };
  const unrecognized = { count: 0, totalXof: 0, labels: new Set<string>() };
  const voided = { count: 0, totalXof: 0 };
  const unassignedSales = { count: 0, totalXof: 0, labels: new Set<string>() };

  for (const sale of sales) {
    const total = getSaleTotal(sale);
    const cls = classifyPaymentMethod(sale.payment_method);

    if (cls === 'VOID') {
      voided.count += 1;
      voided.totalXof += total;
      continue;
    }
    if (cls === 'CASH' || cls === 'CARD' || cls === 'IGNORE') continue;

    const storeKey = normalizeStoreCode(sale.store_name);
    if (!storeKey || (store && storeKey !== store)) {
      if (!storeKey) {
        unassignedSales.count += 1;
        unassignedSales.totalXof += total;
        unassignedSales.labels.add(String(sale.store_name ?? '(vide)'));
      }
      continue;
    }

    if (cls === 'WAVE' || cls === 'OM') {
      const bucket = acc.get(key(storeKey, cls))!;
      bucket.directSalesXof += getSaleCollectedAmount(sale);
      bucket.directSalesCount += 1;
      continue;
    }

    if (cls === 'SPLIT') {
      const legs = splitLegs(sale);
      if (!legs) {
        splitUnventilated.count += 1;
        splitUnventilated.totalXof += total;
        splitUnventilated.receipts.push(getSaleRef(sale));
        continue;
      }
      let attributed = false;
      let hadUnknownLeg = false;
      for (const leg of legs) {
        if (leg.cls === 'WAVE' || leg.cls === 'OM') {
          const bucket = acc.get(key(storeKey, leg.cls))!;
          bucket.splitAttributedXof += leg.amount;
          bucket.splitAttributedCount += 1;
          attributed = true;
        } else if (leg.cls === 'OTHER' || leg.cls === 'SPLIT' || leg.cls === 'IGNORE') {
          hadUnknownLeg = true;
        }
        // CASH / CARD / VOID legs : ignorés proprement.
      }
      // Une jambe non identifiable (label ambigu) -> on trace la vente comme
      // partiellement non ventilée, sans imputer le montant douteux.
      if (hadUnknownLeg && !attributed) {
        splitUnventilated.count += 1;
        splitUnventilated.totalXof += total;
        splitUnventilated.receipts.push(getSaleRef(sale));
      }
      continue;
    }

    // cls === 'OTHER'
    unrecognized.count += 1;
    unrecognized.totalXof += total;
    unrecognized.labels.add(String(sale.payment_method ?? '(vide)'));
  }

  // Relevés de solde : dernier <= début, dernier <= fin, par couple.
  const balanceAt = (s: StoreCode, p: MerchantPlatform, dayInclusive: string) => {
    const match = snapshots.find(
      (snap) =>
        normalizeStoreCode(snap.store_code) === s &&
        snap.platform === p &&
        snap.observed_at <= dayInclusive,
    );
    return match ? { xof: match.balance_xof, date: match.observed_at } : null;
  };

  const lines: PlatformReconciliation[] = [];
  for (const s of targetStores) {
    for (const p of MERCHANT_PLATFORMS) {
      const b = acc.get(key(s, p))!;
      const salesInflowXof = b.directSalesXof + b.splitAttributedXof;

      const relevantWithdrawals = withdrawals.filter(
        (w) => normalizeStoreCode(w.store_code) === s && w.platform === p,
      );
      const withdrawalsOutflowXof = relevantWithdrawals.reduce((sum, w) => sum + w.amount_xof, 0);

      const opening = balanceAt(s, p, startDay);
      const closing = balanceAt(s, p, endDay);

      const expectedClosingXof =
        opening != null ? opening.xof + salesInflowXof - withdrawalsOutflowXof : null;
      const varianceXof =
        expectedClosingXof != null && closing != null ? closing.xof - expectedClosingXof : null;
      const hasVariance =
        varianceXof != null && Math.abs(varianceXof) > RECONCILIATION_TOLERANCE_XOF;

      const status: PlatformReconciliation['status'] =
        varianceXof == null ? 'INCOMPLET' : hasVariance ? 'ANOMALIE' : 'OK';

      lines.push({
        store: s,
        platform: p,
        directSalesXof: b.directSalesXof,
        directSalesCount: b.directSalesCount,
        splitAttributedXof: b.splitAttributedXof,
        splitAttributedCount: b.splitAttributedCount,
        salesInflowXof,
        withdrawalsOutflowXof,
        withdrawalsCount: relevantWithdrawals.length,
        openingBalanceXof: opening?.xof ?? null,
        openingBalanceDate: opening?.date ?? null,
        closingBalanceXof: closing?.xof ?? null,
        closingBalanceDate: closing?.date ?? null,
        expectedClosingXof,
        varianceXof,
        hasVariance,
        status,
      });
    }
  }

  return {
    startDate: safeStart,
    endDate: safeEnd,
    stores: targetStores,
    lines,
    splitUnventilated,
    unrecognized: {
      count: unrecognized.count,
      totalXof: unrecognized.totalXof,
      labels: [...unrecognized.labels],
    },
    voided,
    unassignedSales: {
      count: unassignedSales.count,
      totalXof: unassignedSales.totalXof,
      labels: [...unassignedSales.labels],
    },
  };
}
