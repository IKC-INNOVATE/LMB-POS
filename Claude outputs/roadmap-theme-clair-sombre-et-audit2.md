# Feuille de route — Thème clair/sombre + 2ᵉ audit de réduction des clics (2026-09-12)

Suite à la demande : *"L'application est un peu sombre, je peux avoir un ton un peu plus clair"* et *"faire un audit pour réduire le nombre de clics"*. L'utilisateur a choisi l'option **bouton pour choisir clair/sombre** (plutôt que d'adoucir simplement le sombre actuel, ou de tout passer en clair).

Comme d'habitude : ce document liste le plan avant toute modification. Rien n'est encore touché dans le code.

---

## Partie 1 — Bouton de thème clair/sombre

### Ce que ça va donner pour l'utilisateur

Un petit bouton (icône soleil / lune) visible en permanence en haut de l'écran, sur toutes les pages. Un clic bascule toute l'application entre le thème sombre actuel et un thème clair. Le choix est mémorisé automatiquement : une fois choisi, il reste actif la prochaine fois qu'on ouvre l'application, sans avoir à le refaire.

### Pourquoi ce n'est pas un simple réglage de couleur

L'application n'a pas été construite avec un "mode clair" caché quelque part qu'il suffirait d'activer. Chaque écran a ses couleurs écrites en dur (fonds gris très foncés, textes blancs, bordures foncées). Il faut donc, écran par écran, donner à chaque élément **deux couleurs possibles** (une pour le sombre, une pour le clair) et un mécanisme central qui dit à tout moment "on est en mode clair" ou "on est en mode sombre".

Ampleur mesurée dans le code (nombre d'endroits à traiter par écran) :

| Écran | Endroits concernés |
|---|---|
| Tableau de bord / Expédition (`app/admin/page.tsx`) | ~40 |
| Registre RH | ~32 |
| CRM Clients | ~15 |
| Comptes marchands | ~13 |
| Caisse (écran principal) | ~12 |
| Achats & Fournisseurs | ~12 |
| Prestataires | ~10 |
| Finance | ~9 |
| Comparatif boutiques | ~8 |
| Audits stock | ~8 |
| Tarification | ~5 |
| Transferts, Surveillance, Connexion, Promotions, Inventaire | quelques-uns chacun |

Total : environ **170 endroits** à adapter dans toute l'application. C'est pour cela que ce chantier est découpé en plusieurs petites phases, exactement comme pour la réduction des clics : une phase = un écran = vérification technique + votre test réel, avant de passer au suivant.

### Plan en phases

**Phase A — Fondation (invisible ou presque)**
Mise en place du mécanisme central : le bouton clair/sombre lui-même (visible partout), la mémorisation du choix, et le réglage technique qui permet ensuite à chaque écran de réagir au changement. À ce stade, seul le bouton apparaît ; les écrans restent sombres tant qu'ils n'ont pas été adaptés (phases suivantes).

**Phase B — Caisse** (`app/page.tsx`, l'écran le plus utilisé au quotidien)

**Phase C — Tableau de bord / Expédition** (le plus gros écran, ~40 endroits)

**Phase D — Registre RH**

**Phase E — CRM Clients**

**Phase F — Comptes marchands**

**Phase G — Achats & Fournisseurs**

**Phase H — Prestataires**

**Phase I — Finance**

**Phase J — Comparatif boutiques + Audits stock**

**Phase K — Petits écrans restants** (Transferts, Surveillance, Connexion, Promotions, Inventaire, Tarification) — regroupés car chacun a très peu d'endroits à changer.

Chaque phase suit la même méthode que d'habitude : modification → vérification technique (`tsc`/`eslint`) → votre test réel avant de passer à la suivante. Aucune migration de base de données n'est nécessaire pour ce chantier (uniquement de l'apparence).

### Point d'attention

Le thème sombre actuel restera le thème par défaut (rien ne change pour ceux qui ne touchent pas au bouton). Le thème clair sera construit à partir des couleurs déjà présentes dans les réglages de l'application (fond crème, texte anthracite, accents dorés) — cohérent avec l'identité visuelle déjà choisie pour la marque.

---

## Partie 2 — Deuxième audit de réduction des clics

Après le chantier des 11 phases déjà terminé et validé, j'ai repassé l'ensemble de l'application à la recherche de nouveaux points de friction : fenêtres de confirmation restantes, listes déroulantes qui gagneraient à devenir des grilles cliquables, champs de recherche nécessitant un clic supplémentaire, formulaires qui ne restent pas ouverts pour des saisies répétées.

### Résultat : rien de bloquant trouvé

- **Confirmations** : plus aucune fenêtre `window.confirm`/`window.prompt` nulle part dans l'application — tout a déjà été remplacé par les boutons "Confirmer / Annuler" intégrés lors du premier chantier.
- **Recherches** : tous les champs de recherche filtrent déjà en direct (pas de bouton "Rechercher" à cliquer en plus).
- **Listes déroulantes restantes** (comptes marchands, statut VIP client, type de remise, fréquence prestataire, magasin pour l'audit stock...) : toutes ne proposent que 2 à 3 choix fixes. Les transformer en grille de tuiles cliquables (comme pour les produits) n'apporterait aucun gain réel — une liste à 2-3 choix est déjà aussi rapide qu'une tuile.

### Une piste mineure, à votre discrétion (pas un vrai problème)

Aucun champ de recherche ou de saisie rapide ne réagit à la touche "Entrée" pour valider (il faut toujours cliquer sur un bouton). Ce n'est pas un problème de nombre de clics à proprement parler, plutôt un confort clavier pour les utilisateurs à l'aise avec un clavier. Amélioration facultative, à faire seulement si vous le souhaitez — je ne la lance pas sans votre accord.

**Conclusion de ce 2ᵉ audit : le chantier de réduction des clics est déjà, dans les faits, terminé. Rien de nouveau à corriger dans ce domaine pour l'instant.**

---

## Prochaine étape proposée

Je démarre la **Phase A (fondation du bouton clair/sombre)** dès votre feu vert, puis j'enchaîne écran par écran (Phase B, C, ...) en vous faisant tester après chacune, comme d'habitude.
