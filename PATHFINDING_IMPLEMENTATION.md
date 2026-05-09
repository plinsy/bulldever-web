# Implémentation du système de pathfinding - Bulldever

## Status : ✅ COMPLÉTÉ

L'endpoint REST de calcul du plus court chemin a été implémenté avec succès.

## Fichiers créés dans `server/pathfinding/`

```
pathfinding/
├── __init__.py                 # Module Python
├── admin.py                    # Admin Django (vide)
├── apps.py                     # AppConfig
├── graph.py                    # ⭐ Core : haversine, build_graph, dijkstra, nearest_node
├── models.py                   # Vide (utilise RoadSegment)
├── tests.py                    # Tests unitaires (à étendre)
├── test_pathfinding.py         # Script de test interactif
├── urls.py                     # URL routing
└── views.py                    # ⭐ Vue REST ShortestPathView
```

## Modifications de configuration

### `server/server/settings.py` (ligne 43)
```python
INSTALLED_APPS = [
    ...
    'pathfinding',  # ← Ajouté
]
```

### `server/server/urls.py` (ligne 23)
```python
urlpatterns = [
    ...
    path('api/', include('pathfinding.urls')),  # ← Ajouté
]
```

## Endpoint REST

### URL
```
GET /api/shortest-path/?start_lat=<float>&start_lng=<float>&end_lat=<float>&end_lng=<float>
```

### Paramètres
| Param | Type | Exemple | Description |
|-------|------|---------|-------------|
| start_lat | float | -18.9100 | Latitude du départ |
| start_lng | float | 47.5340 | Longitude du départ |
| end_lat | float | -18.9200 | Latitude de destination |
| end_lng | float | 47.5420 | Longitude de destination |

### Réponse réussie (200)
```json
{
  "path": [
    { "lat": -18.91200, "lng": 47.53400 },
    { "lat": -18.91350, "lng": 47.53620 },
    { "lat": -18.91475, "lng": 47.53710 }
  ],
  "total_distance_m": 2456.8,
  "node_count": 3,
  "start_snapped": { "lat": -18.91200, "lng": 47.53400 },
  "end_snapped": { "lat": -18.91475, "lng": 47.53710 }
}
```

### Codes d'erreur
- **400** : Paramètres invalides (manquants ou non-float)
- **404** : Aucun chemin trouvé (nœuds disconnectés)
- **500** : Erreur serveur (exception)

## Architecture de l'implémentation

### 1. Construction du graphe (`build_graph()`)
- Charge tous les `RoadSegment` depuis la BDD
- Crée des nœuds identifiés par `"lat,lng"` arrondi à 5 décimales
- Relie les nœuds consécutifs avec un poids : `distance_haversine × (1 + density)`
- Graphe non orienté

### 2. Algorithme de Dijkstra (`dijkstra()`)
- Utilise un `heapq` (min-heap) pour l'efficacité
- Retourne la liste ordonnée des nœuds du chemin optimal
- Retourne `None` si aucun chemin n'existe
- Complexité : O((V + E) log V)

### 3. Snapping GPS (`nearest_node()`)
- Trouve le nœud du graphe le plus proche d'une coordonnée GPS
- Utilise la distance haversine pour tous les nœuds
- Complexité : O(n)

### 4. Distance haversine (`haversine()`)
- Calcule la distance orthodromique entre deux points GPS en mètres
- Rayon terrestre : 6 371 km
- Précision : ±0.5%

## Exemple d'utilisation

### cURL
```bash
curl "http://localhost:8000/api/shortest-path/?start_lat=-18.9100&start_lng=47.5340&end_lat=-18.9200&end_lng=47.5420"
```

### JavaScript
```javascript
const response = await fetch(
  '/api/shortest-path/' +
  '?start_lat=-18.9100&start_lng=47.5340' +
  '&end_lat=-18.9200&end_lng=47.5420'
);
const { path, total_distance_m } = await response.json();
console.log(`Distance: ${total_distance_m}m`);
path.forEach(point => console.log(`${point.lat}, ${point.lng}`));
```

### Python (Django shell)
```python
from pathfinding.graph import build_graph, dijkstra, nearest_node

# Construire le graphe
graph = build_graph()
print(f"Nœuds: {len(graph)}")

# Trouver les nœuds les plus proches
start_node = nearest_node(-18.9100, 47.5340, list(graph.keys()))
end_node = nearest_node(-18.9200, 47.5420, list(graph.keys()))

# Trouver le chemin
path = dijkstra(graph, start_node, end_node)
if path:
    print(f"Chemin trouvé: {len(path)} nœuds")
else:
    print("Aucun chemin trouvé")
```

## Test interactif

Depuis `server/` :
```bash
python manage.py shell < pathfinding/test_pathfinding.py
```

Affiche :
- Nombre de RoadSegment en BDD
- Nombre de nœuds du graphe
- Nombre d'arêtes
- Tests des fonctions haversine, nearest_node, dijkstra

## Contraintes respectées

✅ **Dijkstra pur Python** avec `heapq` (pas de librairie externe)
✅ **Graphe reconstruit** à chaque appel (acceptable pour <5000 nœuds)
✅ **Identifiants de nœuds** `"lat,lng"` arrondis à 5 décimales
✅ **Type hints Python 3.10+** (`list[str] | None`)
✅ **Gestion d'erreur complète** (try/except, codes HTTP appropriés)
✅ **Format JSON exact** comme spécifié
✅ **Distance en mètres** calculée avec la formule haversine

## Performance

- **build_graph()** : O(N×M) où N=segments, M=nœuds/segment
- **dijkstra()** : O((V+E) log V) avec V=nœuds, E=arêtes
- **nearest_node()** : O(n) où n=nœuds
- **Temps estimé** pour 5000 nœuds : 50-100ms par requête

## Optimisations futures recommandées

1. **Cache du graphe** (Redis/Memcached)
   - TTL 5-60 minutes selon fréquence des mises à jour

2. **Spatial indexing** avec PostGIS
   - nearest_node devient O(1)

3. **Précomputation des chemins populaires**

4. **API multi-critères**
   - `?avoid_highways=true`, `?prefer_speed=true`

5. **Estimation du temps de trajet**
   - Utiliser `speed_limit` pour convertir distance en temps

## Documentation complète

Voir les fichiers :
- `USAGE.md` : Guide d'utilisation
- `TECHNICAL_DETAILS.md` : Détails techniques et d'implémentation
- `IMPLEMENTATION_SUMMARY.md` : Résumé des fichiers créés

