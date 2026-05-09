# Bulldever — Documentation technique

Jumeau numérique du réseau routier d'Antananarivo (Madagascar).  
Stack : **Next.js** (frontend 3D) · **Django REST Framework** (backend) · **PostgreSQL/PostGIS** · **Three.js / React Three Fiber**

---

## Table des matières

1. [Architecture générale](#1-architecture-générale)
2. [Données de trafic — vue d'ensemble](#2-données-de-trafic--vue-densemble)
3. [Simulation côté frontend](#3-simulation-côté-frontend)
4. [Zones géographiques nommées](#4-zones-géographiques-nommées)
5. [Métriques calculées en temps réel](#5-métriques-calculées-en-temps-réel)
6. [Panneau HUD — TrafficStatsPanel](#6-panneau-hud--trafficstatspanel)
7. [API backend — endpoints trafic](#7-api-backend--endpoints-trafic)
8. [Modèles de base de données](#8-modèles-de-base-de-données)
9. [Flux de données complet](#9-flux-de-données-complet)
10. [Ajouter ou modifier une zone](#10-ajouter-ou-modifier-une-zone)

---

## 1. Architecture générale

```
┌─────────────────────────────────────────────────────┐
│  Browser (Next.js)                                   │
│                                                      │
│  page.tsx                                            │
│   ├── Scene.tsx  ──►  CarSystem.tsx  (simulation)   │
│   │                        │                         │
│   │                   onMetrics()  ◄── useFrame 60fps│
│   │                        │                         │
│   └── TrafficStatsPanel.tsx (HUD)                    │
│              ▲                                       │
│              └── metrics state (useState)            │
│                        │                             │
│              POST /api/traffic-stats/ (toutes 5s)   │
└─────────────────────────┬───────────────────────────┘
                          │ HTTP REST
┌─────────────────────────▼───────────────────────────┐
│  Django (port 8000)                                  │
│                                                      │
│  GET  /api/traffic-data/     → densités par route   │
│  POST /api/traffic-stats/    → ingère un snapshot    │
│  GET  /api/traffic-stats/    → historique snapshots  │
│  POST /api/chatbot/          → assistant IA (Gemini) │
└─────────────────────────────────────────────────────┘
```

---

## 2. Données de trafic — vue d'ensemble

Le système distingue deux sources de données :

| Source | Nature | Fréquence |
|--------|--------|-----------|
| **OpenStreetMap (Overpass API)** | Géométrie réelle du réseau routier d'Antananarivo | Au chargement de la page |
| **Simulation frontend (CarSystem)** | État calculé des 500 véhicules à chaque frame | 60 fois/seconde |

Les données de simulation sont **dérivées de la géométrie OSM** : les voitures se déplacent sur les vraies routes, et leurs positions servent à calculer des métriques d'encombrement par zone.

---

## 3. Simulation côté frontend

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

## 4. Zones géographiques nommées

**Fichier :** `web/components/simulation/zones.ts`

Huit quartiers d'Antananarivo sont définis comme des rectangles lat/lng :

| ID | Quartier | Coordonnées approximatives |
|----|---------|---------------------------|
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

## 5. Métriques calculées en temps réel

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

## 6. Panneau HUD — TrafficStatsPanel

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

## 7. API backend — endpoints trafic

**Base URL :** `http://localhost:8000/api`

### `GET /traffic-data/?hour=<0-23>`

Retourne la liste des segments routiers avec leur densité de trafic calculée de façon procédurale selon l'heure.

**Réponse :**
```json
[
  {
    "id": 1,
    "name": "Avenue de l'Indépendance",
    "geometry": [{"lat": -18.914, "lng": 47.536}, ...],
    "density": 0.72
  }
]
```

`density` est un flottant entre 0 (route libre) et 1 (route saturée), colorant la `RoadNetwork` en vert → orange → rouge.

---

### `POST /traffic-stats/`

Reçoit un snapshot de métriques de simulation envoyé automatiquement par le frontend toutes les **5 secondes**.

**Corps :**
```json
{
  "sim_hour": 8,
  "total_cars": 500,
  "stopped_cars": 87,
  "cars_in_intersections": 23,
  "avg_speed_kmh": 34.2,
  "zone_counts": {
    "analakely": {"total": 32, "stopped": 12},
    "isotry": {"total": 15, "stopped": 2}
  },
  "intersection_counts": {
    "0": 4,
    "7": 11
  }
}
```

**Réponse :** `201 Created` avec le snapshot persisté.

---

### `GET /traffic-stats/?limit=<n>`

Retourne les `n` derniers snapshots (défaut : 20, max : 200), triés du plus récent au plus ancien. Utilisable pour des graphiques d'historique ou un tableau de bord externe.

---

### `POST /chatbot/`

Assistant IA alimenté par **Gemini 2.0 Flash** avec contexte trafic injecté automatiquement.

**Corps :** `{ "query": "Comment éviter les bouchons à Analakely à 8h ?" }`

---

## 8. Modèles de base de données

### `RoadSegment`

| Champ | Type | Description |
|-------|------|-------------|
| `name` | CharField | Nom de la route (peut être vide) |
| `geometry` | JSONField | Tableau de `{lat, lng}` définissant le tracé |
| `density` | FloatField | Densité 0.0–1.0 (peuplé par seed ou API OSM) |
| `speed_limit` | FloatField | Limite de vitesse en km/h |

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

### `POI`

Points d'intérêt géolocalisés (hôpitaux, marchés, écoles…) affichables sur la carte.

---

## 9. Flux de données complet

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
      │    → construire TrafficMetrics
      │
      ├──► onMetrics(metrics)  →  page.tsx setMetrics()
      │                               │
      │                               ▼
      │                        TrafficStatsPanel (HUD)
      │
      └──► toutes les 5s: POST /api/traffic-stats/
                               │
                               ▼
                        TrafficSnapshot (SQLite/PostgreSQL)
```

---

## 10. Ajouter ou modifier une zone

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

> **Outil recommandé pour trouver les coordonnées :** [geojson.io](https://geojson.io) ou [OpenStreetMap](https://www.openstreetmap.org) → clic droit → "Afficher l'adresse".
