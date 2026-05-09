# Bulldever — Documentation technique

Jumeau numérique du réseau routier d'Antananarivo (Madagascar).  
Stack : **Next.js** (frontend 3D) · **Django REST Framework** (backend) · **SQLite/PostgreSQL** · **Three.js / React Three Fiber**

---

## Table des matières

1. [Architecture générale](#1-architecture-générale)
2. [Authentification & Gestion des rôles](#2-authentification--gestion-des-rôles)
3. [Dashboard utilisateur](#3-dashboard-utilisateur)
4. [Simulation côté frontend](#4-simulation-côté-frontend)
5. [Zones géographiques nommées](#5-zones-géographiques-nommées)
6. [Métriques calculées en temps réel](#6-métriques-calculées-en-temps-réel)
7. [Panneau HUD — TrafficStatsPanel](#7-panneau-hud--trafficstatspanel)
8. [Gestion des accidents](#8-gestion-des-accidents)
9. [Assistant IA — Chatbot](#9-assistant-ia--chatbot)
10. [Pathfinding — Plus court chemin](#10-pathfinding--plus-court-chemin)
11. [Prédiction de l'heure de départ](#11-prédiction-de-lheure-de-départ)
12. [Prédiction de congestion](#12-prédiction-de-congestion)
13. [API backend — endpoints complets](#13-api-backend--endpoints-complets)
14. [Modèles de base de données](#14-modèles-de-base-de-données)
15. [Flux de données complet](#15-flux-de-données-complet)
16. [Ajouter ou modifier une zone](#16-ajouter-ou-modifier-une-zone)

---

## 1. Architecture générale

```
┌──────────────────────────────────────────────────────────────────┐
│  Browser (Next.js)                                               │
│                                                                  │
│  /auth          → AuthPage (connexion / inscription)             │
│  /dashboard     → Dashboard par rôle                            │
│  /              → page.tsx                                       │
│                    ├── Scene.tsx  ──►  CarSystem.tsx (simulation)│
│                    │                       │                     │
│                    │                  onMetrics() ◄─ useFrame    │
│                    │                       │                     │
│                    ├── TrafficStatsPanel.tsx (HUD)               │
│                    ├── AccidentPanel.tsx                         │
│                    └── ChatbotUI.tsx                             │
│                                                                  │
│  POST /api/traffic-stats/    (toutes les 5 s)                    │
│  POST /api/accidents/        (à chaque accident simulé)          │
└────────────────────────────┬─────────────────────────────────────┘
                             │ HTTP REST  (Token auth)
┌────────────────────────────▼─────────────────────────────────────┐
│  Django REST Framework (port 8000)                               │
│                                                                  │
│  /api/users/              → Auth, profil, routes bloquées        │
│  /api/traffic-data/       → Densités par route                   │
│  /api/traffic-stats/      → Snapshots de simulation              │
│  /api/predict-congestion/ → Alertes de congestion                │
│  /api/accidents/          → Signalement & hotspots               │
│  /api/chatbot/            → Assistant IA (Gemini 2.0 Flash)      │
│  /api/shortest-path/      → Pathfinding Dijkstra                 │
│  /api/depart/calculate/   → Prédiction heure de départ           │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Authentification & Gestion des rôles

### Système d'authentification

L'application utilise l'authentification par **Token DRF** (`rest_framework.authtoken`). Le token est stocké dans `localStorage` côté client et injecté dans chaque requête via un intercepteur Axios.

**Fichiers clés :**
- `web/contexts/AuthContext.tsx` — contexte React global (login, register, logout, restauration de session)
- `web/lib/api.ts` — client Axios configuré avec injection automatique du token
- `server/users/views.py` — vues d'authentification
- `server/users/models.py` — modèle `UserProfile`

### Rôles disponibles

| Rôle | Valeur | Description |
|------|--------|-------------|
| Usager | `usager` | Citoyen standard |
| Pompier | `pompier` | Services d'incendie |
| Urgences | `urgence` | Services médicaux d'urgence |
| Agent de circulation | `agent` | Agent de la police routière |

### Permissions backend

**Fichier :** `server/users/permissions.py`

| Classe | Rôles autorisés |
|--------|----------------|
| `IsUsager` | `usager` |
| `IsPompier` | `pompier` |
| `IsUrgence` | `urgence` |
| `IsAgent` | `agent` |
| `IsEmergencyRole` | `pompier`, `urgence` |
| `IsAnyRole` | tous les rôles authentifiés |

### Endpoints d'authentification

| Méthode | URL | Description | Auth requise |
|---------|-----|-------------|-------------|
| `POST` | `/api/users/register/` | Inscription (username, email, password, role) | Non |
| `POST` | `/api/users/login/` | Connexion → retourne token + profil | Non |
| `POST` | `/api/users/logout/` | Révocation du token | Oui |
| `GET` | `/api/users/me/` | Profil de l'utilisateur courant | Oui |

**Exemple de réponse `/register/` et `/login/` :**
```json
{
  "token": "9944b09199c62bcf9418ad846dd0e4bbdfc6ee4",
  "user": {
    "username": "jean",
    "email": "jean@example.mg",
    "role": "usager",
    "role_display": "Usager"
  }
}
```

### Protection des pages frontend

**Fichier :** `web/components/auth/RequireAuth.tsx`

Le composant `RequireAuth` encapsule les pages protégées. Si l'utilisateur n'est pas authentifié, il est redirigé vers `/auth`. Si son rôle ne correspond pas aux rôles autorisés, il est redirigé vers `/unauthorized`.

---

## 3. Dashboard utilisateur

**Fichier :** `web/app/dashboard/page.tsx`

Le dashboard est un panneau de contrôle adapté au rôle de l'utilisateur connecté.

### Onglets disponibles par rôle

| Onglet | Usager | Pompier | Urgences | Agent |
|--------|:------:|:-------:|:--------:|:-----:|
| Routes bloquées | ✓ | ✓ | ✓ | ✓ |
| Meilleur chemin | ✓ | ✓ | ✓ | ✓ |
| Heure de sortie | ✓ | ✓ | ✓ | ✓ |
| Gestion trafic | — | — | — | ✓ |

### Onglet "Routes bloquées"

Interroge `GET /api/users/blocked-roads/?hour=<h>` et liste les segments dont la densité dépasse le seuil (défaut : 0.7). Chaque route est colorée selon son niveau de congestion :

| Niveau | Couleur |
|--------|---------|
| `critique` | Rouge |
| `fort` | Orange |
| `modere` | Jaune |

### Onglet "Meilleur chemin"

Formulaire GPS (lat/lng départ + destination) → appel `GET /api/shortest-path/` → affiche distance en km et durée estimée en minutes.

### Onglet "Heure de sortie"

Formulaire GPS (départ + destination + heure d'arrivée souhaitée) → appel `POST /api/depart/calculate/` → affiche l'heure de départ recommandée, la durée estimée, et jusqu'à 3 créneaux alternatifs.

### Onglet "Gestion trafic" (agent uniquement)

Interroge `GET /api/users/traffic-management/?hour=<h>` → vue complète de toutes les densités sur l'ensemble du réseau, triées par congestion décroissante.

---

## 4. Simulation côté frontend

**Fichier :** `web/components/simulation/CarSystem.tsx`

### Initialisation

Au chargement, `CarSystem` crée **500 voitures** (`MAX_CARS`) avec des attributs aléatoires :

```typescript
{
  roadIdx: number,      // index de la route OSM assignée
  progress: number,     // position sur la route [0, 1]
  speed: number,        // vitesse de base (0.0008 – 0.0026 unités/frame)
  laneOffset: number,   // décalage latéral simulant la voie
  currentSpeed: number, // vitesse effective après facteur heure
}
```

### Facteur heure de pointe (`peakFactor`)

La vitesse effective est multipliée par `0.2 + peakFactor × 0.8` :

| Heure | `peakFactor` | Comportement |
|-------|-------------|--------------|
| 7h–9h, 16h–19h | 0.8 | Trafic dense, vitesse maximale |
| 10h–15h | 0.4 | Trafic modéré |
| reste | 0.15 | Trafic fluide, nuit |

### Détection des intersections

Les intersections sont dérivées automatiquement depuis les données OSM : tout **point de terminaison de route partagé par ≥ 2 segments** est considéré comme une intersection. Une voiture est comptée "en intersection" si elle se trouve à moins de `INTERSECTION_RADIUS` (~10 m en coordonnées de scène) d'un tel point.

### Seuil d'arrêt

Une voiture est considérée **à l'arrêt** si sa vitesse effective est inférieure à `STOPPED_SPEED_THRESHOLD = 0.0003` unités/frame, ce qui correspond à ~0 km/h en vitesse réelle.

---

## 5. Zones géographiques nommées

**Fichier :** `web/components/simulation/zones.ts`

Huit quartiers d'Antananarivo sont définis comme des rectangles lat/lng :

| ID | Quartier | Description |
|----|---------|-------------|
| `analakely` | Analakely | Centre-ville commerçant |
| `anosizato` | Anosizato | Sud-ouest, quartier résidentiel |
| `isotry` | Isotry | Centre, dense |
| `67ha` | 67 Ha | Nord, zone administrative |
| `ambohijatovo` | Ambohijatovo | Centre-est |
| `tsaralalana` | Tsaralalana | Centre, axes principaux |
| `ankorondrano` | Ankorondrano | Nord, zone commerciale/hôtels |
| `behoririka` | Behoririka | Est, résidentiel |

### Conversion de coordonnées

Les bornes lat/lng sont **pré-converties en coordonnées de scène** au démarrage du module (une seule fois) selon :

```
x = (lng − CENTER.lng) × SCALE
z = −(lat − CENTER.lat) × SCALE
```

avec `CENTER = { lat: -18.9137, lng: 47.5361 }` et `SCALE = 8000`.

La classification d'une voiture dans une zone est un simple test AABB (`x ∈ [minX, maxX]` et `z ∈ [minZ, maxZ]`), exécuté en O(nombre de zones) par voiture par frame.

---

## 6. Métriques calculées en temps réel

À chaque frame (60 fps), `CarSystem` calcule et expose via le callback `onMetrics` :

```typescript
interface ZoneStat {
  total: number;    // nb de voitures dans la zone
  stopped: number;  // nb de voitures à l'arrêt dans la zone
}

interface TrafficMetrics {
  totalCars: number;             // total voitures actives
  stoppedCars: number;           // total à l'arrêt (toutes zones)
  carsInIntersections: number;   // total en zone d'intersection
  avgSpeedKmh: number;           // vitesse moyenne en km/h
  zoneStats: Record<string, ZoneStat>;         // par zone nommée
  intersectionCounts: Record<string, number>;  // par index d'intersection
}
```

### Conversion vitesse scène → km/h

```
metersPerFrame = sceneSpeed / METER
metersPerSecond = metersPerFrame × 60   (fps)
kmh = metersPerSecond × 3.6
```

### Statut de congestion par zone

Le **taux d'arrêt** d'une zone = `stopped / total × 100` :

| Taux d'arrêt | Statut | Couleur |
|-------------|--------|---------|
| > 40 % | Saturé | 🔴 Rouge |
| 20 – 40 % | Ralenti | 🟠 Orange |
| < 20 % | Fluide | 🟢 Vert |

---

## 7. Panneau HUD — TrafficStatsPanel

**Fichier :** `web/components/ui/TrafficStatsPanel.tsx`

Le panneau s'affiche en haut à droite de l'écran et se met à jour à chaque frame. Il présente :

- **Résumé global** : véhicules actifs, à l'arrêt (%), en intersection, vitesse moyenne
- **État par zone** (trié par congestion décroissante) : pour chaque quartier, nombre de véhicules totaux, nombre à l'arrêt, statut coloré, barre de progression animée

```
● Analakely          Saturé
  32 véh.   12 arrêtés        38%
  ████████████░░░░░░░░░░░░░░░

● Tsaralalana        Fluide
  8 véh.    0 arrêtés          0%
  ░░░░░░░░░░░░░░░░░░░░░░░░░░
```

---

## 8. Gestion des accidents

### Simulation des accidents

**Fichier :** `web/components/simulation/accidentTypes.ts`

La simulation génère deux catégories d'accidents :

| Type | Description | Icône |
|------|-------------|-------|
| `bodily` | Accident corporel (blessés) | 🚨 |
| `material` | Accident matériel (dommages) | ⚠️ |

Chaque accident généré inclut les plaques d'immatriculation des véhicules impliqués et l'horodatage.

### Panneau AccidentPanel

**Fichier :** `web/components/ui/AccidentPanel.tsx`

- S'affiche en bas à gauche, uniquement si des accidents sont actifs
- Chaque carte est cliquable pour afficher/masquer les détails
- Les accidents corporels affichent un bouton **"Appeler le 117"** (numéro d'urgence Madagascar)
- Les cartes peuvent être individuellement supprimées (dismiss)

### Marqueurs sur la carte

**Fichier :** `web/components/world/AccidentMarkers.tsx`

Les accidents sont représentés par des marqueurs 3D positionnés sur la scène. Un clic sur un marqueur ouvre la carte de détail correspondante.

### API accidents (backend)

**Fichier :** `server/traffic/views.py` — `AccidentView`

**`POST /api/accidents/`** — Enregistre un accident depuis la simulation.

**Corps :**
```json
{
  "scene_x": 145.3,
  "scene_z": -87.2,
  "bodily": true
}
```

**`GET /api/accidents/`** — Retourne les **hotspots** calculés à partir des 500 accidents les plus récents.

**Algorithme de clustering (greedy) :**
- Rayon de regroupement : `_CLUSTER_RADIUS = 30` unités de scène
- Seuil minimal pour constituer un hotspot : `_HOTSPOT_THRESHOLD = 2` accidents
- Centroïde mis à jour par moyenne pondérée à chaque ajout
- Sévérité : `"high"` si au moins un accident corporel, `"medium"` sinon

**Réponse :**
```json
[
  {
    "x": 145.3,
    "z": -87.2,
    "count": 5,
    "bodily_count": 2,
    "severity": "high"
  }
]
```

---

## 9. Assistant IA — Chatbot

**Fichiers :**
- Frontend : `web/components/ui/ChatbotUI.tsx`
- Backend : `server/traffic/views.py` — `ChatbotView`

### Fonctionnement

Le chatbot est alimenté par **Gemini 2.0 Flash** (Google GenAI) avec la fonctionnalité de recherche Google intégrée. Il reçoit un contexte trafic dynamique et répond aux questions des usagers en malagasy, français ou anglais.

**Clé API :** configurée dans `.env` sous `GEMINI_API_KEY`.

**`POST /api/chatbot/`**

**Corps :** `{ "query": "Comment éviter les bouchons à Analakely à 8h ?" }`

**Réponse :** `{ "response": "..." }`

### Interface

- Panneau latéral droit animé (slide-in depuis la droite)
- Bulle de bienvenue initiale en malagasy : *"Salama ! Je suis votre assistant trafic."*
- Messages utilisateur (bleu, alignés à droite) vs réponses IA (gris, alignés à gauche)
- Envoi par `Enter` ou bouton Send

---

## 10. Pathfinding — Plus court chemin

**Fichiers :**
- `server/pathfinding/graph.py` — Construction du graphe + algorithme Dijkstra
- `server/pathfinding/views.py` — Vue API

### Construction du graphe

Le graphe est construit à la volée depuis la table `RoadSegment` :

1. Chaque point de la géométrie d'un segment devient un **nœud** identifié par `"lat,lng"` (arrondi à 5 décimales)
2. Les nœuds consécutifs sont reliés par des **arêtes bidirectionnelles**
3. Le **poids** d'une arête = `distance_haversine_m × (1 + density)` — la densité de trafic pénalise les routes chargées

### Algorithme de Dijkstra

Implémentation standard avec tas binaire (`heapq`). Le nœud de départ/arrivée le plus proche est trouvé par recherche linéaire sur tous les nœuds du graphe (`nearest_node`).

### `GET /api/shortest-path/`

**Paramètres :** `start_lat`, `start_lng`, `end_lat`, `end_lng`

**Réponse :**
```json
{
  "path": [{"lat": -18.914, "lng": 47.536}, ...],
  "total_distance_m": 2340.5,
  "node_count": 42,
  "start_snapped": {"lat": -18.9139, "lng": 47.5358},
  "end_snapped": {"lat": -18.8932, "lng": 47.5321}
}
```

---

## 11. Prédiction de l'heure de départ

**Fichiers :**
- `server/depart/views.py` — Logique de prédiction
- `server/depart/urls.py` — Route `depart/calculate/`

### Fonctionnement

L'algorithme simule le trajet **minute par minute** en tenant compte de :

1. **La distance réelle** : distance haversine × facteur de détour structurel par zone

| Zone | Facteur détour |
|------|---------------|
| `anosizato` | 2.2× |
| `ankorondrano` | 2.0× |
| `analakely` | 1.8× |
| `isotry` | 1.9× |
| `67ha` | 1.6× |
| `tsaralalana` | 1.7× |
| `ambohijatovo` | 1.5× |
| `behoririka` | 1.4× |

2. **La vitesse de base selon la tranche horaire** :

| Tranche | Label | Vitesse |
|---------|-------|---------|
| 7h–9h, 16h–19h | `peak` | 10 km/h |
| 10h–15h | `mid` | 25 km/h |
| Autres | `off` | 35 km/h |

3. **La congestion temps réel** : des points de congestion GPS peuvent être passés dans le corps de la requête. L'impact est pondéré selon la distance (rayon d'influence : 1.5 km).

4. **Une marge de sécurité** (`buffer_minutes`) calculée selon la distance et le niveau de trafic.

### `POST /api/depart/calculate/`

**Corps :**
```json
{
  "origin_lat": -18.914,
  "origin_lng": 47.536,
  "dest_lat": -18.893,
  "dest_lng": 47.532,
  "arrival_time": "08:00",
  "congestion_points": [
    {"latitude": -18.910, "longitude": 47.530, "level": 80}
  ]
}
```

**Réponse :**
```json
{
  "safe_departure_time": "07:22",
  "departure_time": "07:27",
  "arrival_time": "08:00",
  "traffic_level": "Sature",
  "advice": "Pars a 07:22"
}
```

---

## 12. Prédiction de congestion

**Fichier :** `server/traffic/views.py` — `CongestionPredictionView`

**`GET /api/predict-congestion/`**

Analyse les **10 derniers snapshots** de simulation pour détecter les tendances de congestion :

- **Alerte globale** : si le nombre de voitures à l'arrêt augmente de plus de 5 entre les deux derniers snapshots
- **Alertes par zone** : si les voitures à l'arrêt dans une zone augmentent de plus de 2 en 5 secondes

**Réponse :**
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

## 13. API backend — endpoints complets

**Base URL :** `http://localhost:8000/api`

### Authentification

| Méthode | Endpoint | Auth | Description |
|---------|----------|------|-------------|
| POST | `/users/register/` | — | Inscription |
| POST | `/users/login/` | — | Connexion |
| POST | `/users/logout/` | Token | Déconnexion |
| GET | `/users/me/` | Token | Profil courant |
| GET | `/users/blocked-roads/` | Token (tout rôle) | Routes congestionnées |
| GET | `/users/traffic-management/` | Token (agent) | Vue complète du réseau |

### Trafic

| Méthode | Endpoint | Auth | Description |
|---------|----------|------|-------------|
| GET | `/traffic-data/?hour=<0-23>` | — | Densités procédurales par route |
| GET | `/pois/` | — | Points d'intérêt |
| POST | `/traffic-stats/` | — | Ingérer un snapshot de simulation |
| GET | `/traffic-stats/?limit=<n>` | — | Historique des snapshots (max 200) |
| GET | `/predict-congestion/` | — | Alertes de tendance de congestion |
| POST | `/accidents/` | — | Signaler un accident |
| GET | `/accidents/` | — | Hotspots d'accidents |

### Navigation

| Méthode | Endpoint | Auth | Description |
|---------|----------|------|-------------|
| GET | `/shortest-path/` | — | Plus court chemin (Dijkstra) |
| POST | `/depart/calculate/` | — | Prédiction heure de départ |

### IA

| Méthode | Endpoint | Auth | Description |
|---------|----------|------|-------------|
| POST | `/chatbot/` | — | Assistant IA Gemini 2.0 Flash |

---

## 14. Modèles de base de données

### `RoadSegment`

| Champ | Type | Description |
|-------|------|-------------|
| `name` | CharField | Nom de la route (peut être vide) |
| `geometry` | JSONField | Tableau de `{lat, lng}` définissant le tracé |
| `density` | FloatField | Densité 0.0–1.0 (peuplé par seed ou API OSM) |
| `speed_limit` | FloatField | Limite de vitesse en km/h (défaut : 50) |

### `TrafficSnapshot`

Chaque snapshot représente l'état de la simulation à un instant donné.

| Champ | Type | Description |
|-------|------|-------------|
| `recorded_at` | DateTimeField | Horodatage (auto, indexé) |
| `sim_hour` | IntegerField | Heure simulée (0–23) |
| `total_cars` | IntegerField | Nombre total de voitures actives |
| `stopped_cars` | IntegerField | Voitures à l'arrêt |
| `cars_in_intersections` | IntegerField | Voitures en intersection |
| `avg_speed_kmh` | FloatField | Vitesse moyenne en km/h |
| `zone_counts` | JSONField | Stats par zone `{zone_id: {total, stopped}}` |
| `intersection_counts` | JSONField | Comptage par index d'intersection |

### `Accident`

| Champ | Type | Description |
|-------|------|-------------|
| `scene_x` | FloatField | Coordonnée X Three.js |
| `scene_z` | FloatField | Coordonnée Z Three.js |
| `bodily` | BooleanField | `true` si corporel, `false` si matériel |
| `recorded_at` | DateTimeField | Horodatage (auto, indexé) |

### `POI`

| Champ | Type | Description |
|-------|------|-------------|
| `name` | CharField | Nom du point d'intérêt |
| `category` | CharField | Catégorie (hôpital, marché, école…) |
| `latitude` | FloatField | Latitude GPS |
| `longitude` | FloatField | Longitude GPS |
| `description` | TextField | Description optionnelle |

### `UserProfile`

| Champ | Type | Description |
|-------|------|-------------|
| `user` | OneToOneField | Lien vers `django.contrib.auth.User` |
| `role` | CharField | `usager` / `pompier` / `urgence` / `agent` |

---

## 15. Flux de données complet

```
OSM Overpass API
      │  (au chargement)
      ▼
 geo.ts: useOsmRoads()
      │  roads: OsmRoad[]
      ▼
 CarSystem.tsx
      │  useMemo → 500 carState[] + roadCurves[]
      │  useMemo → intersections[] (nœuds OSM partagés)
      │
      │  useFrame (60fps):
      │    pour chaque voiture:
      │      1. avancer sur la courbe (CatmullRom)
      │      2. tester classifyZone(pos.x, pos.z)  → ZoneStat
      │      3. tester distance aux intersections   → intersectionCounts
      │      4. tester vitesse < seuil              → isStopped
      │      5. générer un accident (probabilité)   → AccidentEvent
      │    → construire TrafficMetrics
      │
      ├──► onMetrics(metrics)  →  page.tsx setMetrics()
      │                               │
      │                               ├──► TrafficStatsPanel (HUD)
      │                               └──► AccidentPanel (si accidents)
      │
      ├──► toutes les 5s: POST /api/traffic-stats/
      │                        │
      │                        ▼
      │                 TrafficSnapshot (SQLite/PostgreSQL)
      │
      └──► à chaque accident: POST /api/accidents/
                               │
                               ▼
                         Accident (SQLite/PostgreSQL)
                               │
                         GET /api/accidents/ → hotspots clustering
                               │
                         AccidentMarkers (3D scene)

Utilisateur (Dashboard)
      │
      ├──► GET /api/users/blocked-roads/      → liste des routes saturées
      ├──► GET /api/shortest-path/            → itinéraire Dijkstra
      ├──► POST /api/depart/calculate/        → heure de départ optimale
      ├──► GET /api/users/traffic-management/ (agent) → réseau complet
      └──► POST /api/chatbot/                 → assistant IA Gemini
```

---

## 16. Ajouter ou modifier une zone

Éditer le tableau `RAW_ZONES` dans `web/components/simulation/zones.ts` :

```typescript
{ 
  id: "mahamasina",     // identifiant unique (snake_case)
  label: "Mahamasina",  // nom affiché dans le HUD
  south: -18.9230,      // latitude sud (plus petite valeur)
  north: -18.9140,      // latitude nord
  west:  47.5340,       // longitude ouest
  east:  47.5460        // longitude est
}
```

Les coordonnées de scène sont recalculées automatiquement au démarrage. Aucune autre modification n'est nécessaire : la zone apparaîtra immédiatement dans le panneau HUD et dans les snapshots envoyés au backend.

Pour que la zone soit prise en compte dans la **prédiction de départ**, ajouter également son centre dans `ZONE_CENTERS` et son facteur de détour dans `DETOUR_FACTOR` dans `server/depart/views.py`.

> **Outil recommandé pour trouver les coordonnées :** [geojson.io](https://geojson.io) ou [OpenStreetMap](https://www.openstreetmap.org) → clic droit → "Afficher l'adresse".
