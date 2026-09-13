# Deuxième audit LMB POS — 29 août 2026

Nouvelle analyse complète du projet, après clôture de l'audit du 27/08/2026 (sécurité, cœur métier, fiabilité des chiffres et nettoyage tous terminés). Rappel de l'utilisateur : toutes les données de l'application sont fictives, l'application n'a jamais été mise en production réelle.

Portée de cette analyse : relecture de toutes les pages `app/`, tous les services `lib/services/`, tous les composants, et les 28 fichiers de migration SQL — recherche de failles de sécurité, d'incohérences métier, de dette technique et de code mort.

## Constats critiques

### 1. Contrôle d'accès par rôle jamais implémenté au niveau base de données
La Tâche 0.1 (27/08) avait volontairement posé une policy RLS transitoire — accès complet (`USING (true) WITH CHECK (true)`) pour tout compte `authenticated`, en attendant de "l'affiner par rôle plus tard" une fois l'authentification en place (Tâche 0.2). L'authentification par rôle est bien en place depuis, mais cet affinement n'a jamais été fait : les 14 tables sensibles d'origine (`lmb_sales`, `lmb_customers`, `lmb_customer_orders`, `lmb_customer_loyalty_events`, `lmb_registers`, `lmb_register_expenses`, `lmb_expenses`, `lmb_attendance`, `lmb_inventory_audits`, `lmb_purchase_orders`, `lmb_suppliers`, `lmb_transfers`, `lmb_audit_logs`, `inventory_reports`), plus les tables ajoutées depuis (`lmb_merchant_balance_snapshots`, `lmb_merchant_withdrawals`, `lmb_surveillance_status`), portent toujours cette même policy « tout autoriser ».

Conséquence concrète : un compte CAISSIER connecté (identifiants valides, session légitime) peut, en contournant simplement l'interface — un appel direct à l'API REST Supabase avec son propre jeton, à la portée de n'importe qui sachant ouvrir les outils de développement du navigateur — lire et modifier n'importe quelle donnée des deux boutiques : le chiffre d'affaires complet, les fiches clients, les dépenses, l'état des caisses, les commandes fournisseurs, les comptes marchands Wave/OM, etc. Rien de tout cela n'est bloqué en base ; seule l'interface (`AuthGuard` + `isPathForbiddenForRole`) fait obstacle, et elle ne protège que la navigation dans l'appli elle-même, pas les appels directs à Supabase.

*(Bon exemple, à titre de comparaison, de ce qui aurait dû être généralisé : `lmb_floor_price_alerts` a une vraie policy restrictive — lecture seule pour `authenticated`, aucune écriture directe, tout passe par une fonction serveur.)*

### 2. Pages d'administration sans garde de rôle — accessibles à un CAISSIER
`CASHIER_FORBIDDEN_ADMIN_PATHS` (`lib/services/auth.ts`) ne couvre que deux chemins : `/admin/finance` et `/admin/purchases`. Toutes les autres pages sous `/admin` sont accessibles à un CAISSIER par simple saisie d'URL — aucune n'a de vérification de rôle interne (recherché explicitement, aucune trouvée) :
- `/admin/pricing` — affiche et permet de modifier les **coûts d'achat** et **prix planchers** de tous les produits.
- `/admin/comparative` — chiffres comparés entre les deux boutiques (potentiellement du ressort de la Direction seule).
- `/admin/promotions`, `/admin/audits`, `/admin/inventory`, `/admin/transfers`, `/admin/customers`.
- **`/admin` lui-même** (le tableau de bord principal) : il contient des onglets « 🏛️ Charges & Bilan Financier » et « 🧾 Grand Livre des Ventes » directement intégrés à la page — donc même si `/admin/finance` est bien bloqué pour un CAISSIER, des informations financières équivalentes restent visibles depuis le tableau de bord principal, qui lui n'est pas bloqué.

Ça contredit l'intention initiale de la Tâche 0.2 ("Bloquer l'accès à `/admin/*` ... aux rôles autres que GERANT/DIRECTION. Rediriger CAISSIER uniquement vers `/`") : dans les faits, un CAISSIER n'est aujourd'hui bloqué que sur 2 pages précises sur environ 14.

### 3. Coûts d'achat et prix plancher exposés publiquement (clé anon)
`lmb_products` reste en lecture publique pour le rôle `anon` (policy `anon_read_only`, pensée à l'origine pour le catalogue produit visible des clients). Les colonnes `cost_price_xof` et `floor_price_xof` ont été ajoutées à cette même table après coup (Tâche 2.4, migration `20260911_add_product_cost_price.sql`), sans qu'une policy dédiée ou une vue restreinte ne soit créée pour les exclure de l'accès public. Résultat : n'importe qui, sans compte, avec juste la clé anon (visible dans le code source du navigateur), peut interroger directement l'API REST Supabase et lire les coûts d'achat et les prix planchers de tous les produits — des données commerciales sensibles.

## Constats majeurs

- **78 usages de `any`** dans le code TypeScript malgré `strict: true` activé dans `tsconfig.json` — contourne le typage strict à de nombreux endroits (notamment le parsing JSON défensif dans `lib/services/finance.ts` et `lib/services/cost.ts`). Pas un bug en soi, mais réduit la capacité du typage à détecter de futures erreurs de schéma comme celles déjà rencontrées (colonnes inexistantes, types incompatibles).
- La fonction Postgres `record_sale_and_decrement_stock` — le cœur transactionnel de la vente (décrément de stock, verrouillage anti-survente) — n'a toujours aucun test automatisé exécutable, seulement une validation manuelle (Tâche 1.2). Lacune déjà identifiée en Tâche 3.6, jamais traitée depuis faute d'environnement de test avec une vraie base Postgres.
- Le tableau de bord `/admin/page.tsx` semble concentrer un très grand nombre de fonctionnalités (au moins 9 onglets, dont stocks, finances, comparatif, RH, comptes marchands) dans un seul fichier — pas un bug, mais un point de vigilance pour la maintenabilité à mesure que le fichier grossit.

## Ce qui n'est PAS un problème (vérifié, pour éviter un faux signalement)

- Les deux documents `ROADMAP_CLAUDE_CODE.md` (racine) et `docs/roadmap-claude-code-lmb-pos.md` ne sont pas des doublons en conflit : le second renvoie explicitement au premier pour le détail des tâches et ne sert que de journal des évolutions hors audit — pas de risque de désynchronisation.
- `/api/staff/route.ts` (création de comptes employé) est bien protégé : jeton revalidé côté serveur, rôle DIRECTION vérifié avant toute action, création atomique avec nettoyage en cas d'échec partiel. Aucun problème trouvé ici.
- Aucun `console.log` de débogage oublié dans le code applicatif, aucun `TODO`/`FIXME` en suspens (une seule fausse alerte : le mot "XXXXXX" dans un commentaire décrivant un format de référence, pas un TODO).

## Recommandation

Les constats 1 et 2 ont la même cause : la sécurité repose uniquement sur l'interface, jamais sur la base de données elle-même. Comme convenu à l'origine (Tâche 0.1), c'est le moment de vraiment "affiner par rôle" les policies RLS — la bonne pratique étant que la base refuse elle-même ce qu'un rôle ne doit pas faire, indépendamment de ce que montre ou cache l'interface. Le constat 3 se résout séparément (exclure les deux colonnes sensibles de l'accès public, via une vue publique dédiée ou une policy plus fine).

Comme il s'agit ici de revoir des règles d'accès (qui doit voir/modifier quoi), la décision revient à la Direction avant tout codage : quelles données précises un CAISSIER doit-il pouvoir consulter (probablement : le catalogue pour la vente, ses propres ventes) versus modifier (rien en dehors de la caisse) ? Un GERANT a-t-il accès aux deux boutiques ou seulement à la sienne ?
