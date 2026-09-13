# Feuille de route — Réduction du nombre de clics (toute l'application)
### Document d'exécution pour Claude Code

Objectif exprimé par l'utilisateur : que l'application entière se pilote avec le moins de clics possible, sans jamais changer la logique métier — on simplifie le geste, pas les règles. Deux volets sont demandés : (1) regrouper visuellement les produits par gamme avec des cases sélectionnables plutôt que de la saisie texte, (2) réduire les clics partout dans l'app.

## Méthode

Chaque écran est traité en 4 étapes, comme pour les précédents chantiers (audit sécurité, module paie) :
1. **Audit rapide de l'écran concerné** (relecture du code au moment de traiter la phase, pas à l'avance — pour ne pas proposer de changement sur la base d'une lecture superficielle).
2. **Proposition concrète** de ce qui change, présentée avant modification si l'écran est sensible (caisse, paiements).
3. **Implémentation** directement dans le code sur la machine de l'utilisateur.
4. **Vérification** `npx tsc --noEmit` + `npx eslint` sur chaque fichier touché, puis **test réel** par l'utilisateur dans le navigateur avant de passer à la phase suivante.

Aucune migration de base de données n'est requise pour ce chantier (le champ `category_name` sert déjà de "gamme" — confirmé avec l'utilisateur : une gamme = plusieurs produits d'une même marque en différentes déclinaisons, ex. lait/sérum/gel). Un futur ajout de vraies photos produits (l'utilisateur n'en a pas encore) suivra le même principe : une colonne `image_url` nullable à ajouter le moment venu, sans impact sur ce qui existe.

---

## ✅ Écran 1 — Caisse (`app/page.tsx`) : grille produits par gamme — FAIT ET VALIDÉ (2026-09-12)

Remplacement du champ de recherche texte comme seul moyen d'ajouter un produit au panier par une grille de cases cliquables, groupées par gamme (chips de filtre : Toutes, Gamme Bleaching, Gamme Gold, Soins Ciblés, etc., avec le nombre de produits par gamme), avec initiales colorées en attendant les photos, prix et stock affichés, ajout au panier en un seul clic. La recherche texte reste disponible en complément (utile pour un scan code-barres). Testé en réel par l'utilisateur : fonctionnel, y compris le grisage correct d'un produit en rupture de stock.

### Reste à traiter sur cet écran (Phase 1 — à faire)
Repéré lors de l'audit mais pas encore traité :
- La sélection du **client** (VIP ou récurrent) se fait uniquement par recherche texte (`app/page.tsx` ligne ~716, même pattern que l'ancien système produit). Proposition : ajouter une rangée de raccourcis cliquables pour les derniers clients servis dans la boutique / les clients VIP, au-dessus du champ de recherche, sur le même principe que la grille produits.
- Deux `window.confirm(...)` sont utilisés (validation d'annulation de vente, etc. — `app/page.tsx` ligne ~445). Un `window.confirm` bloque tout le navigateur et n'est pas personnalisable ; proposition : les remplacer par une petite boîte de confirmation inline (2 boutons "Confirmer / Annuler" dans l'interface), plus rapide visuellement et cohérente avec le reste de l'app.

---

## Phase 2 — Achats & Fournisseurs (`app/admin/purchases/page.tsx`)

**Constat de l'audit initial :** la création d'un bon de commande se fait via un menu déroulant `<select>` pour choisir le produit (défilement dans une liste de 51 produits) puis saisie manuelle de la quantité et du coût, ligne par ligne.

**Proposition :** remplacer le `<select>` produit par la même grille de cases par gamme que sur la Caisse (réutilisation directe du composant/pattern déjà construit et validé), avec un clic pour ajouter une ligne au bon de commande. La saisie de quantité/coût par ligne reste inchangée (c'est une vraie donnée à renseigner, pas une sélection).

---

## Phase 3 — Tableau de bord Direction/Gérant (`app/admin/page.tsx`)

**Constat de l'audit initial :** page déjà bien organisée en onglets cliquables (Stocks, Rapports d'inventaire, Charges & Bilan, Comparatif, Grille Tarifaire, Registre RH, Grand Livre des Ventes, + Prestataires/Vidéosurveillance/Comptes Marchands pour la Direction) — la navigation entre sections est déjà efficace. Deux points identifiés pour un audit plus poussé en phase :
- Formulaire "Ajouter un produit" (onglet Stocks) : sélection de gamme déjà via `<select>` avec option "Créer nouvelle gamme" — à vérifier si un passage en cases cliquables apporte un vrai gain ici (formulaire de création, pas de vente répétée, donc gain probablement faible).
- Un `window.confirm` bloque la suppression d'un produit (ligne ~404) — même remplacement que sur la Caisse à prévoir pour cohérence.

**Action de cette phase :** audit complet des autres onglets (Rapports d'inventaire, Comparatif, Grand Livre des Ventes) au moment de la traiter, pour repérer d'éventuels formulaires ou recherches à simplifier non détectés par le survol initial.

---

## Phase 4 — Registre RH (`app/admin/hr/page.tsx`)

**Constat de l'audit initial :** deux `window.prompt(...)` successifs sont utilisés pour enregistrer un versement trimestriel de cotisations (montant, puis date) — deux boîtes de dialogue système l'une après l'autre, peu pratique et pas dans le style de l'app.

**Proposition :** remplacer par un petit formulaire inline (les deux champs affichés directement dans la ligne du tableau ou dans une mini-carte dépliée), validé en un clic — même esprit que le formulaire de paiement déjà construit sur l'écran Prestataires.

Le reste de l'écran (onglets Employés / Créer un compte / Pointages / Synthèse heures / Salaires & Bulletins / Paramètres de paie) est déjà organisé en onglets cliquables et jugé correct lors du survol initial — à confirmer lors de l'audit détaillé de cette phase.

---

## Phase 5 — CRM Clients & Fidélité (`app/admin/customers/page.tsx`)

**Constat de l'audit initial :** la liste des clients est chargée une fois puis filtrée instantanément côté navigateur (recherche + filtre VIP), sans aller-retour réseau à chaque frappe — c'est déjà un bon niveau d'efficacité pour un écran de recherche dans une longue liste. Formulaires d'ajustement de points de fidélité identifiés (saisie manuelle du motif) : à revoir lors de l'audit détaillé pour voir si des motifs fréquents peuvent devenir des boutons rapides (ex. "Compensation SAV", "Anniversaire VIP") en plus du champ libre.

---

## Phase 6 — Comptabilité & Finance (`app/admin/finance/page.tsx`)

Pas encore auditée en détail (401 lignes, peu d'éléments interactifs détectés au survol). Audit complet à faire au moment de traiter cette phase.

---

## Phase 7 — Comptes Marchands Wave/Orange Money (`app/admin/merchant-accounts/page.tsx`)

**Constat de l'audit initial :** déjà organisée en 3 onglets cliquables (Soldes, Retraits, Réconciliation). Bonne base ; audit détaillé des formulaires internes de chaque onglet à faire au moment de traiter cette phase.

---

## Phase 8 — Grille Tarifaire (`app/admin/pricing/page.tsx`)

Pas encore auditée en détail (624 lignes, mais peu d'éléments interactifs détectés au survol — probablement de l'édition de prix directement dans le tableau, ce qui est déjà un mode de saisie rapide). Audit complet à faire au moment de traiter cette phase pour confirmer.

---

## Phase 9 — Stocks, Transferts & Inventaires (`app/admin/inventory/page.tsx`, `app/admin/transfers/page.tsx`, `app/admin/audits/page.tsx`)

**Constat de l'audit initial :** `app/admin/inventory/page.tsx` utilise déjà un bouton "Nouveau transfert" ouvrant une fenêtre modale (`TransferModal`) — bon principe. `app/admin/transfers/page.tsx` est une petite page (137 lignes, probablement un historique en lecture seule — faible enjeu clics). `app/admin/audits/page.tsx` (289 lignes) à auditer en détail au moment de la phase.

---

## Phase 10 — Vidéosurveillance & Comparatif Boutiques (`app/admin/surveillance/page.tsx`, `app/admin/comparative/page.tsx`)

Deux écrans majoritairement en lecture seule (tableaux de bord/suivi), donc enjeu de réduction de clics a priori faible. Audit de confirmation à faire au moment de la phase plutôt qu'une refonte anticipée.

---

## Phase 11 — Connexion (`app/login/page.tsx`)

Écran de connexion classique (93 lignes, un seul formulaire email/mot de passe). Priorité basse — un formulaire de connexion a intrinsèquement peu de marge de simplification sans toucher à la sécurité.

---

## Écrans déjà conçus efficacement (pas de phase dédiée prévue)

- **Registre des Prestataires** (`app/admin/service-providers/page.tsx`) et les onglets **Salaires & Bulletins / Paramètres de paie** du Registre RH : construits récemment avec sélection en un clic (liste cliquable → formulaire d'action), déjà dans l'esprit demandé. Revus seulement si l'utilisateur signale une lourdeur précise à l'usage.

---

## Ordre d'exécution recommandé
1. Écran 1 (Caisse) — reste à faire : raccourcis clients + remplacement des `window.confirm`.
2. Phase 2 — Achats & Fournisseurs (grille produits par gamme, réutilisation directe du travail déjà fait).
3. Phase 3 — Tableau de bord Direction/Gérant.
4. Phase 4 — Registre RH (remplacement des `window.prompt`).
5. Phase 5 — CRM Clients.
6. Phase 6 — Comptabilité & Finance.
7. Phase 7 — Comptes Marchands.
8. Phase 8 — Grille Tarifaire.
9. Phase 9 — Stocks, Transferts & Inventaires.
10. Phase 10 — Vidéosurveillance & Comparatif.
11. Phase 11 — Connexion.

Chaque phase se termine par un test réel de l'utilisateur avant de passer à la suivante, comme pour les chantiers précédents.
