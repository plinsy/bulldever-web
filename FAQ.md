# FAQ — AlaminoAI

Réponses aux questions techniques les plus fréquentes sur le fonctionnement de la plateforme.

---

## Sommaire

1. [Architecture générale](#architecture-générale)
2. [Authentification et rôles](#authentification-et-rôles)
3. [Simulation du trafic](#simulation-du-trafic)
4. [Gestion des accidents](#gestion-des-accidents)
5. [Pathfinding — Plus court chemin](#pathfinding--plus-court-chemin)
6. [Prédiction de l'heure de départ](#prédiction-de-lheure-de-départ)
7. [Prédiction de congestion](#prédiction-de-congestion)
8. [Assistant IA (Chatbot)](#assistant-ia-chatbot)
9. [API backend](#api-backend)
10. [Base de données](#base-de-données)
11. [Zones géographiques](#zones-géographiques)
12. [Déploiement et configuration](#déploiement-et-configuration)

---

## Architecture générale

### Q : Quelle est la stack technologique de l'application ?

| Couche | Technologie |
|--------|-------------|
| Frontend | Next.js (React), Three.js / React Three Fiber |
| Backend | Django REST Framework (Python) |
| Base de données | SQLite (dev) / PostgreSQL (prod) |
| IA | Google Gemini 2.0 Flash |
| Carte | OpenStreetMap via API Overpass |
| Conteneurisation | Docker / Docker Compose |

### Q : Comment le frontend et le backend communiquent-ils ?

Via une API REST HTTP. Le frontend envoie des requêtes Axios avec un **token d'authentification DRF** injecté automatiquement dans chaque en-tête `Authorization: Token <token>`. Le backend tourne sur le port `8000`, le frontend sur le port `3000`.

### Q : D'où viennent les données des routes affichées sur la carte ?

Les routes sont chargées **en direct depuis l'API Overpass d'OpenStreetMap** au démarrage de la page (`web/components/world/geo.ts`, hook `useOsmRoads()`). Elles représentent le réseau routier réel d'Antananarivo. Elles sont également stockées côté backend dans le modèle `RoadSegment` pour les calculs de pathfinding et de densité.

### Q : Quel est le flux de données général de la simulation ?

```
OSM Overpass → CarSystem (500 voitures, 60 fps)
    │
    ├── toutes les 5 s → POST /api/traffic-stats/  → TrafficSnapshot (BDD)
    ├── à chaque accident → POST /api/accidents/   → Accident (BDD)
    └── onMetrics() → TrafficStatsPanel + AccidentPanel (UI)

Utilisateur (Dashboard)
    ├── GET  /api/users/blocked-roads/
    ├── GET  /api/shortest-path/
    ├── POST /api/depart/calculate/
    ├── GET  /api/users/traffic-management/  (agents uniquement)
    └── POST /api/chatbot/
```

---

## Authentification et rôles

### Q : Quels sont les rôles disponibles dans l'application ?

| Rôle | Valeur en base | Description |
|------|---------------|-------------|
| Usager | `usager` | Citoyen standard |
| Pompier | `pompier` | Services d'incendie |
| Urgences | `urgence` | Services médicaux d'urgence |
| Agent de circulation | `agent` | Police routière |

### Q : Comment fonctionne l'authentification ?

L'application utilise l'authentification par **Token DRF** (`rest_framework.authtoken`). À la connexion, le backend retourne un token opaque. Ce token est stocké dans `localStorage` et injecté automatiquement dans chaque requête Axios. Il est révoqué lors de la déconnexion (`POST /api/users/logout/`).

### Q : Comment les permissions sont-elles vérifiées côté backend ?

Via des classes de permission Django personnalisées (fichier `server/users/permissions.py`) :

| Classe | Rôles autorisés |
|--------|----------------|
| `IsUsager` | `usager` |
| `IsAgent` | `agent` |
| `IsEmergencyRole` | `pompier`, `urgence` |
| `IsAnyRole` | tous les rôles authentifiés |

### Q : Et côté frontend, comment les pages sont-elles protégées ?

Le composant `RequireAuth` (`web/components/auth/RequireAuth.tsx`) encapsule chaque page protégée. Si l'utilisateur n'est pas authentifié → redirection vers `/auth`. Si son rôle ne correspond pas → redirection vers `/unauthorized`.

### Q : L'onglet "Gestion du trafic" est-il accessible à tous ?

Non. Il est **réservé aux agents** (`role = "agent"`). Les autres rôles voient uniquement les onglets : Routes bloquées, Meilleur chemin, Heure de sortie.

---

## Simulation du trafic

### Q : Combien de voitures sont simulées et comment sont-elles créées ?

**500 voitures** (`MAX_CARS`) sont créées au chargement dans `CarSystem.tsx`. Chaque voiture est assignée aléatoirement à une route OSM et possède une vitesse de base, un décalage de voie et une position initiale.

### Q : Comment la vitesse des voitures varie-t-elle selon l'heure ?

La vitesse effective est multipliée par `0.2 + peakFactor × 0.8` :

| Tranche horaire | `peakFactor` | Comportement |
|----------------|-------------|--------------|
| 7h–9h et 16h–19h | 0.8 | Heure de pointe, trafic dense |
| 10h–15h | 0.4 | Trafic modéré |
| Autres heures | 0.15 | Trafic fluide (nuit) |

### Q : Comment est détectée une voiture "à l'arrêt" ?

Une voiture est considérée à l'arrêt si sa vitesse effective est inférieure au seuil `STOPPED_SPEED_THRESHOLD = 0.0003` unités/frame, ce qui correspond à ~0 km/h réel.

### Q : Comment sont détectées les intersections ?

Automatiquement depuis les données OSM : **tout point de terminaison de route partagé par au moins 2 segments** est identifié comme une intersection. Une voiture est comptée "en intersection" si elle se trouve à moins de `INTERSECTION_RADIUS` (~10 m en coordonnées de scène) d'un tel point.

### Q : Comment la vitesse en scène est-elle convertie en km/h ?

```
metersPerFrame   = sceneSpeed / METER
metersPerSecond  = metersPerFrame × 60   (60 fps)
kmh              = metersPerSecond × 3.6
```

### Q : Que signifient les couleurs du panneau HUD ?

Le statut d'une zone est calculé à partir du **taux d'arrêt** (`stopped / total × 100`) :

| Couleur | Statut | Taux d'arrêt |
|---------|--------|-------------|
| 🔴 Rouge | Saturé | > 40 % |
| 🟠 Orange | Ralenti | 20 – 40 % |
| 🟢 Vert | Fluide | < 20 % |

### Q : À quelle fréquence les snapshots sont-ils envoyés au backend ?

Toutes les **5 secondes**, le frontend envoie un `POST /api/traffic-stats/` avec l'état complet de la simulation (nombre de voitures, arrêts, vitesse moyenne, stats par zone et par intersection).

---

## Gestion des accidents

### Q : Comment les accidents sont-ils générés ?

La simulation génère aléatoirement des accidents dans `CarSystem.tsx`. Deux types existent :

| Type | Description |
|------|-------------|
| `bodily` | Accident corporel (blessés) — icône 🚨 |
| `material` | Accident matériel (dommages) — icône ⚠️ |

Chaque accident inclut les plaques d'immatriculation simulées des véhicules impliqués et un horodatage. Au maximum **1 accident corporel et 1 accident matériel** sont affichés simultanément sur la carte.

### Q : Comment les accidents sont-ils stockés côté backend ?

Via `POST /api/accidents/` avec les coordonnées de scène Three.js (`scene_x`, `scene_z`) et le type (`bodily: true/false`). Ils sont stockés dans la table `Accident`.

### Q : Qu'est-ce qu'un "hotspot" d'accidents ?

`GET /api/accidents/` ne retourne pas les accidents individuels mais des **zones à risque récurrentes** calculées par clustering glouton sur les 500 derniers accidents :

- **Rayon de regroupement** : 30 unités de scène
- **Seuil minimal** : 2 accidents pour constituer un hotspot
- **Sévérité** : `"high"` si au moins un accident corporel, `"medium"` sinon
- Le centroïde de chaque cluster est mis à jour par moyenne pondérée à chaque ajout

### Q : Comment appeler les urgences depuis l'application ?

Depuis le panneau `AccidentPanel`, chaque accident corporel affiche un bouton **"Appeler le 117"** (numéro d'urgence national à Madagascar). Un clic déclenche directement l'appel.

---

## Pathfinding — Plus court chemin

### Q : Quel algorithme est utilisé pour calculer l'itinéraire ?

L'algorithme de **Dijkstra** avec tas binaire (`heapq` Python), implémenté dans `server/pathfinding/graph.py`.

### Q : Comment le graphe routier est-il construit ?

1. Chaque point de la géométrie d'un `RoadSegment` devient un **nœud** identifié par `"lat,lng"` (arrondi à 5 décimales)
2. Les nœuds consécutifs sont reliés par des **arêtes bidirectionnelles**
3. Le **poids** d'une arête = `distance_haversine_m × (1 + density)` — les routes congestionnées coûtent plus cher

### Q : Que se passe-t-il si ma position GPS ne correspond à aucun nœud exact ?

L'algorithme recherche le **nœud le plus proche** (`nearest_node`) par balayage linéaire sur tous les nœuds du graphe. Les coordonnées "snappées" sont retournées dans la réponse (`start_snapped`, `end_snapped`).

### Q : Que retourne l'endpoint de pathfinding ?

```json
{
  "path": [{"lat": -18.914, "lng": 47.536}, ...],
  "total_distance_m": 2340.5,
  "node_count": 42,
  "start_snapped": {"lat": -18.9139, "lng": 47.5358},
  "end_snapped": {"lat": -18.8932, "lng": 47.5321}
}
```

La durée estimée en minutes est calculée côté frontend à partir de `total_distance_m` et de la vitesse moyenne actuelle.

### Q : Comment l'utilisateur saisit-il son itinéraire ?

Via un **sélecteur de position sur carte interactive** (`MapPickerModal.tsx`). L'usager clique directement sur la carte pour choisir son point de départ et sa destination — aucune saisie manuelle de coordonnées n'est nécessaire.

---

## Prédiction de l'heure de départ

### Q : Comment fonctionne la prédiction de l'heure de départ ?

L'algorithme simule le trajet **minute par minute** en combinant trois facteurs :

1. **Distance réelle** : distance haversine × facteur de détour structurel par zone
2. **Vitesse de base selon la tranche horaire** :

| Tranche | Label | Vitesse de base |
|---------|-------|----------------|
| 7h–9h et 16h–19h | `peak` | 10 km/h |
| 10h–15h | `mid` | 25 km/h |
| Autres | `off` | 35 km/h |

3. **Congestion temps réel** : des points GPS de congestion optionnels peuvent être passés dans la requête. L'impact est pondéré selon la distance (rayon d'influence : 1,5 km).

Une **marge de sécurité** (`buffer_minutes`) est ajoutée selon la distance et le niveau de trafic global.

### Q : Quels sont les facteurs de détour par zone ?

| Zone | Facteur détour |
|------|---------------|
| Anosizato | × 2.2 |
| Ankorondrano | × 2.0 |
| Isotry | × 1.9 |
| Analakely | × 1.8 |
| Tsaralalana | × 1.7 |
| 67 Ha | × 1.6 |
| Ambohijatovo | × 1.5 |
| Behoririka | × 1.4 |

Ces facteurs reflètent la complexité réelle du réseau routier (sens uniques, carrefours, voies étroites) dans chaque quartier.

### Q : Que retourne l'endpoint de prédiction ?

```json
{
  "safe_departure_time": "07:22",
  "departure_time": "07:27",
  "arrival_time": "08:00",
  "traffic_level": "Sature",
  "advice": "Pars a 07:22"
}
```

Le frontend affiche également jusqu'à **3 créneaux alternatifs** classés du meilleur au moins bon.

---

## Prédiction de congestion

### Q : Comment le système détecte-t-il qu'une congestion est en train de se former ?

L'endpoint `GET /api/predict-congestion/` analyse les **10 derniers snapshots** de simulation pour détecter des tendances :

- **Alerte globale** : si le nombre total de voitures à l'arrêt augmente de plus de **5** entre les deux derniers snapshots
- **Alerte par zone** : si les voitures à l'arrêt dans une zone augmentent de plus de **2** sur les 5 dernières secondes

### Q : Quelle est la structure de la réponse de congestion ?

```json
{
  "status": "ok",
  "timestamp": "2026-05-10T08:03:45Z",
  "prediction_confidence": 0.85,
  "alerts": [
    {
      "type": "zone",
      "zone_id": "analakely",
      "level": "danger",
      "message": "Congestion imminent in analakely"
    }
  ]
}
```

---

## Assistant IA (Chatbot)

### Q : Quel modèle IA alimente le chatbot ?

**Google Gemini 2.0 Flash** avec la fonctionnalité de recherche Google intégrée. La clé API est configurée dans le fichier `.env` sous la variable `GEMINI_API_KEY`.

### Q : Le chatbot connaît-il l'état actuel du trafic ?

Oui. Avant chaque réponse, le backend injecte un **contexte trafic dynamique** (densités, alertes, snapshots récents) dans le prompt envoyé à Gemini. Le chatbot répond donc en tenant compte de la situation en temps réel.

### Q : En quelles langues le chatbot peut-il répondre ?

Malagasy, français et anglais. Il détecte automatiquement la langue de la question et répond dans la même langue.

### Q : Comment est structuré l'appel au chatbot ?

**Requête :**
```json
POST /api/chatbot/
{ "query": "Comment éviter les bouchons à Analakely à 8h ?" }
```

**Réponse :**
```json
{ "response": "À 8h, Analakely est en heure de pointe..." }
```

---

## API backend

### Q : Quelle est l'URL de base de l'API ?

`http://localhost:8000/api` en développement.

### Q : Quels endpoints nécessitent une authentification ?

| Endpoint | Auth requise |
|----------|-------------|
| `POST /users/logout/` | Token (tout rôle) |
| `GET /users/me/` | Token (tout rôle) |
| `GET /users/blocked-roads/` | Token (tout rôle) |
| `GET /users/traffic-management/` | Token (agent uniquement) |
| Tous les autres endpoints | Non (publics) |

### Q : Comment tester l'API manuellement ?

Avec `curl` ou un outil comme Postman/Insomnia. Exemple de connexion :

```bash
curl -X POST http://localhost:8000/api/users/login/ \
  -H "Content-Type: application/json" \
  -d '{"username": "jean", "password": "motdepasse"}'
```

La réponse contient le token à utiliser ensuite dans `Authorization: Token <token>`.

---

## Base de données

### Q : Quels sont les principaux modèles de données ?

| Modèle | Description |
|--------|-------------|
| `RoadSegment` | Tronçon de route OSM avec géométrie, densité et limite de vitesse |
| `TrafficSnapshot` | Instantané de simulation (voitures, vitesse, stats par zone) — envoyé toutes les 5 s |
| `Accident` | Accident signalé avec coordonnées, type et horodatage |
| `UserProfile` | Extension du `User` Django avec le champ `role` |
| `POI` | Point d'intérêt (hôpital, marché, école…) |

### Q : Les snapshots s'accumulent-ils indéfiniment ?

Non. L'endpoint `GET /api/traffic-stats/` accepte un paramètre `limit` (max 200) et retourne les snapshots les plus récents. La prédiction de congestion n'utilise que les **10 derniers** snapshots.

---

## Zones géographiques

### Q : Quelles zones sont actuellement définies ?

Huit quartiers d'Antananarivo :

| ID | Quartier |
|----|---------|
| `analakely` | Analakely — Centre-ville commerçant |
| `anosizato` | Anosizato — Sud-ouest résidentiel |
| `isotry` | Isotry — Centre dense |
| `67ha` | 67 Ha — Nord, zone administrative |
| `ambohijatovo` | Ambohijatovo — Centre-est |
| `tsaralalana` | Tsaralalana — Axes principaux |
| `ankorondrano` | Ankorondrano — Nord commercial |
| `behoririka` | Behoririka — Est résidentiel |

### Q : Comment ajouter une nouvelle zone ?

1. Ajouter une entrée dans `RAW_ZONES` dans `web/components/simulation/zones.ts` :

```typescript
{
  id: "mahamasina",
  label: "Mahamasina",
  south: -18.9230,
  north: -18.9140,
  west:  47.5340,
  east:  47.5460
}
```

Les coordonnées de scène sont recalculées automatiquement. La zone apparaît immédiatement dans le HUD.

2. Pour que la zone soit prise en compte dans la **prédiction de départ**, ajouter également son centre dans `ZONE_CENTERS` et son facteur de détour dans `DETOUR_FACTOR` dans `server/depart/views.py`.

> Outil recommandé pour trouver les coordonnées : [geojson.io](https://geojson.io) ou clic droit sur [OpenStreetMap](https://www.openstreetmap.org).

### Q : Comment les coordonnées GPS sont-elles converties en coordonnées 3D ?

```
x = (lng − 47.5361) × 8000
z = −(lat − (−18.9137)) × 8000
```

Le centre de référence est `{ lat: -18.9137, lng: 47.5361 }` avec un facteur d'échelle `SCALE = 8000`.

---

## Déploiement et configuration

### Q : Comment lancer l'application en local ?

```bash
docker-compose up -d --build
```

- Frontend disponible sur `http://localhost:3000`
- Backend disponible sur `http://localhost:8000`

### Q : Quelles variables d'environnement sont nécessaires ?

| Variable | Usage |
|----------|-------|
| `GEMINI_API_KEY` | Clé API Google Gemini pour le chatbot |
| `SECRET_KEY` | Clé secrète Django |
| `DATABASE_URL` | URL de connexion PostgreSQL (prod) |
| `DEBUG` | `True` en dev, `False` en prod |

### Q : Comment peupler la base de données initiale ?

```bash
# Peupler les routes d'Antananarivo (depuis OSM)
docker exec <backend_container> python manage.py seed_tana

# Créer des utilisateurs de test
docker exec <backend_container> python manage.py seed_users
```

### Q : Où se trouvent les fichiers de configuration clés ?

| Fichier | Rôle |
|---------|------|
| `server/server/settings.py` | Configuration Django (BDD, CORS, auth) |
| `web/next.config.ts` | Configuration Next.js |
| `web/lib/api.ts` | Client Axios (URL de base, injection token) |
| `docker-compose.yml` | Orchestration des conteneurs |
| `web/components/simulation/config.ts` | Constantes de simulation (seuils, vitesses) |
