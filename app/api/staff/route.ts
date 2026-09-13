// app/api/staff/route.ts
//
// Création de comptes employé (lmb_staff + compte Supabase Auth associé).
//
// SÉCURITÉ
// --------
// - La clé service_role n'est instanciée QUE dans ce fichier serveur (jamais
//   exposée au navigateur, jamais préfixée NEXT_PUBLIC_). lib/supabase.ts
//   (client anon partagé) n'est pas touché.
// - L'appelant doit fournir `Authorization: Bearer <access_token>` (jeton de sa
//   session Supabase Auth). Le jeton est revalidé ici via adminClient.auth.getUser.
// - Seul un employé lmb_staff avec role='DIRECTION' ET is_active=true peut créer
//   un compte.
// - Création atomique : si l'insert lmb_staff échoue après la création du compte
//   Auth, on supprime le compte Auth (pas d'orphelin).
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isRateLimited, clientIpFromRequest } from '@/lib/security/rate-limit';

const RATE_LIMIT_MAX_REQUESTS = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

export const runtime = 'nodejs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const ROLES = ['CAISSIER', 'GERANT', 'DIRECTION'] as const;
type Role = (typeof ROLES)[number];
const STORE_CODES = ['DAKAR', 'ABIDJAN'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}

export async function POST(request: Request) {
  const rateLimitKey = `staff-create:${clientIpFromRequest(request)}`;
  if (isRateLimited(rateLimitKey, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS)) {
    return NextResponse.json(
      { error: 'Trop de requêtes. Réessayez dans une minute.' },
      { status: 429 },
    );
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('/api/staff : SUPABASE_SERVICE_ROLE_KEY ou URL non configurée.');
    return NextResponse.json(
      { error: 'Configuration serveur incomplète (clé service manquante).' },
      { status: 500 },
    );
  }

  const admin = adminClient();

  // --- 1. Authentifier l'appelant ---
  const token = bearerToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Jeton de session manquant.' }, { status: 401 });
  }

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: 'Session invalide ou expirée.' }, { status: 401 });
  }

  // --- 2. Vérifier que l'appelant est DIRECTION active ---
  const { data: callerStaff, error: callerErr } = await admin
    .from('lmb_staff')
    .select('role, is_active')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (callerErr) {
    console.error('/api/staff : lecture lmb_staff appelant impossible', callerErr);
    return NextResponse.json({ error: 'Vérification des droits impossible.' }, { status: 500 });
  }
  if (!callerStaff || callerStaff.is_active !== true || callerStaff.role !== 'DIRECTION') {
    return NextResponse.json(
      { error: 'Accès refusé : seule la DIRECTION peut créer un compte employé.' },
      { status: 403 },
    );
  }

  // --- 3. Valider le corps ---
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corps de requête illisible.' }, { status: 400 });
  }

  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const fullName = String(body.full_name ?? '').trim();
  const role = String(body.role ?? '').trim().toUpperCase() as Role;
  const rawStoreCode = body.store_code == null ? null : String(body.store_code).trim().toUpperCase();

  if (!fullName) {
    return NextResponse.json({ error: 'Le nom complet est obligatoire.' }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Adresse email invalide.' }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.` },
      { status: 400 },
    );
  }
  if (!ROLES.includes(role)) {
    return NextResponse.json(
      { error: `Rôle invalide. Valeurs acceptées : ${ROLES.join(', ')}.` },
      { status: 400 },
    );
  }

  // La table lmb_staff porte DEUX colonnes de boutique (doublon legacy, même
  // format ville-en-majuscules) :
  //   - store_code : nullable, c'est celle que TOUT le code applicatif lit ;
  //                  NULL = DIRECTION (supervise les deux boutiques).
  //   - store_city : ancienne colonne, NOT NULL sans défaut, lue par personne ;
  //                  on doit quand même lui donner une valeur.
  // Règle : caissier/gérant -> les deux = DAKAR|ABIDJAN ; DIRECTION -> store_code
  //         NULL et store_city = 'DAKAR' (siège, juste pour la contrainte).
  let storeCode: string | null;
  let storeCity: string;
  if (role === 'DIRECTION') {
    storeCode = null;
    storeCity = 'DAKAR';
  } else {
    if (!rawStoreCode || !STORE_CODES.includes(rawStoreCode)) {
      return NextResponse.json(
        { error: 'Boutique obligatoire (DAKAR ou ABIDJAN) pour un CAISSIER ou un GERANT.' },
        { status: 400 },
      );
    }
    storeCode = rawStoreCode;
    storeCity = rawStoreCode;
  }

  // --- 4. Créer le compte Auth ---
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createErr || !created?.user) {
    const msg = createErr?.message ?? 'Création du compte Auth impossible.';
    const status = /already been registered|already exists/i.test(msg) ? 409 : 400;
    return NextResponse.json({ error: msg }, { status });
  }

  const newUserId = created.user.id;

  // --- 5. Insérer la ligne lmb_staff — rollback du compte Auth si échec ---
  const { data: staffRow, error: insertErr } = await admin
    .from('lmb_staff')
    .insert({
      id: newUserId,
      full_name: fullName,
      role,
      store_code: storeCode,
      store_city: storeCity,
      email,
      is_active: true,
    })
    .select('id, full_name, role, store_code, is_active, created_at')
    .single();

  if (insertErr || !staffRow) {
    // Rollback : ne pas laisser de compte Auth orphelin.
    const { error: rollbackErr } = await admin.auth.admin.deleteUser(newUserId);
    if (rollbackErr) {
      console.error(
        `/api/staff : insert lmb_staff échoué ET rollback du compte Auth ${newUserId} échoué`,
        rollbackErr,
      );
      return NextResponse.json(
        {
          error:
            "Enregistrement de l'employé impossible et le compte de connexion n'a pas pu être annulé automatiquement. Contactez l'administrateur (compte Auth " +
            newUserId +
            ').',
        },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: `Enregistrement de l'employé impossible : ${insertErr?.message ?? 'erreur inconnue'}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ staff: staffRow }, { status: 201 });
}
