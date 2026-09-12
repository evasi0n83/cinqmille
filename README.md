# 5000 · Cockpit

Application JavaScript pour compter les scores du 5000 joué avec cinq dés physiques. Interface mobile en français, 2 à 12 joueurs, paliers avec vies, classement, historique, annulation et sauvegarde automatique sur le téléphone hôte.

## Jouer

1. Saisir les prénoms dans l’ordre des tours et commencer la partie.
2. Additionner les points avec **+100, +200, +500 et +1000**, ou modifier directement le score du tour.
3. Valider pour enregistrer le score et passer au joueur suivant. Les boutons Fail et Big fail terminent également le tour.
4. Toucher un joueur pour consulter tous ses paliers, y compris les paliers barrés.

L’application peut être ajoutée à l’écran d’accueil. Après une première ouverture avec réseau, elle conserve les fichiers utiles pour fonctionner hors ligne sur le téléphone hôte. Les scores restent dans le stockage de ce navigateur et ne sont pas transférés automatiquement entre l’aperçu local et l’adresse GitHub.

## Règles de cette table

- Le score d’un tour s’ajoute au palier actuel. Chaque nouveau palier possède trois vies.
- À zéro, il faut au minimum 400 points pour entrer ou revenir en jeu. Un score inférieur reste non validable ; Fail reste disponible.
- Atteindre exactement un palier adverse le barre, même s’il est ancien. Tous les paliers adverses correspondants sont concernés.
- Fail retire une vie au palier actuel ; Big fail en retire deux. À zéro vie, le palier est barré.
- Un palier actuel barré fait revenir le joueur au dernier palier encore valide, qui conserve ses vies. Sans palier valide, retour à zéro.
- Le repli ne déclenche pas lui-même de collision avec un adversaire.
- Il faut atteindre exactement 5 000 pour gagner. Un dépassement est un fail.
- L’annulation reconstitue toute la partie avant le dernier tour, y compris les barrages subis par les adversaires.

## Développement

Node.js 22 ou supérieur.

```sh
npm ci
npm test
npm run build
npm run dev
```

L’aperçu est disponible à `http://127.0.0.1:5173/`. `src/game.js` contient le moteur indépendant de l’interface. `src/app.js` gère le Cockpit ; `src/live.js` gère la connexion au service de synchronisation.

Le build écrit `dist/` pour l’aperçu et `docs/` pour GitHub Pages. Les chemins relatifs fonctionnent sous `/cinqmille/`. Le service worker possède un identifiant dérivé du contenu de chaque build.

## GitHub Pages

Dans **Settings → Pages**, choisir **Deploy from a branch**, puis **main /docs**. Le dossier `docs/` compilé est suivi dans Git ; aucun serveur Node n’est nécessaire sur GitHub.

Pour publier une modification : exécuter les tests et le build, puis pousser les sources ainsi que le dossier `docs/` actualisé. GitHub Pages republie les fichiers.

## Spectateurs en direct

Le code du mode spectateur est fourni, mais il ne fonctionne qu’après configuration d’un projet Supabase. Sans configuration, la partie locale est entièrement utilisable et le bouton d’invitation indique que le direct n’est pas activé.

1. Dans un projet Supabase neuf, exécuter `supabase/setup.sql` dans SQL Editor.
2. Activer **Anonymous Sign-Ins** dans les réglages Authentication. Le schéma `cockpit_private` doit rester hors des schémas exposés de l’API.
3. Copier `.env.example` vers `.env.local` et renseigner l’URL du projet et sa **publishable key** (ou sa clé publique `anon`). Le build refuse les clés secrètes et `service_role`.
4. Reconstruire et republier `docs/`.
5. Sur le téléphone hôte, choisir **Inviter des spectateurs**. Les autres ouvrent le lien ou scannent le QR code.

Supabase conserve un instantané de la partie et le diffuse par Realtime. L’identité anonyme de l’hôte est enregistrée dans son navigateur. Les spectateurs reçoivent un droit de lecture ; ni le lien ni l’interface ne leur donnent un droit de saisie. L’autorisation est vérifiée côté base. Les clés d’invitation sont stockées sous forme de hash dans une table privée et ne passent pas dans les événements Realtime.

Les mises à jour sont numérotées pour éviter les écrasements concurrents. Une perte de connexion conserve la partie locale et déclenche des nouvelles tentatives ; le bouton Réessayer reste disponible. Une reprise du navigateur rétablit l’abonnement. Une reconnexion recharge le dernier état, sans rejouer toutes les anciennes animations.

Conserver le stockage du navigateur hôte pour garder sa partie et son identité de saisie. Une connexion Internet est nécessaire au direct ; les animations peuvent avoir une légère latence entre appareils.

## Vérification

Les tests automatisés couvrent l’entrée à 400, les paliers cumulatifs, les pertes de vie, les collisions actuelles et anciennes, les replis, le dépassement, la victoire exacte, l’ordre des tours, l’annulation et la reconstruction d’une sauvegarde.

La connexion à Supabase et les droits réels doivent être vérifiés après configuration avec trois sessions distinctes : hôte, spectateur invité et utilisateur non invité. Le spectateur doit échouer sur la RPC d’écriture et sur les écritures REST directes ; l’utilisateur non invité ne doit lire aucune partie.

Références : [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [Supabase Anonymous Sign-Ins](https://supabase.com/docs/guides/auth/auth-anonymous), [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes), [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).

