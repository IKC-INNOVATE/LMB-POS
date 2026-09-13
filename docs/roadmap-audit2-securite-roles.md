# Feuille de route — Deuxième audit (contrôle d'accès par rôle)
### Document d'exécution pour Claude Code
Basé sur le deuxième audit du 29 août 2026 (`audit-lmb-pos-2026-08-29-v2.md`)

## Comment ce document est utilisé

Comme pour la première feuille de route : on traite les phases dans l'ordre, une tâche à la fois, avec vérification (`npx tsc --noEmit`, `npx eslint`) après chaque changement de code, et chaque migration SQL est fournie prête à coller dans le SQL Editor Supabase — c'est toujours l'utilisateur qui l'exécute, jamais automatique. Rappel : toutes les données de l'app sont fictives, donc pas de sauvegarde préalable exigée, mais on garde la même rigueur de vérification.

---

## Phase A — Fermer l'accès public mort (aucun jugement métier requis)

### Tâche A.1 — Retirer l'accès `anon` à `lmb_products` et `lmb_promotions`
**Constat lié : #3 (critique, exposition des coûts/prix planchers)**

**Vérifié avant de coder :** toutes les pages de l'application sont derrière `AuthGuard` (`/` via son propre wrapper, tout `/admin/*` via le layout partagé) — il n'existe **aucune** page publique qui aurait besoin de lire le catalogue sans être connecté. La policy `anon_read_only` sur ces deux tables (posée en Tâche 0.1 pour un usage "catalogue client public" qui n'existe pas dans le code) est donc un accès mort, pas une fonctionnalité utilisée.

**À faire :** migration retirant le `GRANT SELECT` et la policy `anon_read_only` sur `lmb_products` et `lmb_promotions`. Le rôle `authenticated` garde son accès complet (transitoire, affiné en Phase B).

**Critère d'acceptation :** une requête `curl` avec uniquement la clé anon sur `/rest/v1/lmb_products` et `/rest/v1/lmb_promotions` renvoie 401/403 ou un tableau vide. L'application continue de fonctionner normalement pour un utilisateur connecté (aucune page ne dépend de l'accès anon).

---

## Phase B — Policies RLS par rôle (le cœur du sujet)

### Hypothèses de départ (à ajuster si la Direction voit les choses autrement)
En l'absence d'une règle métier écrite pour chaque rôle, ces règles par défaut sont proposées à partir de ce que l'interface bloque déjà intentionnellement (Tâche 0.2) et de ce que chaque rôle utilise réellement dans le code :

| Table | CAISSIER | GERANT | DIRECTION |
|---|---|---|---|
| `lmb_products`, `lmb_promotions` (lecture) | lecture (nécessaire pour vendre) | lecture | lecture |
| `lmb_products` (coût d'achat / prix plancher — écriture) | non | oui | oui |
| `lmb_promotions` (écriture) | non | oui | oui |
| `lmb_sales`, `lmb_customer_orders` | lecture/écriture, sa boutique seulement | lecture/écriture, sa boutique seulement | lecture/écriture, les deux boutiques |
| `lmb_customers`, `lmb_customer_loyalty_events` | lecture/écriture (nécessaire pour la fidélité) | lecture/écriture | lecture/écriture |
| `lmb_registers`, `lmb_register_expenses` | lecture/écriture, sa boutique seulement | lecture/écriture, sa boutique seulement | lecture/écriture, les deux |
| `lmb_expenses` | non | lecture/écriture, sa boutique | lecture/écriture, les deux |
| `lmb_purchase_orders`, `lmb_suppliers` | non | lecture/écriture | lecture/écriture |
| `lmb_transfers` | non | lecture/écriture (boutiques source/destination) | lecture/écriture |
| `lmb_inventory_audits` | non | lecture/écriture, sa boutique | lecture/écriture |
| `lmb_attendance` | ses propres pointages (lecture) | lecture, sa boutique | lecture, tout |
| `lmb_audit_logs`, `inventory_reports` | non | lecture | lecture |
| `lmb_merchant_balance_snapshots`, `lmb_merchant_withdrawals` | non | non | oui uniquement |
| `lmb_surveillance_status` | non | non | oui uniquement |
| `lmb_floor_price_alerts` | non (déjà correct : lecture authenticated seule, aucune écriture directe) | — | — |

**Boutique du compte** : `store_code` sur `lmb_staff` (`NULL` = DIRECTION, supervise les deux).

### Tâche B.1 — Fonctions utilitaires de rôle
**Fichiers concernés :** nouveau `supabase/migrations/2026XXXX_role_helper_functions.sql`

**À faire :** deux fonctions `SECURITY DEFINER`, `STABLE` :
- `public.current_staff_role() RETURNS text` — lit `lmb_staff.role` pour `auth.uid()`, retourne `NULL` si absent/inactif.
- `public.current_staff_store() RETURNS text` — lit `lmb_staff.store_code` pour `auth.uid()` (`NULL` pour DIRECTION).

**Critère d'acceptation :** `SELECT current_staff_role(), current_staff_store();` exécuté par un compte connecté renvoie les bonnes valeurs ; renvoie `NULL, NULL` pour un rôle `anon` ou un jeton invalide (jamais d'erreur qui casserait une policy).

### Tâche B.2 — Policies par table (remplacer `authenticated_all_access`)
**Fichiers concernés :** nouveau `supabase/migrations/2026XXXX_rls_policies_by_role.sql`

**À faire :** pour chaque table du tableau ci-dessus, `DROP POLICY "authenticated_all_access"` puis policies séparées SELECT / INSERT / UPDATE / DELETE selon `current_staff_role()` et, quand la boutique compte, `store_name`/`store_code` = `current_staff_store()` OR `current_staff_role() = 'DIRECTION'`.

**Critère d'acceptation :** reproduire en conditions réelles (comptes de test déjà en place) : un CAISSIER Dakar qui tente de lire `lmb_expenses` ou une vente d'Abidjan via un appel direct à l'API (pas depuis l'interface) reçoit un tableau vide / une erreur — jamais les vraies données d'une autre boutique ou d'une table qui ne le concerne pas.

### Tâche B.3 — Vérifier qu'aucune fonctionnalité légitime ne casse
**À faire :** rejouer manuellement les parcours clés après application (vente CAISSIER, clôture de caisse, création de transfert GERANT, écran Finances DIRECTION) pour confirmer qu'aucun blocage RLS involontaire n'apparaît sur un usage normal.

---

## Phase C — Durcir la garde de rôle côté interface (défense en profondeur)

### Tâche C.1 — Passer d'une liste noire à une liste blanche par rôle
**Constat lié : #2**

**Fichiers concernés :** `lib/services/auth.ts`, `components/auth/AuthGuard.tsx`

**À faire :** remplacer `CASHIER_FORBIDDEN_ADMIN_PATHS` (liste noire, oubli facile) par une liste blanche explicite des chemins `/admin/*` autorisés par rôle (ex. `CAISSIER_ALLOWED_ADMIN_PATHS = []` si un CAISSIER n'a aucune raison d'aller sous `/admin`). Tout chemin `/admin/*` non listé pour le rôle courant est refusé par défaut — un nouvel onglet admin créé plus tard sera donc bloqué par défaut tant qu'il n'est pas explicitement autorisé, au lieu d'être ouvert par oubli.

**Critère d'acceptation :** un compte CAISSIER redirigé vers `/` sur **toutes** les URL `/admin/*` sans exception (y compris `/admin/pricing`, `/admin/comparative`, etc.) ; un GERANT garde l'accès prévu (tout sauf ce qui reste réservé DIRECTION) ; aucune redirection inattendue pour DIRECTION.

### Tâche C.2 — Séparer le tableau de bord principal de son contenu financier
**Constat lié : #2 (onglets "Charges & Bilan Financier" / "Grand Livre des Ventes" dans `/admin/page.tsx`, page elle-même non bloquée pour CAISSIER)**

**À faire :** puisque C.1 bloque déjà `/admin` en entier pour CAISSIER, cette tâche devient surtout une vérification : confirmer qu'un CAISSIER n'atteint plus jamais ces onglets par ce chemin. Si un usage légitime pour CAISSIER existe sur `/admin` (à confirmer avec la Direction), il faudra alors extraire ces onglets financiers dans une sous-page dédiée plutôt que de les laisser dans la page générale.

**Critère d'acceptation :** dépend de la décision Direction ; à défaut, C.1 seul suffit à fermer le trou.

---

## Ordre d'exécution recommandé
1. Phase A (immédiat, aucun jugement métier).
2. Phase B, tâche par tâche, avec test réel après B.2 avant de passer à B.3.
3. Phase C, après B (la base doit déjà refuser ce que l'interface cache, sinon C seul redonnerait un faux sentiment de sécurité).
