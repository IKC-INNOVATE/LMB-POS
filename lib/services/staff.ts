import { supabase } from '@/lib/supabase';
import { getAccessToken, type StaffProfile, type StaffRole } from '@/lib/services/auth';

// =====================================================================
// Employés (lmb_staff) — LECTURE + toggle actif/inactif via client anon
// (session DIRECTION : policy `direction_full_access`).
// La CRÉATION passe par /api/staff (route serveur, clé service_role).
// =====================================================================

export interface CreateStaffInput {
  full_name: string;
  email: string;
  password: string;
  role: StaffRole;
  /** DAKAR | ABIDJAN ; ignoré (forcé NULL) si role = DIRECTION. */
  store_code: string | null;
}

/** Annuaire complet, trié DIRECTION → GERANT → CAISSIER puis nom. */
export async function listStaff(): Promise<StaffProfile[]> {
  const { data, error } = await supabase
    .from('lmb_staff')
    .select('id, full_name, role, store_code, is_active, created_at')
    .order('full_name', { ascending: true });

  if (error) throw new Error(error.message);

  const rank: Record<string, number> = { DIRECTION: 0, GERANT: 1, CAISSIER: 2 };
  return (data ?? []).slice().sort((a, b) => {
    const ra = rank[a.role] ?? 9;
    const rb = rank[b.role] ?? 9;
    if (ra !== rb) return ra - rb;
    return (a.full_name ?? '').localeCompare(b.full_name ?? '');
  }) as StaffProfile[];
}

/** Active / désactive un compte. L'erreur Supabase est propagée (pas de silence). */
export async function setStaffActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from('lmb_staff')
    .update({ is_active: isActive })
    .eq('id', id);

  if (error) throw new Error(error.message);
}

/**
 * Crée un compte employé via la route serveur sécurisée.
 * Renvoie la ligne lmb_staff créée, ou lève une erreur avec le message serveur.
 */
export async function createStaffAccount(input: CreateStaffInput): Promise<StaffProfile> {
  const token = await getAccessToken();

  const res = await fetch('/api/staff', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });

  let payload: any = null;
  try {
    payload = await res.json();
  } catch {
    // réponse sans corps JSON
  }

  if (!res.ok) {
    throw new Error(payload?.error ?? `Création impossible (HTTP ${res.status}).`);
  }
  return payload.staff as StaffProfile;
}
