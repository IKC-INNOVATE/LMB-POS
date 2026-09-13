# Audit LMB POS — 27 août 2026

Application: Next.js + Supabase, dossier local "LMB POS" (boutique cosmétiques, Dakar & Abidjan).

## Constats critiques
1. La caisse (app/page.tsx) vend un panier fictif, non relié à lmb_products ; aucune vente ne déduit le stock réel.
2. Login = PIN codé en dur côté client ("1234"/"0000"), aucune vraie authentification, aucun rôle.
3. Aucune RLS/policy trouvée dans les migrations Supabase → base potentiellement ouverte via la clé anon publique.
4. Webhook /api/attendance/webhook sans authentification (faux pointages possibles).
5. Deux formats incompatibles écrits dans lmb_transfers (inventory.ts vs app/admin/page.tsx) → confirmTransfer() casse sur les transferts créés par l'admin.

## Constats majeurs
- Tables lmb_products/lmb_sales/lmb_customer_orders/lmb_expenses/lmb_attendance absentes des migrations livrées (schéma réel modifié hors versioning).
- Échecs Supabase masqués silencieusement (fallback local) dans sales/register/inventory → "vente enregistrée" affiché même si rien n'est sauvegardé.
- Ticket de caisse affiche toujours paymentMethod "ESPECES" en dur, indépendamment du vrai mode choisi.
- floor_price_xof / isUnderFloorPrice jamais vérifiés à la vente.
- Remise VIP + code promo cumulables sans plafond.
- closeRegister ne filtre pas strictement par store_code → risque de mélange Dakar/Abidjan si double caisse ouverte.
- 5 onglets du dashboard Direction (Comparatif, Vidéosurveillance, Comptes Marchands, Grille Tarifaire, Registre RH) n'ont aucun rendu associé (écrans vides).
- Marge brute affichée = estimation (65% coût par défaut) non signalée comme telle à l'utilisateur.

## Mineurs
- Doublons de champs clients (full_name/name, vip_status/statut_vip, loyalty_points/points_fidelite...).
- Refactor UI (composants réutilisables) commencé, appliqué seulement sur purchases/transfers.
- AGENTS.md contient un texte suspect de type prompt-injection ciblant les assistants IA — à faire vérifier/supprimer.
- Pas de séparation de rôles vente/direction.
- Aucun test automatisé dans le repo.

## Livrable
Rapport complet remis en .docx : "Audit_LMB_POS.docx" (8 pages), envoyé à l'utilisateur et déposé dans le dossier "LMB POS" sur son PC.
Feuille de route détaillée pour Claude Code : "ROADMAP_CLAUDE_CODE.md" (18 tâches, 4 phases, fichiers/critères d'acceptation par tâche), envoyée et déposée dans le même dossier.

## Plan d'action (ordre recommandé)
1. Sécuriser : RLS Supabase, vraie authentification par rôle, clé secrète sur le webhook attendance.
2. Fiabiliser le cœur métier : relier la caisse au vrai catalogue + déduction de stock réelle ; unifier les transferts ; ne plus masquer les échecs d'enregistrement.
3. Fiabiliser les chiffres : mode de paiement réel sur le ticket, prix plancher, plafond de remises, marge basée sur le coût réel, clôture de caisse par boutique.
4. Nettoyer : décider du sort des 5 onglets vides, compléter les migrations manquantes, finir le refactor UI, nettoyer les doublons de champs, vérifier AGENTS.md.

## Avancement (exécution via Claude Code, à partir du 27/08/2026)

### Phase 0 — Sécurité : TERMINÉE ET TESTÉE ✅
(RLS activée, authentification par rôle via Supabase Auth, webhook attendance sécurisé — voir détail complet dans le projet Claude)

### Phase 1 — Cœur métier : TERMINÉE ET TESTÉE ✅
(catalogue réel en caisse, décrément de stock transactionnel, audit anti-faux-succès, transferts unifiés — voir détail complet dans le projet Claude)

### Phase 2 — Fiabiliser les chiffres : TERMINÉE ET TESTÉE ✅
(mode de paiement réel sur ticket, prix plancher, plafond de remises à 30%, marge sur coût réel avec badge d'estimation — voir détail complet dans le projet Claude)

### Phase 3 — Nettoyage : TERMINÉE ✅ (29/08/2026)
- AGENTS.md, migrations manquantes, 5 onglets vides du dashboard Direction, tests automatisés (41 tests), doublons de champs clients : tous terminés et vérifiés.
- Refactor UI (composants réutilisables) : terminé — les 4 derniers champs bruts convertis (`app/admin/pricing/page.tsx`, `app/page.tsx`), champs de caisse à fond clair volontairement laissés tels quels.
- Nettoyage de données : terminé. Migration `20260916_add_sales_status_fix_store_names.sql` — ajout des colonnes `status`/`voided_reason` sur `lmb_sales`, vente annulée correctement marquée, fusion des 9 ventes "LMB Boutique Abidjan (Cocody)" vers "ABIDJAN" (846 000 FCFA désormais bien comptés dans les totaux Abidjan). Vérifié : DAKAR 15 / ABIDJAN 10, COMPLETED 24 / CANCELLED 1.
- Tables orphelines `public.sales` et `public.sale_items` : supprimées (migration `20260917_drop_orphan_sales_table.sql`, vérifiées vides et sans référence dans le code avant suppression).

### Prochaine étape
Il ne reste plus qu'un seul point ouvert, hors code pour l'instant :
- Brancher le pointage automatique par caméra une fois l'internet Dakar disponible et la capacité API des caméras confirmée (suivi sur `/admin/surveillance`).

Toutes les autres tâches de l'audit du 27/08/2026 sont terminées et vérifiées.
