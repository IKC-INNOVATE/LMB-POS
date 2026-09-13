import { supabase } from '@/lib/supabase';

// =====================================================================
// Registre des prestataires — Phase D.2.4 (voir roadmap-module-paie-prestataires.md)
// Suivi simple, sans gestion de contrat pour l'instant (décision actée).
// =====================================================================

export type ServiceProviderFrequency = 'MENSUEL' | 'HEBDOMADAIRE' | 'PONCTUEL' | 'AUTRE';

export interface ServiceProvider {
  id: string;
  full_name: string;
  service_description: string | null;
  usual_amount_xof: number | null;
  frequency: ServiceProviderFrequency;
  is_active: boolean;
  created_at: string;
}

export interface CreateServiceProviderInput {
  full_name: string;
  service_description?: string | null;
  usual_amount_xof?: number | null;
  frequency?: ServiceProviderFrequency;
}

export interface ServiceProviderPayment {
  id: string;
  provider_id: string;
  amount_xof: number;
  payment_date: string;
  note: string | null;
  created_at: string;
}

export async function listServiceProviders(): Promise<ServiceProvider[]> {
  const { data, error } = await supabase
    .from('lmb_service_providers')
    .select('*')
    .order('full_name', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as ServiceProvider[];
}

export async function createServiceProvider(input: CreateServiceProviderInput): Promise<ServiceProvider> {
  const { data, error } = await supabase
    .from('lmb_service_providers')
    .insert([
      {
        full_name: input.full_name,
        service_description: input.service_description ?? null,
        usual_amount_xof: input.usual_amount_xof ?? null,
        frequency: input.frequency ?? 'PONCTUEL',
      },
    ])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as ServiceProvider;
}

export async function updateServiceProvider(
  id: string,
  patch: Partial<CreateServiceProviderInput> & { is_active?: boolean },
): Promise<ServiceProvider> {
  const { data, error } = await supabase
    .from('lmb_service_providers')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as ServiceProvider;
}

export async function recordProviderPayment(
  providerId: string,
  amountXof: number,
  paymentDate: string,
  note?: string | null,
): Promise<ServiceProviderPayment> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('lmb_service_provider_payments')
    .insert([
      {
        provider_id: providerId,
        amount_xof: amountXof,
        payment_date: paymentDate,
        note: note ?? null,
        created_by: user?.id ?? null,
      },
    ])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as ServiceProviderPayment;
}

export async function listProviderPayments(providerId: string): Promise<ServiceProviderPayment[]> {
  const { data, error } = await supabase
    .from('lmb_service_provider_payments')
    .select('*')
    .eq('provider_id', providerId)
    .order('payment_date', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as ServiceProviderPayment[];
}
