# Audit professionnel — Sécurité backend & Qualité frontend
### LMB POS — 12 septembre 2026

Ce document couvre deux audits distincts, réalisés directement sur le code et la configuration du projet (pas seulement sur l'apparence) :

1. **Sécurité backend** : ce qui protège (ou pas) les données de l'entreprise et de ses clients.
2. **Qualité frontend** : ce qui rend l'application plus solide, plus accessible et plus facile à faire évoluer, au-delà de l'apparence déjà traitée précédemment.

**Ce qui n'est PAS refait ici** : les deux audits de sécurité précédents (27/08 et 29/08-12/09) ont déjà traité en profondeur l'authentification, les rôles (CAISSIER/GÉRANT/DIRECTION) et les permissions par table (RLS) — ce travail est terminé, vérifié en conditions réelles, et reste valable. Cet audit se concentre sur tout ce qui n'avait pas encore été regardé : les points d'entrée techniques (API), les dépendances logicielles, la robustesse du code, et l'expérience utilisateur au sens large.

Aucune modification n'a été faite pendant cet audit — c'est une photographie de l'état actuel. La feuille de route en fin de document propose l'ordre de traitement.

---

## PARTIE 1 — Audit de sécurité backend

### 🔴 Critique

**1.1 — Version de Next.js vulnérable à une exécution de code à distance**

Le projet utilise Next.js 16.3.1. Un audit des failles connues (`npm audit`) révèle que cette version est concernée par une faille **critique**, publiquement documentée, permettant à un attaquant non authentifié d'exécuter du code arbitraire sur le serveur dans certaines configurations d'hébergement, ainsi qu'une seconde faille liée au traitement d'images au format AVIF. Un correctif existe déjà (version 16.3.5).

*Pourquoi c'est grave :* une faille "exécution de code à distance" (RCE) permet en théorie à un attaquant de prendre le contrôle du serveur qui héberge l'application, sans avoir besoin d'un compte. C'est le niveau de gravité le plus élevé possible.

*Recommandation :* mettre à jour Next.js vers la version corrigée dès que possible, avant toute mise en production ou tout déploiement public.

### 🟠 Élevé

**1.2 — Bibliothèque `sharp` (traitement d'images) vulnérable**

`npm audit` signale également une faille de sévérité élevée dans `sharp` (bibliothèque utilisée en interne par Next.js pour optimiser les images), liée au traitement de fichiers HEIF. Un correctif existe.

*Recommandation :* mise à jour groupée avec le point 1.1.

### 🟡 Moyen

**1.3 — Aucune limite sur les tentatives d'appel aux points d'entrée techniques (API)**

L'application expose deux points d'entrée techniques utilisables sans navigateur : la création de comptes employés (`/api/staff`) et la réception des pointages caméra (`/api/attendance/webhook`). Les deux sont correctement protégés par une vérification d'identité (jeton de session pour le premier, clé secrète comparée de façon sécurisée pour le second), et les tentatives refusées sur le pointage caméra sont bien journalisées — c'est du bon travail déjà en place.

Ce qui manque : rien n'empêche quelqu'un d'essayer un très grand nombre de fois en très peu de temps (aucune limite de fréquence). Ce n'est pas une porte ouverte, mais cela facilite une tentative de force brute ou une saturation du service (déni de service) si la clé secrète du pointage venait à être devinée ou si le service Supabase applique lui-même une limite trop haute pour ce cas d'usage précis.

*Recommandation :* ajouter une limite de fréquence (ex. X tentatives par minute par adresse IP) sur ces deux routes.

**1.4 — Export CSV des clients : risque d'injection de formule**

Le bouton "Exporter la base clients (CSV)" du CRM produit un fichier bien formé (guillemets et échappement corrects), mais ne neutralise pas les valeurs qui commenceraient par un caractère `=`, `+`, `-` ou `@` (par exemple un nom de client mal intentionné). Ouvert dans Excel ou LibreOffice, un tel caractère en début de cellule peut déclencher l'exécution d'une formule ("injection de formule CSV"), un vecteur d'attaque connu et documenté.

*Risque réel ici :* faible en pratique (il faudrait qu'un client donne délibérément un nom piégé, et que la personne qui ouvre le fichier ignore l'avertissement de sécurité d'Excel), mais la correction est simple et rapide.

*Recommandation :* préfixer d'une apostrophe les valeurs exportées qui commencent par `=`, `+`, `-` ou `@`.

### 🟢 Faible / bonnes pratiques à renforcer

**1.5 — Aucun en-tête de sécurité HTTP configuré**

Le fichier de configuration Next.js (`next.config.ts`) est vide de toute configuration de sécurité (pas de `Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy`, etc.). Ce sont des réglages "filet de sécurité" qui limitent les dégâts en cas de faille ailleurs (par exemple, empêcher que l'application soit chargée dans un cadre invisible sur un autre site — technique de piégeage "clickjacking").

*Recommandation :* ajouter un jeu d'en-têtes de sécurité standard. Ne casse rien côté fonctionnel, aucune migration nécessaire.

**1.6 — Le projet n'est pas versionné avec Git**

Il n'y a pas de dépôt Git sur le projet. Ce n'est pas à proprement parler une faille de sécurité, mais une fragilité opérationnelle : aucun historique des modifications de code, aucune possibilité de revenir en arrière en un clic si une modification pose problème, aucune sauvegarde du code en dehors de l'ordinateur actuel.

*Recommandation :* mettre en place un dépôt Git (même local, ou privé sur GitHub/GitLab), en gardant `.env.local` hors du suivi (déjà prévu dans le `.gitignore` existant).

**1.7 — Journaux techniques (`console.log`) présents dans le code de production**

28 fichiers contiennent des traces techniques (`console.log`/`console.error`) qui restent visibles dans la console du navigateur ou les journaux serveur en production. Aucune ne semble exposer de mot de passe ou de clé secrète (vérifié), mais certaines affichent des détails internes (identifiants, messages d'erreur bruts de la base de données) qui n'ont pas vocation à être publics.

*Recommandation :* passer en revue et retirer/atténuer les traces les plus verbeuses avant une mise en production définitive. Non urgent.

### ✅ Points déjà solides (confirmés pendant cet audit)

- La clé "service_role" (accès total à la base, à ne jamais exposer) n'est utilisée que côté serveur, dans les deux routes API, jamais préfixée `NEXT_PUBLIC_` donc jamais envoyée au navigateur. C'est fait dans les règles de l'art.
- Le webhook de pointage compare la clé secrète avec une méthode résistante aux attaques par mesure de temps (`timingSafeEqual`), et journalise les tentatives refusées avec l'adresse IP.
- La création de comptes employés vérifie le rôle DIRECTION, valide rigoureusement les champs reçus, et annule proprement la création du compte de connexion si l'enregistrement échoue derrière (pas de compte "fantôme").
- Aucune trace de faille d'injection SQL, de `eval()`, ni d'insertion de HTML non filtré (`dangerouslySetInnerHTML`) nulle part dans le code.
- Le système de permissions par rôle (RLS + garde d'interface) reste, à la date de cet audit, cohérent avec les deux audits de sécurité précédents.

---

## PARTIE 2 — Audit d'amélioration frontend

### Qualité et fiabilité du code

**2.1 — Dette technique mesurée : 133 erreurs et 73 avertissements (analyse automatique du code)**

Une analyse complète du code (`eslint`) sur l'ensemble de l'application relève 133 erreurs et 73 avertissements, essentiellement de trois natures :
- **93 usages du type `any`** (un type "générique" qui désactive la vérification de cohérence de TypeScript à cet endroit précis — chaque `any` est un endroit où une erreur de manipulation de données ne serait pas détectée avant l'exécution).
- **66 variables ou imports déclarés mais jamais utilisés** (code mort, sans risque mais qui alourdit la lecture).
- **19 apostrophes non échappées** dans du texte affiché (cosmétique, aucun risque, mais signalé par les standards React).
- **12 mises à jour d'état React faites directement dans un effet** (`useEffect`), un anti-pattern qui peut provoquer des rafraîchissements en cascade inutiles.

*Pourquoi c'est important :* ce n'est pas visible pour l'utilisateur final aujourd'hui, mais chaque `any` ou variable inutilisée rend le prochain changement de code un peu plus risqué (bug caché plus facile à introduire, plus difficile à repérer). C'est de la dette qui s'accumule silencieusement.

*Recommandation :* un nettoyage progressif, fichier par fichier, en profitant des prochaines modifications sur chaque écran plutôt qu'un chantier dédié à part (plus économique).

**2.2 — Aucune page d'erreur ni page "introuvable" personnalisée**

Il n'existe aucun fichier `error.tsx` ni `not-found.tsx` dans l'application (des fichiers spéciaux que Next.js sait afficher automatiquement si un écran plante ou si une adresse n'existe pas). En cas de bug inattendu ou de lien cassé, l'utilisateur tombe sur un écran générique et technique, sans indication ni moyen de revenir en arrière.

*Recommandation :* ajouter ces deux pages avec un message rassurant en français et un bouton de retour à la Caisse — travail simple, aucune logique métier à toucher.

**2.3 — Zéro test automatisé sur l'interface**

6 fichiers de tests automatisés existent déjà et couvrent bien la logique de calcul (prix, stock, fidélité, caisse) — c'est du bon travail. En revanche, aucun des 33 écrans/composants d'interface n'a de test automatisé : chaque changement visuel (comme ceux faits récemment sur les couleurs) ne peut être vérifié que manuellement, écran par écran.

*Recommandation :* non urgent vu la taille de l'équipe, mais à garder en tête si l'application continue de grossir — quelques tests sur les écrans les plus critiques (Caisse, clôture de caisse) seraient le meilleur retour sur investissement.

### Accessibilité

**2.4 — Aucune étiquette d'accessibilité (`aria-label`) sur les boutons à icône seule**

Aucun des boutons de l'application n'utilise d'étiquette d'accessibilité. Pour un utilisateur voyant au clavier/souris ce n'est pas gênant, mais un bouton qui n'affiche qu'une icône (une croix pour supprimer, une flèche de pagination) est annoncé de façon incompréhensible par un lecteur d'écran, et rend l'application non utilisable pour une personne malvoyante.

*Recommandation :* ajouter une étiquette sur les boutons à icône seule au fil des prochaines retouches d'écran. Pas urgent pour un usage interne, mais bonne pratique à adopter.

### Expérience utilisateur

**2.5 — Pas de photo produit dans le catalogue**

Le catalogue (Caisse, Achats) utilise des tuiles colorées avec les initiales du produit — un système qui fonctionne bien et a été mis en place récemment pour réduire les clics. Une évolution possible à terme : permettre d'ajouter une photo par produit, pour une reconnaissance visuelle encore plus rapide en caisse (utile avec un plus grand catalogue). Ce n'est pas un défaut, juste une piste d'amélioration future à évaluer selon vos priorités.

**2.6 — Cohérence des indicateurs de chargement**

Un premier passage rapide montre des styles différents d'un écran à l'autre pour indiquer "ça charge" (texte simple "Chargement..." à certains endroits, rien du tout à d'autres). Rien de bloquant, mais harmoniser ce point donnerait une impression plus soignée et professionnelle.

### ✅ Points déjà solides (confirmés pendant cet audit)

- Aucune image (`<img>`) mal formée ou sans texte alternatif — car l'application n'utilise actuellement aucune image classique, seulement des tuiles/icônes générées, ce qui évite ce problème par construction.
- La base de tests automatisés sur la logique métier (calculs, stock, fidélité) est un vrai point fort, rare pour un projet de cette taille.
- Le travail récent sur le thème clair/sombre et la taille des textes a déjà traité une bonne partie des sujets de lisibilité les plus visibles.

---

## Feuille de route proposée

Comme d'habitude : traitement phase par phase, vérification technique (`tsc`/`eslint`) après chaque changement, toute migration SQL fournie en fichier `.sql` à exécuter vous-même dans Supabase. Rien n'est commencé — en attente de votre feu vert.

### Phase 1 — Sécurité, priorité immédiate
- 1.1 Mise à jour de Next.js (faille critique) et 1.2 mise à jour de `sharp` (faille élevée).
- 1.3 Limite de fréquence sur les deux routes API.
- 1.4 Protection de l'export CSV contre l'injection de formule.

### Phase 2 — Sécurité, renforcement
- 1.5 En-têtes de sécurité HTTP.
- 1.7 Nettoyage des traces techniques (`console.log`) les plus sensibles.
- (1.6 mise en place de Git : à faire quand vous le souhaitez, en dehors de ce chantier de code — je peux vous accompagner si besoin.)

### Phase 3 — Fiabilité frontend
- 2.2 Pages d'erreur / "introuvable" personnalisées.
- 2.6 Harmonisation des indicateurs de chargement.

### Phase 4 — Qualité de code (en continu, pas un bloc à part)
- 2.1 Nettoyage progressif des `any`/variables inutilisées, au fil des prochaines retouches par écran plutôt qu'en un seul chantier.

### Non planifié pour l'instant (à votre discrétion)
- 2.4 Étiquettes d'accessibilité — bonne pratique, pas urgent pour un usage interne.
- 2.5 Photos produits — évolution fonctionnelle, à cadrer séparément si vous le souhaitez.
- 2.3 Tests automatisés d'interface — à reconsidérer si l'équipe ou l'application grossit.

**Dites-moi par quelle phase commencer.**
