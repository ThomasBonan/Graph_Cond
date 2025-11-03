Graph_Cond
===========

Application Svelte pour creer, stocker et exploiter des schemas de configuration
produits. Ce dossier contient le client (Svelte + Vite), l API Express/SQLite et
les scripts Docker/AP pour un deploiement simple sur site (ex. Raspberry Pi).

Sommaire rapide
---------------

- [Prise en main](#prise-en-main)
- [Utilisation](#utilisation)
- [Authentification](#authentification)
- [Aide in-app et README rapide](#aide-in-app-et-readme-rapide)
- [Structure du projet](#structure-du-projet)
- [Maintenance et sauvegardes](#maintenance-et-sauvegardes)
- [Optimisations frontend](#optimisations-frontend)
- [Deploiement](#deploiement)

Prise en main
-------------

1. **Prerequis**
   - Node.js 18 ou plus et npm.
   - Docker et Docker Compose (v2) pour l execution conteneurisee.
2. **Installation**
   ```bash
   npm install
   ```
3. **Lancement complet via Docker** (frontend + API + base SQLite)
   ```bash
   docker compose up --build
   ```
   - Frontend Vite preview disponible sur `http://localhost:4173`.
   - API Express sur `http://localhost:3000`.
4. **Mode developpeur (sans Docker)**
   ```bash
   npm run dev        # lance le frontend Vite
   npm run server     # lance l API Express (port 3000)
   ```
5. **Configuration**
   - Copier `.env.template` vers `.env`, puis renseigner `JWT_SECRET`, la duree de vie des tokens, les identifiants bootstrap, etc.
   - Adapter eventuellement `VITE_API_BASE` si le frontend est servi derriere un proxy different.
   - Le dossier `data/` (SQLite) est persistant: montez-le en volume ou sauvegardez-le regulierement.

Utilisation
-----------

- **Mode editeur**
  - Connexion requise pour creer ou modifier des schemas.
  - Nommer le schema puis cliquer sur `Enregistrer` ou `Mettre a jour`.
  - `Dupliquer` cree une copie pour iterer rapidement.
  - `Archiver` retire un schema de la liste principale tout en le laissant restaurable depuis la section "Schemas archives".
  - Le bouton `Voir les logs` (compte bootstrap) ouvre l audit et liste toutes les operations.
  - `Supprimer` retire un schema existant (confirmation demandee).
  - Undo/Redo disponibles tant que la session reste ouverte.
  - Un brouillon local est sauvegarde automatiquement et restaurable via `Restaurer`.
- **Mode configurateur**
  - Lecture seule des schemas enregistres.
  - Liste deroulante pour charger un schema, filtrage par groupe/gamme et barre de recherche.
  - Import/Export JSON pour partager un schema.
  - `Reinitialiser` efface la selection en cours sans toucher a la base.
- **Notifications et toasts**
  - Toutes les operations sensibles (import, export, sauvegarde, erreurs API) declenchent un toast.

Authentification
----------------

- Un compte administrateur peut etre injecte via les variables `BOOTSTRAP_USERNAME` et `BOOTSTRAP_PASSWORD`.
- Les utilisateurs se connectent depuis le menu burger, l API renvoie un JWT stocke en cookie HttpOnly.
- Les cookies sont configurables via `JWT_COOKIE_*` dans `.env`.
- Les tokens sont rafraichis (rolling session) tant que l utilisateur reste actif.

Aide in-app et README rapide
----------------------------

- Un bouton `?` en bas a droite ouvre un overlay avec:
  - un guide rapide du mode courant;
  - un onglet README utilisant `src/lib/readme-content.js`.
- Le menu burger comprend egalement un bouton `README` qui ouvre `public/docs/app-readme.html`
  (version legere du present document, pratique hors connexion).
- Mettre a jour `src/lib/readme-content.js`, `public/docs/app-readme.html` et ce `README.md` en parallele
  pour garder les contenus coherents.

Structure du projet
-------------------

- `src/` - client Svelte (TopBar, GraphPane, stores, toasts, overlay d aide, etc.).
- `server/` - API Express/SQLite (CRUD schemas, auth utilisateurs).
- `public/` - assets statiques servis tels quels (manifest, service worker, README rapide HTML).
- `data/` - base SQLite persistee (montee en volume via Docker).
- `scripts/` - utilitaires (ex. generation base, backup).
- `Dockerfile` + `docker-compose.yml` - configuration runtime pour frontend + API.

Maintenance et sauvegardes
--------------------------

- Sauvegarder regulierement `data/schemas.db` (volume Docker) pour eviter les pertes.
- `docker compose down` n efface pas la base tant que le volume `data/` reste present.
- Pour un deploiement Raspberry Pi, garder les services legers: API Express + SQLite suffisent.
- Raccourcis clavier clefs:
  - `Ctrl/Cmd + S` : sauver le schema dans la base.
  - `Ctrl/Cmd + F` : focus barre de recherche et ouverture du menu.
  - `Escape` : fermer menu, aide ou formulaire de connexion.
- Endpoint d audit: `GET /api/schemas/:id/audit` (auth requis) pour suivre creations, archivages et suppressions.

Support
-------

- Bouton `?` (overlay) pour wiki embarque et liens utiles.
- Toaster un message d erreur si une operation echoue, puis consulter l onglet README pour la procedure.

Optimisations frontend
----------------------

- Pre-calculer et mettre en cache certaines requetes (ex: liste simple des schemas) cote client pour reduire la charge lorsque plusieurs utilisateurs changent de schema, tout en optimisant au maximum pour eviter la latence.
- Eviter les appels repetes a la base pour des meta-donnees stables (ex: noms de schema) en utilisant les stores Svelte ou un cache IndexedDB/localStorage.
- Les brouillons locaux reposent sur `localStorage`; penser a invalider le cache lors d un logout pour eviter les fuites de donnees.

Deploiement
-----------

- **Build frontend**
  ```bash
  npm run build
  npm run preview   # verification rapide
  ```
- **API autonome**
  ```bash
  npm run server
  ```
  expose l API sur le port `3000` (configurable via `PORT`).
- **Cible Raspberry Pi / edge**
  - Conserver `docker compose up --build` pour demarrer l API + frontend reverse-proxy.
  - Exposer les ports necessaires (`4173`/`3000` ou ceux definis dans `docker-compose.yml`).
  - Sauvegarder le volume `data/` pour ne pas perdre les schemas.
- **Sécurité**
  - Definir un `JWT_SECRET` robuste.
  - Ajuster `JWT_COOKIE_SECURE` et `JWT_COOKIE_SAMESITE` selon le contexte (https vs intranet).
  - Creer les comptes via `POST /api/auth/users` avant mise a dispo.
