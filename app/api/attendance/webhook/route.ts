// app/api/attendance/webhook/route.ts
//
// Reçoit les pointages depuis le boîtier caméra / reconnaissance faciale.
//
// AUTH : header `Authorization: Bearer <ATTENDANCE_WEBHOOK_SECRET>` comparé à
//        temps constant. 401 immédiat sinon (tentative journalisée).
//
// ÉCRITURE : la table public.lmb_attendance est "sensible" (RLS : aucun accès
//        anon). L'insert passe donc par un client service_role, instancié
//        uniquement dans ce fichier serveur (clé jamais exposée au navigateur).
//        lib/supabase.ts (client anon partagé) n'est pas touché.
//
// COLONNES RÉELLES de lmb_attendance : cashier_name, store_city, type,
//        timestamp, camera_reference. `type` ∈ {'ARRIVEE','DEPART'} (français).
//
// DÉDUCTION ARRIVEE / DEPART (inchangée) : si l'employé a déjà au moins un
//        pointage aujourd'hui -> ce pointage est un DEPART ; sinon -> ARRIVEE.
import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { isRateLimited, clientIpFromRequest } from '@/lib/security/rate-limit';

const RATE_LIMIT_MAX_REQUESTS = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;

export const runtime = 'nodejs';

const WEBHOOK_SECRET = process.env.ATTENDANCE_WEBHOOK_SECRET ?? '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

type AttendanceType = 'ARRIVEE' | 'DEPART';

function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Comparaison à temps constant (résistante aux attaques par timing). */
function isAuthorized(authorizationHeader: string | null): boolean {
  if (!WEBHOOK_SECRET) {
    console.error('ATTENDANCE_WEBHOOK_SECRET non configuré : webhook verrouillé.');
    return false;
  }
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    return false;
  }
  const provided = authorizationHeader.slice('Bearer '.length);
  // On hache les deux valeurs => buffers de longueur fixe, pas de fuite de longueur.
  const providedHash = crypto.createHash('sha256').update(provided).digest();
  const expectedHash = crypto.createHash('sha256').update(WEBHOOK_SECRET).digest();
  return crypto.timingSafeEqual(providedHash, expectedHash);
}

function clientIp(request: Request): string | null {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return request.headers.get('x-real-ip');
}

/** 'DAKAR' | 'ABIDJAN' | null — tolérant sur la casse et les libellés type "LMB - Dakar". */
function normalizeStoreCity(raw: unknown): 'DAKAR' | 'ABIDJAN' | null {
  const v = String(raw ?? '').toUpperCase();
  if (v.includes('DAKAR')) return 'DAKAR';
  if (v.includes('ABIDJAN')) return 'ABIDJAN';
  return null;
}

async function logRefusedAttempt(request: Request) {
  let attemptedEmployeeName: string | null = null;
  try {
    const cloned = request.clone();
    const body = await cloned.json();
    if (body && typeof body.employee_name === 'string') {
      attemptedEmployeeName = body.employee_name;
    }
  } catch {
    // corps illisible / absent : on journalise quand même la tentative.
  }

  try {
    await adminClient()
      .from('lmb_attendance_webhook_log')
      .insert([
        {
          ip_address: clientIp(request),
          attempted_employee_name: attemptedEmployeeName,
          reason: 'UNAUTHORIZED',
        },
      ]);
  } catch (err) {
    console.warn('Impossible de journaliser la tentative refusée:', err);
  }
}

export async function POST(request: Request) {
  // --- Limite de fréquence AVANT toute autre vérification ---
  const rateLimitKey = `attendance-webhook:${clientIpFromRequest(request)}`;
  if (isRateLimited(rateLimitKey, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS)) {
    return NextResponse.json(
      { error: 'Trop de requêtes. Réessayez dans une minute.' },
      { status: 429 },
    );
  }

  // --- Authentification AVANT toute lecture du corps ---
  if (!isAuthorized(request.headers.get('authorization'))) {
    await logRefusedAttempt(request);
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('Webhook pointage : SUPABASE_SERVICE_ROLE_KEY ou URL non configurée.');
    return NextResponse.json(
      { error: 'Configuration serveur incomplète (clé service manquante).' },
      { status: 500 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corps de requête illisible (JSON attendu).' }, { status: 400 });
  }

  const employeeName = String(body.employee_name ?? '').trim();
  const storeCity = normalizeStoreCity(body.store);
  const cameraReference =
    typeof body.camera_reference === 'string' && body.camera_reference.trim()
      ? body.camera_reference.trim()
      : null;

  if (!employeeName) {
    return NextResponse.json({ error: 'Champ employee_name obligatoire.' }, { status: 400 });
  }
  if (!storeCity) {
    return NextResponse.json(
      { error: 'Champ store obligatoire et doit désigner Dakar ou Abidjan.' },
      { status: 400 },
    );
  }

  const supabase = adminClient();

  // Bornes de la journée courante (UTC) pour la déduction ARRIVEE/DEPART.
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  const dayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

  // Y a-t-il déjà un pointage aujourd'hui pour cet employé ?
  const { data: existing, error: existingErr } = await supabase
    .from('lmb_attendance')
    .select('id, type')
    .eq('cashier_name', employeeName)
    .gte('timestamp', dayStart.toISOString())
    .lte('timestamp', dayEnd.toISOString())
    .order('timestamp', { ascending: false });

  if (existingErr) {
    console.error('Webhook pointage : lecture lmb_attendance impossible', existingErr);
    return NextResponse.json(
      { error: `Lecture des pointages du jour impossible : ${existingErr.message}` },
      { status: 500 },
    );
  }

  const type: AttendanceType = (existing?.length ?? 0) > 0 ? 'DEPART' : 'ARRIVEE';

  const { data: inserted, error: insertErr } = await supabase
    .from('lmb_attendance')
    .insert({
      cashier_name: employeeName,
      store_city: storeCity,
      type,
      timestamp: now.toISOString(),
      camera_reference: cameraReference ?? `CAM_STREAM_${storeCity}_01`,
    })
    .select('id, cashier_name, store_city, type, timestamp, camera_reference')
    .single();

  if (insertErr || !inserted) {
    console.error('Webhook pointage : insert lmb_attendance échoué', insertErr);
    return NextResponse.json(
      { error: `Pointage NON enregistré : ${insertErr?.message ?? 'erreur inconnue'}` },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { success: true, action: type === 'ARRIVEE' ? 'CREATED_ARRIVEE' : 'CREATED_DEPART', record: inserted },
    { status: 201 },
  );
}
