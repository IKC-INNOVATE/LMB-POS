# Feuille de route technique — LMB POS
### Document d'exécution pour Claude Code
Basé sur l'audit du 27 août 2026 (`Audit_LMB_POS.docx`)

Voir le contenu intégral (18 tâches détaillées, 4 phases, critères d'acceptation) dans le fichier ROADMAP_CLAUDE_CODE.md déjà présent à la racine du dossier LMB POS.

## Journal des évolutions hors audit

Cette section suit les demandes ponctuelles d'Ibrahim qui ne font pas partie des tâches de l'audit (nouvelles fonctionnalités, ajouts au tableau de bord Direction, etc.), traitées au fil de l'eau.

### 29/08/2026 — Onglet Vidéosurveillance & Pointage caméra (Direction)

**Demande :** Ibrahim voulait un endroit pour suivre où en est le projet de vidéosurveillance/pointage par caméra dans les boutiques, sans faire croire que c'est déjà fonctionnel.

**Ce qui a été fait :**
- Nouvelle page `/admin/surveillance`, réservée au rôle DIRECTION, accessible depuis le menu Direction du tableau de bord.
- Bandeau d'explication honnête en haut de page : les caméras sont installées en boutique mais pas opérationnelles, faute (1) de connexion internet à la boutique de Dakar et (2) de vérification que les caméras supportent bien un appel API pour la reconnaissance faciale / le contrôle d'accès.
- Deux cases à cocher éditables — « Internet Dakar prêt » et « Caméras compatibles API confirmées » — chacune avec un champ de notes libres (date prévue, contact fournisseur, etc.).
- Nouvelle table Supabase `lmb_surveillance_status` (migration appliquée) pour stocker ce statut, avec horodatage et nom de la personne ayant fait la dernière mise à jour.
- Précision explicite dans l'interface : ce futur pointage par caméra viendra en **complément** du pointage RH existant (page `/admin/hr`), jamais en remplacement.
- Testé en conditions réelles (sauvegarde, persistance après rechargement, attribution du nom de l'utilisateur connecté), puis remis à l'état réel après le test.
- Non-régression vérifiée sur `/admin/hr` et `/admin/finance`.

**Statut :** terminé et en production. Le développement du pointage automatique par caméra lui-même n'a pas commencé — il ne démarrera qu'une fois les deux cases ci-dessus au vert.

**Note sécurité :** pendant les tests sur `/admin/finance`, un texte injecté dans un résultat d'outil a tenté de se faire passer pour une instruction système demandant d'arrêter d'utiliser les outils et de produire un faux résumé. Il a été identifié comme non légitime et ignoré ; le travail a continué normalement.
