// lib/security/rate-limit.ts
//
// Limiteur de fréquence simple, en mémoire, pour les routes API sensibles
// (/api/staff, /api/attendance/webhook).
//
// PORTÉE VOLONTAIREMENT LIMITÉE : ce compteur vit dans la mémoire du
// processus Next.js. Il protège efficacement contre une rafale de requêtes
// automatisées sur UNE instance de serveur (largement suffisant pour
// l'échelle actuelle de l'application). Il ne partage pas son état entre
// plusieurs instances/serveurs et se réinitialise à chaque redémarrage — si
// l'application est un jour déployée sur plusieurs serveurs en parallèle, un
// compteur partagé (ex. Redis/Upstash) deviendra nécessaire.
type Bucket = { count: number; windowStartMs: number };

const buckets = new Map<string, Bucket>();

// Nettoyage périodique pour éviter une fuite mémoire si de nombreuses IP
// différentes appellent l'API au fil du temps.
const MAX_TRACKED_KEYS = 5000;

/**
 * Retourne true si l'appel est autorisé, false s'il dépasse la limite.
 * @param key identifiant du demandeur (ex. adresse IP + nom de route)
 * @param limit nombre d'appels autorisés par fenêtre
 * @param windowMs durée de la fenêtre glissante, en millisecondes
 */
export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();

  if (buckets.size > MAX_TRACKED_KEYS) {
    for (const [k, b] of buckets) {
      if (now - b.windowStartMs > windowMs) buckets.delete(k);
    }
  }

  const existing = buckets.get(key);
  if (!existing || now - existing.windowStartMs > windowMs) {
    buckets.set(key, { count: 1, windowStartMs: now });
    return false;
  }

  existing.count += 1;
  return existing.count > limit;
}

export function clientIpFromRequest(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}
