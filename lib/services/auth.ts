import { supabase } from '@/lib/supabase';
import type { Session, User } from '@supabase/supabase-js';

export type StaffRole = 'CAISSIER' | 'GERANT' | 'DIRECTION';

export interface StaffProfile {
  id: string;
  full_name: string;
  role: StaffRole;
  /** Boutique assignée. NULL pour la DIRECTION qui supervise les deux. */
  store_code: string | null;
  is_active: boolean;
  created_at?: string;
}

export interface CurrentStaff {
  session: Session;
  user: User;
  staff: StaffProfile;
}

/** Connexion email + mot de passe via Supabase Auth. */
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw error;
  return data;
}

/** Déconnexion : supprime la session Supabase Auth locale. */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Jeton d'accès (JWT) de la session courante, à envoyer en
 * `Authorization: Bearer <token>` vers nos routes API serveur (ex: /api/staff),
 * qui le revalident côté serveur avant toute action sensible.
 */
export async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('Session expirée. Reconnectez-vous.');
  return session.access_token;
}

/**
 * Retourne la session Supabase Auth ET la ligne lmb_staff correspondante
 * (nom, rôle, boutique). Retourne null si personne n'est connecté, si aucune
 * ligne lmb_staff n'existe pour ce compte, ou si le compte est désactivé.
 */
export async function getCurrentStaff(): Promise<CurrentStaff | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return null;

  const { data: staff, error } = await supabase
    .from('lmb_staff')
    .select('id, full_name, role, store_code, is_active, created_at')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error) {
    console.warn('getCurrentStaff: lecture lmb_staff impossible', error);
    return null;
  }

  if (!staff || staff.is_active === false) return null;

  return { session, user: session.user, staff: staff as StaffProfile };
}

/**
 * Sections de /admin réservées à la DIRECTION seule : GERANT et CAISSIER y sont
 * redirigés. Le Registre RH (création de comptes employé, pointages, heures) et
 * les Comptes Marchands (soldes Wave/OM, retraits, réconciliation) et le statut
 * Vidéosurveillance (suivi internet Dakar / capacité API caméra) en font partie.
 */
export const DIRECTION_ONLY_ADMIN_PATHS = ['/admin/hr', '/admin/merchant-accounts', '/admin/surveillance', '/admin/service-providers'];

/**
 * Liste blanche des sections /admin autorisées pour un CAISSIER. Vide par
 * défaut : dans le fonctionnement actuel de l'application, un CAISSIER n'a
 * besoin d'aucune section /admin (tout son usage se fait depuis la caisse,
 * /). Toute nouvelle section admin créée plus tard sera donc bloquée pour ce
 * rôle tant qu'elle n'est pas explicitement ajoutée ici, au lieu d'être
 * accessible par oubli — voir Tâche C.1 de roadmap-audit2-securite-roles.md
 * (remplace l'ancienne liste noire CASHIER_FORBIDDEN_ADMIN_PATHS, qui ne
 * couvrait que 2 chemins sur les 12 sections existantes).
 */
export const CAISSIER_ALLOWED_ADMIN_PATHS: string[] = [];

export function isPathForbiddenForRole(role: StaffRole, pathname: string): boolean {
  const matches = (p: string) => pathname === p || pathname.startsWith(p + '/');
  const isAdminPath = pathname === '/admin' || pathname.startsWith('/admin/');

  if (role === 'DIRECTION') return false;

  // DIRECTION uniquement : GERANT et CAISSIER sont refusés.
  if (DIRECTION_ONLY_ADMIN_PATHS.some(matches)) return true;

  if (role === 'GERANT') return false;

  // CAISSIER : liste blanche. Tout /admin/* non explicitement autorisé est refusé.
  if (isAdminPath) return !CAISSIER_ALLOWED_ADMIN_PATHS.some(matches);

  return false;
}
