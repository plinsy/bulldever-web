import heapq
import math
from typing import Dict, List, Tuple, Optional
from traffic.models import RoadSegment


def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """
    Calcule la distance haversine entre deux points en mètres.
    
    Args:
        lat1, lng1: Coordonnées du premier point
        lat2, lng2: Coordonnées du deuxième point
    
    Returns:
        Distance en mètres
    """
    R = 6371000  # Rayon de la Terre en mètres
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lng = math.radians(lng2 - lng1)
    
    a = math.sin(delta_lat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lng / 2) ** 2
    c = 2 * math.asin(math.sqrt(a))
    
    return R * c


def _round_coord(value: float, decimals: int = 5) -> float:
    """Arrondit une coordonnée à un nombre de décimales spécifié."""
    return round(value, decimals)


def _node_id(lat: float, lng: float) -> str:
    """Génère un identifiant de nœud à partir de lat/lng."""
    return f"{_round_coord(lat)},{_round_coord(lng)}"


def _parse_node_id(node_id: str) -> Tuple[float, float]:
    """Parse un identifiant de nœud pour récupérer lat/lng."""
    lat, lng = node_id.split(',')
    return float(lat), float(lng)


def build_graph() -> Dict[str, List[Tuple[str, float]]]:
    """
    Construit un graphe non orienté à partir de tous les RoadSegment.
    
    Returns:
        Dict où chaque clé est un identifiant de nœud ("lat,lng" arrondi à 5 décimales)
        et chaque valeur est une liste de tuples (nœud_voisin, poids)
        Le poids est calculé comme: distance_haversine * (1 + density)
    """
    graph: Dict[str, List[Tuple[str, float]]] = {}
    
    # Charger tous les segments routiers
    segments = RoadSegment.objects.all()
    
    for segment in segments:
        # Récupérer la géométrie (liste de {lat, lng})
        geometry = segment.geometry
        
        if not geometry or len(geometry) < 2:
            continue
        
        density = segment.density if segment.density is not None else 0.0
        
        # Relier les nœuds consécutifs du segment
        for i in range(len(geometry) - 1):
            point_a = geometry[i]
            point_b = geometry[i + 1]
            
            lat_a, lng_a = point_a['lat'], point_a['lng']
            lat_b, lng_b = point_b['lat'], point_b['lng']
            
            # Créer les identifiants de nœuds
            node_a = _node_id(lat_a, lng_a)
            node_b = _node_id(lat_b, lng_b)
            
            # Calculer la distance et le poids
            distance = haversine(lat_a, lng_a, lat_b, lng_b)
            weight = distance * (1 + density)
            
            # Initialiser les nœuds s'ils n'existent pas
            if node_a not in graph:
                graph[node_a] = []
            if node_b not in graph:
                graph[node_b] = []
            
            # Ajouter les arêtes (graphe non orienté)
            graph[node_a].append((node_b, weight))
            graph[node_b].append((node_a, weight))
    
    return graph


def dijkstra(graph: Dict[str, List[Tuple[str, float]]], start_id: str, end_id: str) -> Optional[List[str]]:
    """
    Implémente l'algorithme de Dijkstra pour trouver le chemin le plus court.
    
    Args:
        graph: Le graphe des routes
        start_id: Identifiant du nœud de départ ("lat,lng")
        end_id: Identifiant du nœud d'arrivée ("lat,lng")
    
    Returns:
        Liste ordonnée des identifiants de nœuds du chemin, ou None si aucun chemin n'existe
    """
    # Vérifier que start et end existent dans le graphe
    if start_id not in graph or end_id not in graph:
        return None
    
    # Initialiser les distances et les parents
    distances: Dict[str, float] = {node: float('inf') for node in graph}
    distances[start_id] = 0
    
    parents: Dict[str, Optional[str]] = {node: None for node in graph}
    
    # Min-heap pour stocker (distance, nœud)
    heap = [(0, start_id)]
    visited = set()
    
    while heap:
        current_dist, current_node = heapq.heappop(heap)
        
        # Ignorer si déjà visité
        if current_node in visited:
            continue
        
        visited.add(current_node)
        
        # Si on a atteint le nœud de destination
        if current_node == end_id:
            # Reconstruire le chemin
            path = []
            node = end_id
            while node is not None:
                path.append(node)
                node = parents[node]
            path.reverse()
            return path
        
        # Explorer les voisins
        if current_node in graph:
            for neighbor, weight in graph[current_node]:
                if neighbor not in visited:
                    new_dist = current_dist + weight
                    
                    if new_dist < distances[neighbor]:
                        distances[neighbor] = new_dist
                        parents[neighbor] = current_node
                        heapq.heappush(heap, (new_dist, neighbor))
    
    # Aucun chemin trouvé
    return None


def nearest_node(lat: float, lng: float, graph_nodes: List[str]) -> str:
    """
    Trouve le nœud le plus proche d'une coordonnée GPS donnée.
    
    Args:
        lat: Latitude du point
        lng: Longitude du point
        graph_nodes: Liste de tous les identifiants de nœuds du graphe
    
    Returns:
        Identifiant du nœud le plus proche
    """
    if not graph_nodes:
        raise ValueError("Aucun nœud disponible dans le graphe")
    
    closest_node = None
    min_distance = float('inf')
    
    for node_id in graph_nodes:
        node_lat, node_lng = _parse_node_id(node_id)
        distance = haversine(lat, lng, node_lat, node_lng)
        
        if distance < min_distance:
            min_distance = distance
            closest_node = node_id
    
    return closest_node
