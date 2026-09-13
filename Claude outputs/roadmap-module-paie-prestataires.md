# Feuille de route — Module Paie & Registre des Prestataires
### Document d'exécution pour Claude Code
Contexte : LMB (Luxury Magic Butter Skin, Dakar) a une seule employée déclarée (contrat CDD, salaire brut 200 000 FCFA : 120 000 base + 54 000 sursalaire + 26 000 prime de transport, cotisations sociales ~29 400 FCFA/mois, versement trimestriel — voir dossier conformité travail existant) et 4-5 prestataires non formalisés, correctement rémunérés en dehors de tout contrat écrit pour l'instant.

Objectif validé avec l'utilisateur (pas un ERP complet générique — hors périmètre pour une structure de cette taille) : un module Paie avec génération de vrai bulletin de paie PDF pour l'employée déclarée, et un registre simple (sans gestion de contrat) pour les prestataires.

## ⚠️ Point de prudence à traiter avant tout usage officiel

Les taux de cotisation ci-dessous ont été trouvés par recherche web (sources : sunupayrh.com, afrotools.com, africarrieres.com) et recoupés entre plusieurs sites, mais **aucun ne remplace une vérification sur le portail officiel NDAMLI (online.secusociale.sn) ou auprès de votre comptable/expert-paie**, en particulier pour :
- Le **plafond exact** de salaire soumis à cotisation IPRES (varie selon le régime général vs régime des cadres).
- Le **taux CSS "accidents du travail"** exact pour votre secteur d'activité (variable selon la classe de risque, entre 1 % et 5 %).

C'est pourquoi le module est conçu avec ces taux comme **valeurs par défaut modifiables** dans une table de configuration (`lmb_payroll_settings`), jamais codées en dur dans la logique de calcul — vous pourrez les corriger vous-même une fois confirmées, sans redéploiement de code.

**Taux retenus par défaut (à confirmer) :**
- IPRES retraite : 5,6 % part salariale, 8,4 % part patronale (14 % au total).
- CSS (prestations familiales + accidents du travail) : entièrement à la charge de l'employeur, taux par défaut 7 % (prestations familiales) + 1 % (accidents du travail, risque faible par défaut) = 8 % employeur, 0 % salarié.
- IRPP (retenue à la source), barème progressif annuel : 0 % jusqu'à 630 000 FCFA, 20 % de 630 001 à 1 500 000, 30 % de 1 500 001 à 4 000 000, 35 % de 4 000 001 à 8 000 000, 37 % de 8 000 001 à 13 500 000, 40 % de 13 500 001 à 25 000 000, 43 % au-delà. Système de parts selon situation familiale (1 part célibataire sans enfant, 1,5 marié sans enfant ou célibataire avec 1 enfant, 2 parts marié/veuf avec enfant, +0,5 part par enfant supplémentaire, max 5 parts).

---

## Phase D.1 — Modèle de données (migrations Supabase)

### Tâche D.1.1 — Table de configuration des taux
**Fichier :** nouveau `supabase/migrations/2026XXXX_create_payroll_settings.sql`

**À faire :** table `lmb_payroll_settings` (ligne unique ou versionnée par date d'effet) : `ipres_employee_rate`, `ipres_employer_rate`, `ipres_ceiling_xof`, `css_employer_rate`, `ir_bareme` (jsonb : tableau de tranches `{from, to, rate}`), `effective_from`, `updated_by`, `updated_at`. Valeurs par défaut = taux ci-dessus. RLS : lecture/écriture DIRECTION uniquement (cohérent avec `/admin/hr` déjà réservé DIRECTION).

### Tâche D.1.2 — Table des salariés en paie
**Fichier :** nouveau `supabase/migrations/2026XXXX_create_payroll_employees.sql`

**À faire :** table `lmb_payroll_employees` : `id`, `staff_id` (FK nullable vers `lmb_staff`, un salarié en paie n'a pas forcément de compte de connexion à l'app), `full_name`, `contract_type` (CDD/CDI), `contract_start_date`, `contract_end_date` (nullable), `base_salary_xof`, `sursalaire_xof`, `prime_transport_xof`, `other_primes` (jsonb, extensible pour primes futures), `family_parts` (numeric, pour le calcul IRPP), `is_active`, `created_at`. RLS : DIRECTION uniquement.

### Tâche D.1.3 — Table des bulletins de paie générés
**Fichier :** nouveau `supabase/migrations/2026XXXX_create_payslips.sql`

**À faire :** table `lmb_payslips` : `id`, `employee_id` (FK), `period_month` (date, premier du mois), `gross_salary_xof`, `ipres_employee_xof`, `ipres_employer_xof`, `css_employer_xof`, `ir_xof`, `net_salary_xof`, `computed_breakdown` (jsonb — snapshot complet du calcul et des taux utilisés à la génération, pour que le bulletin reste exact même si les taux changent plus tard), `generated_at`, `generated_by`. Contrainte unique `(employee_id, period_month)` pour éviter les doublons. RLS : DIRECTION uniquement.

### Tâche D.1.4 — Table de suivi des versements trimestriels de cotisations
**Fichier :** nouveau `supabase/migrations/2026XXXX_create_social_contribution_payments.sql`

**À faire :** table `lmb_social_contribution_payments` : `id`, `quarter_label` (ex. "2026-Q3"), `period_start`, `period_end`, `amount_due_xof`, `amount_paid_xof` (nullable), `due_date`, `paid_date` (nullable), `status` (`DUE`/`PAID`/`LATE`), `note`. RLS : DIRECTION uniquement.

### Tâche D.1.5 — Registre des prestataires
**Fichier :** nouveau `supabase/migrations/2026XXXX_create_service_providers.sql`

**À faire :** deux tables :
- `lmb_service_providers` : `id`, `full_name`, `service_description`, `usual_amount_xof`, `frequency` (`MENSUEL`/`PONCTUEL`/`HEBDOMADAIRE`/autre), `is_active`, `created_at`. Pas de champ contrat pour l'instant (décision actée : formalisation possible plus tard, cette table est conçue pour accueillir des champs contrat sans migration cassante si besoin).
- `lmb_service_provider_payments` : `id`, `provider_id` (FK), `amount_xof`, `payment_date`, `note`, `created_by`, `created_at`.

RLS : DIRECTION uniquement par défaut (comme le reste RH) — à reconfirmer si GERANT doit y avoir accès en lecture/écriture pour son usage opérationnel.

**Critère d'acceptation Phase D.1 :** les 6 tables existent, RLS activé sur toutes avec policies DIRECTION uniquement (test réel : un compte GERANT ou CAISSIER ne peut ni lire ni écrire ces tables via un appel direct à l'API).

---

## Phase D.2 — Logique de calcul (service, testable indépendamment de l'UI)

### Tâche D.2.1 — Fonction de calcul du bulletin
**Fichier :** nouveau `lib/services/payroll.ts`

**À faire :** fonction pure `computePayslip(employee, settings): PayslipBreakdown` qui prend en entrée les données du salarié et les taux de `lmb_payroll_settings`, et renvoie : salaire brut, IPRES salarié/employeur (avec application du plafond), CSS employeur, IR (application du barème progressif avec quotient familial), salaire net. Fonction pure = aucun appel réseau à l'intérieur, donc testable facilement et vérifiable à la main avec les vrais chiffres de l'employée (200 000 FCFA brut, cible ~29 400 FCFA de cotisations pour recoupement avec ce qui est déjà suivi manuellement).

**Critère d'acceptation :** en injectant les vrais chiffres de l'employée actuelle et les taux par défaut, le résultat du calcul des cotisations doit être cohérent (proche de l'ordre de grandeur des ~29 400 FCFA/mois déjà suivis manuellement) — sert de garde-fou avant tout usage réel. Si l'écart est significatif, taux ou plafond à revoir avant de continuer.

### Tâche D.2.2 — CRUD salariés, génération et historique des bulletins
**Fichier :** `lib/services/payroll.ts` (suite)

**À faire :** `listPayrollEmployees`, `createPayrollEmployee`, `updatePayrollEmployee`, `generatePayslip(employeeId, periodMonth)` (calcule via D.2.1, insère dans `lmb_payslips`, refuse si un bulletin existe déjà pour cette période), `listPayslips(employeeId)`.

### Tâche D.2.3 — Suivi des versements trimestriels
**Fichier :** `lib/services/payroll.ts` (suite)

**À faire :** `listContributionPayments`, `recordContributionPayment` (marquer un trimestre comme payé avec date et montant réel).

### Tâche D.2.4 — Registre des prestataires
**Fichier :** nouveau `lib/services/service-providers.ts`

**À faire :** `listServiceProviders`, `createServiceProvider`, `updateServiceProvider`, `recordProviderPayment`, `listProviderPayments`.

---

## Phase D.3 — Interface

### Tâche D.3.1 — Extension du Registre RH (`/admin/hr`)
**À faire :** nouvel onglet "Salaires & Bulletins" dans la page RH existante : liste des salariés en paie, formulaire de saisie/édition (salaire, primes, parts fiscales), bouton "Générer le bulletin du mois" avec aperçu avant génération, historique des bulletins avec téléchargement PDF. Un onglet "Paramètres de paie" (visible DIRECTION uniquement, comme le reste de la page) pour éditer les taux de `lmb_payroll_settings` avec le rappel de prudence en haut de page.

### Tâche D.3.2 — Génération PDF du bulletin
**À faire :** réutiliser `jspdf` (déjà une dépendance du projet, utilisé pour les tickets de caisse) pour générer un bulletin de paie au format standard : identité employeur/employé, détail des lignes de salaire (base, sursalaire, prime transport), détail des cotisations (IPRES salarié/employeur, CSS employeur), IR retenu, net à payer. Bandeau ou mention en pied de page rappelant que les taux appliqués proviennent de `lmb_payroll_settings` à la date de génération (traçabilité).

### Tâche D.3.3 — Onglet suivi des versements trimestriels
**À faire :** dans le Registre RH, section listant les échéances trimestrielles (calculées automatiquement à partir des bulletins générés sur le trimestre), avec possibilité de marquer un trimestre comme versé (date + montant réel, qui peut différer du calculé si régularisation).

### Tâche D.3.4 — Nouvelle page Prestataires
**Fichier :** nouveau `app/admin/service-providers/page.tsx`

**À faire :** liste des prestataires avec fiche (nom, service, montant habituel, fréquence), bouton pour enregistrer un paiement effectué, historique des paiements par prestataire. Ajouter cette page à `DIRECTION_ONLY_ADMIN_PATHS` dans `lib/services/auth.ts` (cohérent avec le reste RH/paie) sauf décision contraire de la Direction. Ajouter aussi le nouvel onglet de navigation correspondant, en suivant le même principe de filtrage par rôle que le reste de `/admin` (Tâche C.1bis).

**Critère d'acceptation Phase D.3 :** un bulletin PDF généré pour l'employée actuelle avec ses vraies données correspond visuellement et numériquement à ce qu'on attend d'un vrai bulletin de paie sénégalais (aux taux/plafonds près, encore à confirmer). Un CAISSIER ou GERANT n'a accès à aucune de ces pages.

---

## Phase D.4 — Vérification finale

### Tâche D.4.1 — Recoupement avec les vrais chiffres
**À faire :** générer le bulletin de l'employée actuelle avec ses vrais paramètres de contrat, comparer le montant de cotisations calculé aux ~29 400 FCFA/mois déjà suivis manuellement. Si écart important, ajuster les taux dans `lmb_payroll_settings` (pas dans le code) et documenter la source de l'écart.

### Tâche D.4.2 — Confirmation avant usage officiel
**À faire :** avant d'envoyer un bulletin généré par l'application à l'employée ou de s'appuyer dessus pour une déclaration IPRES/CSS/DGID réelle, faire confirmer les taux et plafonds appliqués par un comptable ou via le portail NDAMLI. Ce n'est pas un blocage technique — l'outil reste utilisable en attendant, avec le bandeau de prudence visible.

---

## Ordre d'exécution recommandé
1. Phase D.1 (migrations SQL, fournies prêtes à coller, exécutées par l'utilisateur comme toujours).
2. Phase D.2 (logique de calcul, avec vérification via `npx tsc --noEmit` / `npx eslint` après chaque fichier).
3. Phase D.3 (interface), test réel après chaque tâche.
4. Phase D.4 (recoupement chiffres réels + confirmation avant usage officiel).
