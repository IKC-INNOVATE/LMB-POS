import { supabase } from '@/lib/supabase';

// =====================================================================
// Module Paie — Phase D.2 (voir roadmap-module-paie-prestataires.md)
//
// ⚠️ SIMPLIFICATIONS ASSUMÉES, À CONFIRMER AVEC UN COMPTABLE AVANT USAGE
// OFFICIEL (déclaration réelle IPRES/CSS/DGID) :
//   1. L'assiette de cotisation (IPRES et CSS) est le salaire brut total
//      (base + sursalaire + prime de transport + primes diverses). En
//      pratique, la prime de transport bénéficie parfois d'une exonération
//      partielle — non appliquée ici par prudence (on préfère sur-estimer
//      les cotisations plutôt que les sous-estimer par erreur).
//   2. L'IR est calculé sur (brut − IPRES salarié), méthode du quotient
//      familial : revenu ÷ parts, barème annuel appliqué au montant annualisé
//      par part, résultat multiplié par les parts puis ramené au mois.
//   3. Le plafond IPRES n'est appliqué que s'il est renseigné dans
//      lmb_payroll_settings.ipres_ceiling_xof (NULL = pas de plafond).
// Toutes ces règles sont regroupées dans computePayslip() pour rester
// faciles à corriger si un comptable identifie un écart.
// =====================================================================

export interface IrBracket {
  from: number;
  to: number | null;
  rate: number;
}

export interface PayrollSettings {
  id: string;
  ipres_employee_rate: number;
  ipres_employer_rate: number;
  ipres_ceiling_xof: number | null;
  css_employer_rate: number;
  ir_bareme: IrBracket[];
  effective_from: string;
}

export interface OtherPrime {
  label: string;
  amount_xof: number;
}

export interface PayrollEmployee {
  id: string;
  staff_id: string | null;
  full_name: string;
  contract_type: 'CDD' | 'CDI';
  contract_start_date: string;
  contract_end_date: string | null;
  base_salary_xof: number;
  sursalaire_xof: number;
  prime_transport_xof: number;
  other_primes: OtherPrime[];
  family_parts: number;
  is_active: boolean;
}

export interface CreatePayrollEmployeeInput {
  staff_id?: string | null;
  full_name: string;
  contract_type: 'CDD' | 'CDI';
  contract_start_date: string;
  contract_end_date?: string | null;
  base_salary_xof: number;
  sursalaire_xof?: number;
  prime_transport_xof?: number;
  other_primes?: OtherPrime[];
  family_parts?: number;
}

export interface PayslipBreakdown {
  grossSalaryXof: number;
  ipresBaseXof: number;
  ipresEmployeeXof: number;
  ipresEmployerXof: number;
  cssEmployerXof: number;
  irXof: number;
  netSalaryXof: number;
  /** Instantané des taux/paramètres utilisés pour ce calcul (traçabilité). */
  settingsSnapshot: PayrollSettings;
  /** Rappel des règles simplificatrices appliquées (voir en-tête du fichier). */
  assumptions: string[];
}

export interface Payslip {
  id: string;
  employee_id: string;
  period_month: string;
  gross_salary_xof: number;
  ipres_employee_xof: number;
  ipres_employer_xof: number;
  css_employer_xof: number;
  ir_xof: number;
  net_salary_xof: number;
  computed_breakdown: PayslipBreakdown;
  generated_at: string;
}

export interface SocialContributionPayment {
  id: string;
  quarter_label: string;
  period_start: string;
  period_end: string;
  amount_due_xof: number;
  amount_paid_xof: number | null;
  due_date: string;
  paid_date: string | null;
  status: 'DUE' | 'PAID' | 'LATE';
  note: string | null;
}

const ASSUMPTIONS = [
  "Assiette de cotisation = salaire brut total (prime de transport incluse, sans exonération partielle).",
  "IR calculé sur (brut - IPRES salarié), méthode du quotient familial.",
  "Plafond IPRES appliqué uniquement si renseigné dans les paramètres de paie.",
];

// ---------------------------------------------------------------------
// PARAMÈTRES DE PAIE
// ---------------------------------------------------------------------

export async function getPayrollSettings(): Promise<PayrollSettings> {
  const { data, error } = await supabase
    .from('lmb_payroll_settings')
    .select('id, ipres_employee_rate, ipres_employer_rate, ipres_ceiling_xof, css_employer_rate, ir_bareme, effective_from')
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Aucun paramètre de paie configuré (lmb_payroll_settings vide).");
  return data as PayrollSettings;
}

export async function updatePayrollSettings(
  id: string,
  patch: Partial<Pick<PayrollSettings, 'ipres_employee_rate' | 'ipres_employer_rate' | 'ipres_ceiling_xof' | 'css_employer_rate' | 'ir_bareme'>>,
): Promise<PayrollSettings> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('lmb_payroll_settings')
    .update({ ...patch, updated_by: user?.id ?? null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as PayrollSettings;
}

// ---------------------------------------------------------------------
// SALARIÉS EN PAIE
// ---------------------------------------------------------------------

export async function listPayrollEmployees(): Promise<PayrollEmployee[]> {
  const { data, error } = await supabase
    .from('lmb_payroll_employees')
    .select('*')
    .order('full_name', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as PayrollEmployee[];
}

export async function createPayrollEmployee(input: CreatePayrollEmployeeInput): Promise<PayrollEmployee> {
  const { data, error } = await supabase
    .from('lmb_payroll_employees')
    .insert([
      {
        staff_id: input.staff_id ?? null,
        full_name: input.full_name,
        contract_type: input.contract_type,
        contract_start_date: input.contract_start_date,
        contract_end_date: input.contract_end_date ?? null,
        base_salary_xof: input.base_salary_xof,
        sursalaire_xof: input.sursalaire_xof ?? 0,
        prime_transport_xof: input.prime_transport_xof ?? 0,
        other_primes: input.other_primes ?? [],
        family_parts: input.family_parts ?? 1,
      },
    ])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as PayrollEmployee;
}

export async function updatePayrollEmployee(
  id: string,
  patch: Partial<CreatePayrollEmployeeInput> & { is_active?: boolean },
): Promise<PayrollEmployee> {
  const { data, error } = await supabase
    .from('lmb_payroll_employees')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as PayrollEmployee;
}

// ---------------------------------------------------------------------
// CALCUL DU BULLETIN (fonction pure — aucun appel réseau, testable seule)
// ---------------------------------------------------------------------

/** Impôt annuel selon un barème progressif par tranches. */
export function computeProgressiveTax(annualAmountXof: number, brackets: IrBracket[]): number {
  let tax = 0;
  for (const b of brackets) {
    if (annualAmountXof <= b.from) continue;
    const upper = b.to ?? Infinity;
    const taxableInBracket = Math.min(annualAmountXof, upper) - b.from;
    if (taxableInBracket > 0) tax += taxableInBracket * b.rate;
  }
  return Math.max(0, Math.round(tax));
}

export function computePayslip(employee: PayrollEmployee, settings: PayrollSettings): PayslipBreakdown {
  const otherPrimesTotal = (employee.other_primes ?? []).reduce((sum, p) => sum + (Number(p.amount_xof) || 0), 0);
  const grossSalaryXof =
    Number(employee.base_salary_xof || 0) +
    Number(employee.sursalaire_xof || 0) +
    Number(employee.prime_transport_xof || 0) +
    otherPrimesTotal;

  const ipresBaseXof =
    settings.ipres_ceiling_xof != null ? Math.min(grossSalaryXof, settings.ipres_ceiling_xof) : grossSalaryXof;

  const ipresEmployeeXof = Math.round(ipresBaseXof * settings.ipres_employee_rate);
  const ipresEmployerXof = Math.round(ipresBaseXof * settings.ipres_employer_rate);
  const cssEmployerXof = Math.round(grossSalaryXof * settings.css_employer_rate);

  const familyParts = employee.family_parts > 0 ? employee.family_parts : 1;
  const monthlyTaxableXof = Math.max(0, grossSalaryXof - ipresEmployeeXof);
  const annualPerPartXof = (monthlyTaxableXof / familyParts) * 12;
  const annualTaxPerPart = computeProgressiveTax(annualPerPartXof, settings.ir_bareme);
  const annualTaxTotal = annualTaxPerPart * familyParts;
  const irXof = Math.round(annualTaxTotal / 12);

  const netSalaryXof = grossSalaryXof - ipresEmployeeXof - irXof;

  return {
    grossSalaryXof,
    ipresBaseXof,
    ipresEmployeeXof,
    ipresEmployerXof,
    cssEmployerXof,
    irXof,
    netSalaryXof,
    settingsSnapshot: settings,
    assumptions: ASSUMPTIONS,
  };
}

// ---------------------------------------------------------------------
// BULLETINS GÉNÉRÉS
// ---------------------------------------------------------------------

/** `periodMonth` au format 'YYYY-MM-01'. */
export async function generatePayslip(employeeId: string, periodMonth: string): Promise<Payslip> {
  const [{ data: employee, error: empError }, settings] = await Promise.all([
    supabase.from('lmb_payroll_employees').select('*').eq('id', employeeId).single(),
    getPayrollSettings(),
  ]);

  if (empError) throw new Error(empError.message);
  if (!employee) throw new Error('Salarié introuvable.');

  const breakdown = computePayslip(employee as PayrollEmployee, settings);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('lmb_payslips')
    .insert([
      {
        employee_id: employeeId,
        period_month: periodMonth,
        gross_salary_xof: breakdown.grossSalaryXof,
        ipres_employee_xof: breakdown.ipresEmployeeXof,
        ipres_employer_xof: breakdown.ipresEmployerXof,
        css_employer_xof: breakdown.cssEmployerXof,
        ir_xof: breakdown.irXof,
        net_salary_xof: breakdown.netSalaryXof,
        computed_breakdown: breakdown,
        generated_by: user?.id ?? null,
      },
    ])
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error(`Un bulletin existe déjà pour ce salarié sur la période ${periodMonth}.`);
    }
    throw new Error(error.message);
  }
  return data as Payslip;
}

export async function listPayslips(employeeId: string): Promise<Payslip[]> {
  const { data, error } = await supabase
    .from('lmb_payslips')
    .select('*')
    .eq('employee_id', employeeId)
    .order('period_month', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as Payslip[];
}

// ---------------------------------------------------------------------
// VERSEMENTS TRIMESTRIELS DE COTISATIONS
// ---------------------------------------------------------------------

export async function listContributionPayments(): Promise<SocialContributionPayment[]> {
  const { data, error } = await supabase
    .from('lmb_social_contribution_payments')
    .select('*')
    .order('period_start', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as SocialContributionPayment[];
}

export async function recordContributionPayment(
  id: string,
  amountPaidXof: number,
  paidDate: string,
): Promise<SocialContributionPayment> {
  const { data, error } = await supabase
    .from('lmb_social_contribution_payments')
    .update({ amount_paid_xof: amountPaidXof, paid_date: paidDate, status: 'PAID' })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as SocialContributionPayment;
}
