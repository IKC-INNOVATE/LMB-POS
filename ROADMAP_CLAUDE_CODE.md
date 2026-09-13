# Feuille de route technique — LMB POS
### Document d'exécution pour Claude Code
Basé sur l'audit du 27 août 2026 (`Audit_LMB_POS.docx`)

---

## 0. Comment utiliser ce document

Ce document est écrit pour être donné directement à Claude Code, phase par phase. Chaque tâche contient :
- **Fichiers concernés** (chemins exacts du dépôt)
- **Problème** (renvoi au numéro de constat de l'audit)
- **Ce qu'il faut faire** (instruction technique précise)
- **Critère d'acceptation** (comment vérifier que c'est fait correctement)

**Règle d'exécution recommandée** : traiter les phases dans l'ordre (0 → 4). Ne pas commencer une phase tant que les critères d'acceptation de la précédente ne sont pas validés. Pour chaque tâche, Claude Code doit créer une branche ou un commit séparé, et lancer `npm run build` + `npm run lint` avant de passer à la tâche suivante.

**Avant de commencer** : faire une sauvegarde complète de la base Supabase (export SQL) et créer une branche git `audit-fixes` à partir de `main`.

---

## Phase 0 — Sécurité (bloquant, à faire avant tout le reste)

### Tâche 0.1 — Activer et écrire les policies RLS sur toutes les tables Supabase
**Constat lié : #3 (critique)**

**Fichiers concernés :** nouveau fichier `supabase/migrations/20260901_enable_rls.sql`

**À faire :**
1. Lister toutes les tables réellement utilisées par le code : `lmb_products`, `lmb_sales`, `lmb_customers`, `lmb_customer_orders`, `lmb_customer_loyalty_events`, `lmb_registers`, `lmb_register_expenses`, `lmb_transfers`, `lmb_promotions`, `lmb_suppliers`, `lmb_purchase_orders`, `lmb_inventory_audits`, `lmb_expenses`, `lmb_attendance`.
2. Pour chaque table : `ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;`
3. Écrire des policies basées sur l'authentification mise en place en tâche 0.2 (`auth.uid()` ou un rôle custom stocké dans une table `lmb_staff`). Tant que l'authentification n'est pas encore en place, appliquer une politique restrictive minimale de transition :
   - Lecture/écriture uniquement pour le rôle `authenticated` (jamais `anon`).
   - Retirer complètement les droits `anon` sur les tables sensibles (`lmb_sales`, `lmb_customers`, `lmb_registers`, `lmb_register_expenses`, `lmb_expenses`).
4. Documenter dans le fichier de migration, en commentaire SQL, la politique métier voulue à terme (ex : un caissier peut lire les produits et créer des ventes mais pas supprimer un client).

**Critère d'acceptation :** Depuis un client Supabase anonyme (script `curl`/`supabase-js` avec la seule clé anon, sans session utilisateur), toute tentative de lecture ou d'écriture sur les tables listées doit être refusée (erreur 401/403). Documenter ce test dans `supabase/migrations/README.md`.

---

### Tâche 0.2 — Remplacer le login par une vraie authentification avec rôles
**Constat lié : #2 et #17 (critique/mineur)**

**Fichiers concernés :** `app/login/page.tsx`, `lib/supabase.ts`, nouveau `lib/services/auth.ts`, nouveau `supabase/migrations/20260901_create_staff_table.sql`, `app/admin/layout.tsx`

**À faire :**
1. Créer une table `lmb_staff` (id, nom, code_pin_hash ou lien vers `auth.users`, rôle `CAISSIER` | `GERANT` | `DIRECTION`, boutique assignée, actif/inactif).
2. Utiliser Supabase Auth (email/mot de passe ou magic link) OU, si un simple code PIN par employé est préféré pour rester simple à l'usage en boutique, stocker un hash du PIN par employé côté serveur (jamais de liste en dur côté client) et vérifier via une fonction serveur (Route Handler Next.js), jamais dans le composant React.
3. Stocker la session (qui est connecté, avec quel rôle, sur quelle boutique) dans un cookie signé ou via `supabase.auth`.
4. Bloquer l'accès à `/admin/*` (finances, marges, suppression) aux rôles autres que `GERANT`/`DIRECTION`. Rediriger `CAISSIER` uniquement vers `/`.
5. Ajouter le nom de l'employé connecté partout où `cashier_name` est actuellement codé en dur (`'Caisse principale'`) dans `app/page.tsx`, `lib/services/register.ts`, `lib/services/sales.ts`.

**Critère d'acceptation :** Il n'existe plus aucune liste de codes PIN dans le code source (`grep -rn "VALID_PINS"` retourne vide). Un compte `CAISSIER` ne peut pas ouvrir `/admin/finance`. Chaque vente/dépense/ouverture de caisse enregistre le vrai nom de l'employé connecté, pas une valeur fixe.

---

### Tâche 0.3 — Sécuriser le webhook de pointage
**Constat lié : #4 (critique)**

**Fichiers concernés :** `app/api/attendance/webhook/route.ts`, `.env.local` (nouvelle variable `ATTENDANCE_WEBHOOK_SECRET`)

**À faire :**
1. Ajouter une variable d'environnement serveur (non `NEXT_PUBLIC_`) `ATTENDANCE_WEBHOOK_SECRET`.
2. Dans `route.ts`, exiger un header `Authorization: Bearer <secret>` ou un champ `secret` dans le corps de la requête, et comparer avec `crypto.timingSafeEqual` (pas une simple égalité `===`) pour éviter les attaques par timing.
3. Retourner `401` immédiatement si le secret est absent ou invalide, avant toute lecture du corps de la requête.
4. Journaliser (table `lmb_attendance_log` ou champ `source_ip`) chaque tentative refusée pour audit ultérieur.

**Critère d'acceptation :** Une requête `POST` sans le secret retourne `401`. Le boîtier/service de pointage réel est reconfiguré pour envoyer ce secret.

---

## Phase 1 — Fiabiliser le cœur métier (caisse ↔ stock)

### Tâche 1.1 — Remplacer le panier fictif de la caisse par le vrai catalogue produits
**Constat lié : #1 (critique)**

**Fichiers concernés :** `app/page.tsx`, nouveau `lib/services/products.ts`, `types/index.ts`

**À faire :**
1. Créer `lib/services/products.ts` avec :
   - `listProducts(storeCity: StoreCity)` : lit `lmb_products`, retourne les champs utiles (id, sku, barcode, name, standard_retail_price_xof, floor_price_xof, stock_dakar/stock_abidjan selon la boutique).
   - `searchProducts(query: string, storeCity: StoreCity)` : recherche par nom, SKU ou code-barres (`ilike`).
   - `getProductByBarcode(barcode: string)` : pour le scan douchette/mobile.
2. Dans `app/page.tsx` :
   - Supprimer `starterItems`.
   - Ajouter un champ de recherche/scan produit relié à `searchProducts`/`getProductByBarcode`.
   - `handleAddProduct` doit vérifier que la quantité demandée ne dépasse pas le stock disponible de la boutique active (`stock_dakar` pour Dakar) avant d'ajouter au panier ; afficher un message clair sinon.
   - Le `CartItem` doit porter `isUnderFloorPrice` calculé en continu (voir tâche 2.2).
3. Déterminer la boutique active de la caisse (aujourd'hui codée en dur `'LMB - Dakar'` / `'LMB_DAK'`) à partir du profil de l'employé connecté (tâche 0.2), pas d'une constante.

**Critère d'acceptation :** Il n'existe plus aucune référence à `starterItems` dans le code. Ajouter un produit dont le stock est à 0 affiche un blocage/avertissement clair. La recherche retrouve un produit réel de `lmb_products` par nom, SKU ou code-barres.

---

### Tâche 1.2 — Déduire le stock réel à chaque vente validée
**Constat lié : #1 (critique)**

**Fichiers concernés :** `lib/services/sales.ts`, nouveau `supabase/migrations/20260901_create_sale_stock_function.sql`

**À faire :**
1. Écrire une fonction Postgres `record_sale_and_decrement_stock(sale_payload jsonb, items jsonb, store_column text)` en `SECURITY DEFINER`, qui, dans **une seule transaction** :
   - Vérifie que chaque produit a un stock suffisant dans la colonne de la boutique concernée (`stock_dakar` ou `stock_abidjan`).
   - Si un article est en stock insuffisant, annule toute la transaction et retourne une erreur explicite (nom du produit, stock disponible).
   - Insère la ligne dans `lmb_sales`.
   - Décrémente le stock de chaque produit vendu.
   - Insère la ligne dans `lmb_customer_orders` si un client est renseigné.
2. Modifier `createSaleWithCustomer` dans `lib/services/sales.ts` pour appeler cette fonction via `supabase.rpc('record_sale_and_decrement_stock', {...})` au lieu de faire l'`insert` direct sur `lmb_sales` suivi d'un `insert` séparé sur `lmb_customer_orders` sans lien avec le stock.
3. Propager l'erreur de stock insuffisant jusqu'à l'UI (`app/page.tsx`) : afficher clairement quel produit pose problème, ne pas vider le panier, ne pas imprimer de ticket.

**Critère d'acceptation :** Après une vente de 2 unités d'un produit, `stock_dakar` (ou `stock_abidjan`) de ce produit a bien diminué de 2 dans la base, dans la même opération que l'enregistrement de la vente (pas d'étape séparée oubliable). Une tentative de vente dépassant le stock disponible est bloquée avant tout enregistrement.

---

### Tâche 1.3 — Ne plus masquer les échecs d'enregistrement (ventes, caisse, dépenses, transferts)
**Constat lié : #7 (majeur)**

**Fichiers concernés :** `lib/services/sales.ts`, `lib/services/register.ts`, `lib/services/inventory.ts`, `app/page.tsx`, `components/pos/CashExpenseButton.tsx`, `components/pos/CloseRegisterButton.tsx`

**À faire :**
1. Supprimer tous les blocs `catch` qui retournent un objet `fallback`/`local-*` en cas d'erreur Supabase sans faire remonter clairement l'échec à l'appelant.
2. Toute fonction de service doit soit réussir et retourner la donnée réelle, soit lancer une exception explicite (`throw`) que l'UI affiche à l'utilisateur (« Vente NON enregistrée — vérifiez la connexion et réessayez », pas un message de succès).
3. Dans `app/page.tsx` (`handleFinalizeSale`), ne vider le panier et n'ouvrir le reçu **que si** `createSaleWithCustomer` a réellement réussi. En cas d'échec, garder le panier intact et proposer un bouton « Réessayer ».
4. (Optionnel, si la connexion internet en boutique est instable) : ajouter une file d'attente locale (IndexedDB/localStorage) qui retente automatiquement l'envoi de la vente en arrière-plan, avec un indicateur visuel « Vente en attente de synchronisation », plutôt que de faire semblant que tout a réussi.

**Critère d'acceptation :** En coupant volontairement l'accès réseau/Supabase pendant un test, valider un paiement doit afficher une erreur explicite et garder le panier, jamais un message de succès avec ticket imprimable.

---

### Tâche 1.4 — Unifier les deux formats de transfert de stock
**Constat lié : #5 (critique)**

**Fichiers concernés :** `lib/services/inventory.ts`, `app/admin/page.tsx` (section expédition, autour de la fonction `handleValidateAndSendShipment`), nouveau `supabase/migrations/20260901_normalize_transfers.sql`

**À faire :**
1. Choisir un seul schéma de données pour `lmb_transfers` : recommandation → garder le format de `lib/services/inventory.ts` (`source_location`, `destination_location`, `items: [{productId, qty}]`, `status`), car c'est celui que `confirmTransfer()` sait traiter.
2. Migrer les données existantes : écrire un script SQL/Node ponctuel qui relit les transferts au format `origin_store`/`destination_store`/`items_json` et les réécrit au format unifié (ou les marque `LEGACY_UNCONFIRMED` si la conversion est ambiguë).
3. Réécrire `handleValidateAndSendShipment` dans `app/admin/page.tsx` pour qu'il appelle **la même fonction** `createTransfer` (et `confirmTransfer` si l'expédition est immédiatement confirmée) de `lib/services/inventory.ts`, au lieu de construire son propre payload et de modifier le stock directement en dehors du service.
4. Supprimer toute écriture directe de stock (`supabase.from('lmb_products').update({stock_abidjan: ...})`) qui ne passe pas par `lib/services/inventory.ts`.

**Critère d'acceptation :** Un seul chemin de code écrit dans `lmb_transfers` et modifie le stock lors d'un transfert. `grep -rn "lmb_transfers" app/ lib/` ne montre plus qu'un point d'écriture (dans `lib/services/inventory.ts`), les pages appelant uniquement les fonctions exportées de ce service.

---

## Phase 2 — Fiabiliser les chiffres de gestion

### Tâche 2.1 — Corriger l'affichage du mode de paiement sur le ticket
**Constat lié : #8 (majeur)**

**Fichiers concernés :** `app/page.tsx` (fonction `handleFinalizeSale`, construction de `receiptPayload`)

**À faire :** Remplacer `paymentMethod: 'ESPECES'` (codé en dur) par `paymentMethod: finalPaymentMethod` (la valeur réellement calculée juste au-dessus dans la même fonction). Vérifier aussi `components/pos/ReceiptModal.tsx` pour s'assurer qu'il affiche bien ce champ sans le retraiter.

**Critère d'acceptation :** Une vente payée en « Wave / Mobile » affiche « Wave / Mobile » sur le ticket imprimé, pas « Espèces ».

---

### Tâche 2.2 — Ajouter le contrôle du prix plancher
**Constat lié : #9 (majeur)**

**Fichiers concernés :** `app/page.tsx`, `types/index.ts` (déjà défini : `isUnderFloorPrice`)

**À faire :**
1. À chaque modification de prix ou d'article du panier, calculer `isUnderFloorPrice = appliedUnitPriceXof < product.floor_price_xof`.
2. Si au moins un article du panier est sous le prix plancher : afficher un bandeau d'alerte visible et exiger une validation supplémentaire avant de finaliser la vente (ex : case à cocher « Remise exceptionnelle validée par le/la gérant(e) », ou blocage total si le rôle connecté n'est pas `GERANT`/`DIRECTION` — cf. tâche 0.2).
3. Enregistrer dans `metadata` de la vente (`lmb_sales`) la liste des articles vendus sous le prix plancher, pour permettre un contrôle a posteriori.

**Critère d'acceptation :** Vendre un article en dessous de son `floor_price_xof` déclenche une alerte visible et, sauf rôle autorisé, bloque la validation.

---

### Tâche 2.3 — Plafonner le cumul des remises (VIP + code promo)
**Constat lié : #10 (majeur)**

**Fichiers concernés :** `app/page.tsx`, `lib/services/promotions.ts`

**À faire :**
1. Définir la règle métier avec le porteur du projet (à valider avant codage) : par exemple « le cumul remise VIP + code promo ne peut jamais dépasser 15 % du sous-total » ou « un seul type de remise actif à la fois, le plus avantageux pour le client ».
2. Implémenter cette règle dans le calcul de `discountAmount` (actuellement une simple addition `vipDiscountAmount + promoDiscount`).
3. Afficher clairement dans l'UI la règle appliquée (ex : « Remise plafonnée à 15 % »).

**Critère d'acceptation :** Un scénario combinant un client VIP_PREMIUM (10 %) et un code promo de 20 % ne peut pas produire un total de remise supérieur au plafond métier défini.

---

### Tâche 2.4 — Rendre la clôture de caisse strictement dépendante de la boutique
**Constat lié : #11 (majeur)**

**Fichiers concernés :** `lib/services/register.ts`

**À faire :**
1. Rendre `store_code` obligatoire (type `string`, plus `string | undefined`) dans `openRegister`, `findOpenRegister`, `addCashExpense`, `closeRegister`, `getOpenRegister`.
2. Dans `openRegister`, vérifier qu'aucune autre caisse n'est déjà `OPEN` pour ce `store_code` avant d'en ouvrir une nouvelle ; sinon, lancer une erreur explicite.
3. Dans `closeRegister`, filtrer explicitement `lmb_sales` par `store_code` en plus des dates (actuellement seul le filtre de dates est appliqué).

**Critère d'acceptation :** Il est impossible d'ouvrir deux caisses simultanément sur le même `store_code`. Le total espèces théorique d'une clôture Dakar n'inclut jamais une vente enregistrée avec `store_code = 'LMB - Abidjan'`.

---

### Tâche 2.5 — Baser la marge brute sur le coût réel plutôt qu'une estimation forfaitaire
**Constat lié : #13 (majeur)**

**Fichiers concernés :** `lib/services/finance.ts`

**À faire :**
1. Dans `getEstimatedUnitCost`, prioriser une vraie donnée de coût si elle existe (ex : dernier `unit_cost` reçu dans un bon de commande `lmb_purchase_orders`, à relier au produit) avant de retomber sur `floor_price_xof`, puis seulement en tout dernier recours sur l'estimation à 65 %.
2. Ajouter un champ `marginIsEstimated: boolean` dans le retour de `getFinancialOverview`, et l'afficher clairement dans `app/admin/finance/page.tsx` (ex : bandeau « Marge estimée — coût réel non disponible pour X articles »).

**Critère d'acceptation :** Quand un coût réel est disponible pour un produit, il est utilisé dans le calcul (vérifiable en comparant deux ventes, une avec coût connu, une sans). L'écran Finances indique explicitement quand un chiffre est une estimation.

---

## Phase 3 — Nettoyage et dette technique

### Tâche 3.1 — Compléter les migrations manquantes
**Constat lié : #6 (majeur)**

**Fichiers concernés :** nouveau `supabase/migrations/20260902_add_missing_tables.sql`

**À faire :** Utiliser `supabase db pull` (ou exporter le schéma actuel depuis le tableau de bord Supabase) pour générer les `CREATE TABLE IF NOT EXISTS` de `lmb_products`, `lmb_sales`, `lmb_customer_orders`, `lmb_expenses`, `lmb_attendance`, en respectant les colonnes réellement utilisées par le code (`grep` chaque service pour lister les champs attendus). Committer ce fichier.

**Critère d'acceptation :** Un environnement Supabase vide, sur lequel on rejoue toutes les migrations du dossier dans l'ordre, recrée un schéma capable de faire fonctionner l'application sans erreur `relation does not exist`.

---

### Tâche 3.2 — Décider du sort des 5 onglets vides du tableau de bord
**Constat lié : #12 (majeur)**

**Fichiers concernés :** `app/admin/page.tsx`

**À faire (deux options, à trancher avec le porteur du projet avant codage) :**
- **Option A (rapide)** : retirer du tableau `[{id:'STOCK',...}, ...]` les entrées `COMPARATIVE`, `LIVE_CAMERAS`, `WAVE_OM_GATEWAY`, `PRICING`, `ATTENDANCE` tant qu'elles ne sont pas construites, pour ne pas afficher de fausses promesses.
- **Option B (si prioritaire pour l'activité)** : cadrer chacune comme un mini-projet séparé (spécifier les données nécessaires, l'écran attendu) avant de l'implémenter — ne pas les traiter comme un simple oubli de code.

**Critère d'acceptation :** Aucun onglet du menu ne mène à un écran vide.

---

### Tâche 3.3 — Nettoyer les doublons de champs client
**Constat lié : #14 (mineur)**

**Fichiers concernés :** `lib/services/customers.ts`, `types/index.ts`, `supabase/migrations/20260821_create_customers_tables.sql` (migration de nettoyage à ajouter)

**À faire :**
1. Choisir un seul nom canonique par donnée (`full_name`, `vip_status`, `loyalty_points`, `total_spent_xof`).
2. Écrire une migration qui copie les valeurs des colonnes redondantes vers la colonne canonique (en cas de divergence, garder la valeur la plus récente), puis supprime les colonnes en double (`name`, `statut_vip`, `points_fidelite`, `total_depense`, `total_spent`, `vip_level`).
3. Simplifier `normalizeCustomer`, `createCustomer`, `addLoyaltyPoints`, `useLoyaltyPoints` pour ne plus lire/écrire que les champs canoniques.
4. Adapter `types/index.ts` en conséquence.

**Critère d'acceptation :** Chaque donnée client n'existe plus qu'une seule fois dans le schéma et dans le code.

---

### Tâche 3.4 — Terminer le remplacement des composants d'interface
**Constat lié : #15 (mineur)**

**Fichiers concernés :** `app/page.tsx`, `app/admin/customers/page.tsx`, `app/admin/finance/page.tsx`, `app/admin/inventory/page.tsx`, `app/admin/promotions/page.tsx`, `app/login/page.tsx`, `components/pos/ReceiptModal.tsx`, `components/pos/CashExpenseButton.tsx`

**À faire :** Appliquer les remplacements décrits dans `repo_ui_refactor_preview.md` (`<input>` → `<Input>`, `<select>` → `<Select>`, `<textarea>` → `<Textarea>`, boutons → `<PrimaryButton>`/`<SecondaryButton>`) sur les fichiers restants, en respectant la remarque du document sur les champs à fond clair (ne pas convertir les inputs de caisse en fond blanc). Lancer `npm run build` après chaque fichier.

**Critère d'acceptation :** Plus aucune classe `bg-[#111111] border border-gray-700` répétée à la main sur un `<input>`/`<select>`/`<textarea>` brut hors des composants `components/ui/`.

---

### Tâche 3.5 — Vérifier et retirer le contenu suspect de AGENTS.md
**Constat lié : #16 (mineur)**

**Fichiers concernés :** `AGENTS.md`, `CLAUDE.md`

**À faire :** Vérifier avec le porteur du projet qui a introduit ce fichier et pourquoi. S'il n'a pas de justification légitime documentée, le supprimer (ainsi que la référence `@AGENTS.md` dans `CLAUDE.md` si elle n'a plus lieu d'être).

**Critère d'acceptation :** Le fichier ne contient plus d'instruction adressée à un outil d'IA prétendant provenir d'un mécanisme officiel de Next.js.

---

### Tâche 3.6 — Ajouter des tests automatisés sur les calculs sensibles à l'argent
**Constat lié : #18 (mineur)**

**Fichiers concernés :** nouveau dossier `__tests__/`, `package.json` (ajouter `vitest` ou `jest`)

**À faire :** Écrire des tests unitaires couvrant au minimum :
- Calcul du total du panier et des remises (VIP + promo + plafond, cf. tâche 2.3).
- `validateAndApplyPromoCode` (dates, montant minimum, limite d'utilisation).
- `addLoyaltyPoints` / `useLoyaltyPoints` (calcul des points, refus si points insuffisants).
- `closeRegister` (calcul du solde théorique et de l'écart).
- La fonction de décrément de stock (tâche 1.2) : refus si stock insuffisant, décrément correct sinon.

**Critère d'acceptation :** `npm test` exécute ces tests avec succès et échoue si l'un de ces calculs est modifié de façon incorrecte.

---

## Récapitulatif — ordre d'exécution et dépendances

| # | Tâche | Dépend de |
|---|---|---|
| 0.1 | RLS Supabase | — |
| 0.2 | Authentification + rôles | 0.1 |
| 0.3 | Sécuriser webhook attendance | — |
| 1.1 | Vrai catalogue en caisse | 0.2 |
| 1.2 | Décrément de stock transactionnel | 1.1 |
| 1.3 | Ne plus masquer les échecs | 1.2 |
| 1.4 | Unifier les transferts | — |
| 2.1 | Mode de paiement sur le ticket | 1.1 |
| 2.2 | Contrôle prix plancher | 1.1, 0.2 (rôles) |
| 2.3 | Plafond de remises | 1.1 |
| 2.4 | Clôture de caisse par boutique | 0.2 |
| 2.5 | Marge sur coût réel | — |
| 3.1 | Migrations manquantes | 0.1 (pour être cohérent) |
| 3.2 | Onglets vides | — |
| 3.3 | Nettoyage champs client | — |
| 3.4 | Refactor UI | — |
| 3.5 | AGENTS.md | — |
| 3.6 | Tests automatisés | 1.2, 2.3, 2.4 |

**Recommandation finale :** ne jamais mettre en production un lot de tâches sans avoir validé son critère d'acceptation. Pour Ibrahim (porteur non-développeur) : demander à chaque étape un résumé en français simple de ce qui a changé et un export/backup de la base avant toute migration destructive (suppression de colonnes en tâche 3.3 notamment).
