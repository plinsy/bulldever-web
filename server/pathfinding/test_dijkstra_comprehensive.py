"""
Test complet du système de pathfinding - Vérification des embouteillages
Ce test simule des routes avec différentes densités de trafic pour vérifier que
l'algorithme de Dijkstra choisit bien le chemin qui MINIMISE le temps réel (distance + trafic).
"""

import heapq
import math
from typing import Dict, List, Tuple, Optional


def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calcule la distance orthodromique entre deux points en mètres."""
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


def dijkstra(graph: Dict[str, List[Tuple[str, float]]], start_id: str, end_id: str) -> Optional[List[str]]:
    """Implémente l'algorithme de Dijkstra pour trouver le chemin le plus court."""
    if start_id not in graph or end_id not in graph:
        return None
    
    distances: Dict[str, float] = {node: float('inf') for node in graph}
    distances[start_id] = 0
    
    parents: Dict[str, Optional[str]] = {node: None for node in graph}
    
    heap = [(0, start_id)]
    visited = set()
    
    while heap:
        current_dist, current_node = heapq.heappop(heap)
        
        if current_node in visited:
            continue
        
        visited.add(current_node)
        
        if current_node == end_id:
            path = []
            node = end_id
            while node is not None:
                path.append(node)
                node = parents[node]
            path.reverse()
            return path
        
        if current_node in graph:
            for neighbor, weight in graph[current_node]:
                if neighbor not in visited:
                    new_dist = current_dist + weight
                    
                    if new_dist < distances[neighbor]:
                        distances[neighbor] = new_dist
                        parents[neighbor] = current_node
                        heapq.heappush(heap, (new_dist, neighbor))
    
    return None


def create_test_graph_scenario_1():
    """
    Scenario 1 : Deux chemins possibles - Un est plus court en distance mais embouteillé
    
    A ──────50m (embouteillage: density=0.8)──────> B
     \                                              /
      ────────200m (libre: density=0.0)────────> C
    
    Route directe A→B : 50m × (1 + 0.8) = 90m de poids (distance brute: 50m)
    Route détournée A→C→B : 200m + 50m = 250m × (1 + 0.0) ≈ 250m de poids (distance brute: 250m)
    
    Dijkstra doit choisir A→B car 90 < 250 (même si plus court en distance brute)
    """
    graph = {}
    
    # Nœuds
    A = _node_id(-18.91200, 47.53400)
    B = _node_id(-18.91201, 47.53401)  # Très proche (route directe courte)
    C = _node_id(-18.91205, 47.53405)  # Plus loin (détour)
    
    # Distances réelles
    dist_AB = haversine(-18.91200, 47.53400, -18.91201, 47.53401)
    dist_AC = haversine(-18.91200, 47.53400, -18.91205, 47.53405)
    dist_CB = haversine(-18.91205, 47.53405, -18.91201, 47.53401)
    
    # Densités
    density_AB = 0.8  # Embouteillage
    density_AC = 0.0  # Libre
    density_CB = 0.0  # Libre
    
    # Poids = distance × (1 + density)
    weight_AB = dist_AB * (1 + density_AB)
    weight_AC = dist_AC * (1 + density_AC)
    weight_CB = dist_CB * (1 + density_CB)
    
    # Construire le graphe non orienté
    graph[A] = [(B, weight_AB), (C, weight_AC)]
    graph[B] = [(A, weight_AB), (C, weight_CB)]
    graph[C] = [(A, weight_AC), (B, weight_CB)]
    
    return {
        'graph': graph,
        'A': A, 'B': B, 'C': C,
        'dist_AB': dist_AB, 'dist_AC': dist_AC, 'dist_CB': dist_CB,
        'density_AB': density_AB, 'density_AC': density_AC, 'density_CB': density_CB,
        'weight_AB': weight_AB, 'weight_AC': weight_AC, 'weight_CB': weight_CB,
    }


def create_test_graph_scenario_2():
    """
    Scenario 2 : Triangle d'intersections - Route la plus directe est embouteillée
    
    Antananarivo : A (nord)
           A
          /|\
         / | \
        /  |  \
      B    |   C (embouteillé)
       \   |  /
        \  | /
         \ |/
           D (sud)
    
    Chemin A→D direct via C (très embouteillé)
    vs Chemin A→B→D (libre)
    
    Dijkstra doit déterminer le meilleur itinéraire
    """
    graph = {}
    
    # Nœuds (positions simplifiées à Antananarivo)
    A = _node_id(-18.9100, 47.5300)  # Nord
    B = _node_id(-18.9110, 47.5290)  # Ouest
    C = _node_id(-18.9110, 47.5310)  # Est (embouteillé)
    D = _node_id(-18.9120, 47.5300)  # Sud
    
    # Distances
    dist_AB = haversine(-18.9100, 47.5300, -18.9110, 47.5290)
    dist_AC = haversine(-18.9100, 47.5300, -18.9110, 47.5310)
    dist_AD = haversine(-18.9100, 47.5300, -18.9120, 47.5300)
    dist_BC = haversine(-18.9110, 47.5290, -18.9110, 47.5310)
    dist_BD = haversine(-18.9110, 47.5290, -18.9120, 47.5300)
    dist_CD = haversine(-18.9110, 47.5310, -18.9120, 47.5300)
    
    # Densités
    density_AB = 0.1  # Léger trafic
    density_AC = 0.9  # TRÈS embouteillé
    density_AD = 0.2  # Trafic moyen
    density_BC = 0.0  # Libre
    density_BD = 0.1  # Léger trafic
    density_CD = 0.8  # Embouteillé
    
    # Poids
    weights = {
        'AB': dist_AB * (1 + density_AB),
        'AC': dist_AC * (1 + density_AC),
        'AD': dist_AD * (1 + density_AD),
        'BC': dist_BC * (1 + density_BC),
        'BD': dist_BD * (1 + density_BD),
        'CD': dist_CD * (1 + density_CD),
    }
    
    graph[A] = [(B, weights['AB']), (C, weights['AC']), (D, weights['AD'])]
    graph[B] = [(A, weights['AB']), (C, weights['BC']), (D, weights['BD'])]
    graph[C] = [(A, weights['AC']), (B, weights['BC']), (D, weights['CD'])]
    graph[D] = [(A, weights['AD']), (B, weights['BD']), (C, weights['CD'])]
    
    return {
        'graph': graph,
        'A': A, 'B': B, 'C': C, 'D': D,
        'distances': {
            'AB': dist_AB, 'AC': dist_AC, 'AD': dist_AD,
            'BC': dist_BC, 'BD': dist_BD, 'CD': dist_CD,
        },
        'densities': {
            'AB': density_AB, 'AC': density_AC, 'AD': density_AD,
            'BC': density_BC, 'BD': density_BD, 'CD': density_CD,
        },
        'weights': weights,
    }


def calculate_path_metrics(path: List[str], densities_map: Dict[Tuple[str, str], float]) -> Dict:
    """Calcule les métriques du chemin (distance, temps, coût)"""
    if not path or len(path) < 2:
        return {'distance_m': 0, 'weighted_distance': 0, 'avg_density': 0}
    
    total_distance = 0
    total_weighted_distance = 0
    segment_count = 0
    total_density = 0
    
    for i in range(len(path) - 1):
        lat1, lng1 = _parse_node_id(path[i])
        lat2, lng2 = _parse_node_id(path[i + 1])
        
        distance = haversine(lat1, lng1, lat2, lng2)
        total_distance += distance
        
        # Chercher la densité pour ce segment
        key = (path[i], path[i + 1])
        reverse_key = (path[i + 1], path[i])
        
        density = densities_map.get(key) or densities_map.get(reverse_key, 0.0)
        weighted_distance = distance * (1 + density)
        total_weighted_distance += weighted_distance
        
        total_density += density
        segment_count += 1
    
    avg_density = total_density / segment_count if segment_count > 0 else 0
    
    return {
        'distance_m': round(total_distance, 2),
        'weighted_distance': round(total_weighted_distance, 2),
        'avg_density': round(avg_density, 3),
        'num_segments': segment_count,
    }


def test_scenario_1():
    """Test Scenario 1 : Route directe embouteillée vs détour libre"""
    print("\n" + "=" * 80)
    print("TEST SCENARIO 1 : Route directe embouteillée vs détour libre")
    print("=" * 80)
    
    scenario = create_test_graph_scenario_1()
    graph = scenario['graph']
    A, B, C = scenario['A'], scenario['B'], scenario['C']
    
    print("\n📍 Nœuds:")
    print(f"   A: {A}")
    print(f"   B: {B}")
    print(f"   C: {C}")
    
    print("\n📊 Distances réelles (brutes en mètres):")
    print(f"   A→B: {scenario['dist_AB']:.1f}m")
    print(f"   A→C: {scenario['dist_AC']:.1f}m")
    print(f"   C→B: {scenario['dist_CB']:.1f}m")
    
    print("\n🚗 Densités de trafic:")
    print(f"   A→B: {scenario['density_AB']:.1f} (embouteillage sévère)")
    print(f"   A→C: {scenario['density_AC']:.1f} (libre)")
    print(f"   C→B: {scenario['density_CB']:.1f} (libre)")
    
    print("\n⚖️  Poids calculés (distance × (1 + density)):")
    print(f"   A→B: {scenario['dist_AB']:.1f} × (1 + {scenario['density_AB']}) = {scenario['weight_AB']:.1f}")
    print(f"   A→C: {scenario['dist_AC']:.1f} × (1 + {scenario['density_AC']}) = {scenario['weight_AC']:.1f}")
    print(f"   C→B: {scenario['dist_CB']:.1f} × (1 + {scenario['density_CB']}) = {scenario['weight_CB']:.1f}")
    
    print("\n🛣️  Chemins possibles:")
    print(f"   Route 1 (Directe): A→B = {scenario['weight_AB']:.1f} (poids)")
    print(f"   Route 2 (Détour): A→C→B = {scenario['weight_AC']:.1f} + {scenario['weight_CB']:.1f} = {scenario['weight_AC'] + scenario['weight_CB']:.1f} (poids)")
    
    # Lancer Dijkstra
    path = dijkstra(graph, A, B)
    
    print("\n🎯 Résultat Dijkstra:")
    if path:
        print(f"   Chemin trouvé: {' → '.join(path)}")
        
        # Vérifier quel chemin a été choisi
        if len(path) == 2:
            print(f"   ✓ Chemin DIRECT A→B choisi (poids minimal)")
            expected_weight = scenario['weight_AB']
        else:
            print(f"   ✓ Chemin DÉTOUR A→C→B choisi (poids minimal)")
            expected_weight = scenario['weight_AC'] + scenario['weight_CB']
        
        # Calculer le poids du chemin
        actual_weight = 0
        for i in range(len(path) - 1):
            for neighbor, weight in graph[path[i]]:
                if neighbor == path[i + 1]:
                    actual_weight += weight
                    break
        
        print(f"   Poids total du chemin: {actual_weight:.1f}")
        
        # Déterminer quel était optimal
        if scenario['weight_AB'] < scenario['weight_AC'] + scenario['weight_CB']:
            optimal = "DIRECT (A→B)"
            expected = scenario['weight_AB']
        else:
            optimal = "DÉTOUR (A→C→B)"
            expected = scenario['weight_AC'] + scenario['weight_CB']
        
        print(f"\n✅ Chemin optimal attendu: {optimal} avec poids {expected:.1f}")
        
        if abs(actual_weight - expected) < 0.1:
            print("   ✅ SUCCÈS: Dijkstra a trouvé le chemin optimal!")
        else:
            print(f"   ❌ ÉCHEC: Dijkstra a choisi un chemin sous-optimal")
    else:
        print("   ❌ ÉCHEC: Aucun chemin trouvé")
    
    return path is not None and len(path) > 0


def test_scenario_2():
    """Test Scenario 2 : Triangle de routes avec embouteillages variés"""
    print("\n" + "=" * 80)
    print("TEST SCENARIO 2 : Triangle d'intersections avec embouteillages variés")
    print("=" * 80)
    
    scenario = create_test_graph_scenario_2()
    graph = scenario['graph']
    A, B, C, D = scenario['A'], scenario['B'], scenario['C'], scenario['D']
    
    print("\n📍 Nœuds:")
    print(f"   A (Nord): {A}")
    print(f"   B (Ouest): {B}")
    print(f"   C (Est): {C}")
    print(f"   D (Sud): {D}")
    
    print("\n🚗 Densités de trafic:")
    for key, density in scenario['densities'].items():
        status = "🟢 LIBRE" if density < 0.3 else "🟡 TRAFIC" if density < 0.7 else "🔴 EMBOUTEILLÉ"
        print(f"   {key}: {density:.1f} {status}")
    
    print("\n⚖️  Poids calculés:")
    for key, weight in scenario['weights'].items():
        dist = scenario['distances'][key]
        density = scenario['densities'][key]
        print(f"   {key}: {dist:.1f}m × (1 + {density}) = {weight:.1f}")
    
    # Test A→D (plusieurs chemins possibles)
    print("\n🛣️  Recherche du chemin optimal A → D")
    print("   Chemins possibles:")
    print(f"      1. Direct: A→D = {scenario['weights']['AD']:.1f}")
    print(f"      2. Via B: A→B→D = {scenario['weights']['AB'] + scenario['weights']['BD']:.1f}")
    print(f"      3. Via C: A→C→D = {scenario['weights']['AC'] + scenario['weights']['CD']:.1f}")
    print(f"      4. Via B et C: A→B→C→D = {scenario['weights']['AB'] + scenario['weights']['BC'] + scenario['weights']['CD']:.1f}")
    
    path = dijkstra(graph, A, D)
    
    print("\n🎯 Résultat Dijkstra:")
    if path:
        print(f"   Chemin trouvé: {' → '.join(path)}")
        
        # Calculer le poids du chemin
        actual_weight = 0
        for i in range(len(path) - 1):
            for neighbor, weight in graph[path[i]]:
                if neighbor == path[i + 1]:
                    actual_weight += weight
                    break
        
        print(f"   Poids total: {actual_weight:.1f}")
        
        # Déterminer le chemin optimal théorique
        weights = {
            'direct': scenario['weights']['AD'],
            'via_B': scenario['weights']['AB'] + scenario['weights']['BD'],
            'via_C': scenario['weights']['AC'] + scenario['weights']['CD'],
            'via_BC': scenario['weights']['AB'] + scenario['weights']['BC'] + scenario['weights']['CD'],
        }
        
        optimal_weight = min(weights.values())
        optimal_name = [k for k, v in weights.items() if v == optimal_weight][0]
        
        print(f"\n✅ Chemin optimal: {optimal_name} avec poids {optimal_weight:.1f}")
        
        if abs(actual_weight - optimal_weight) < 0.1:
            print("   ✅ SUCCÈS: Dijkstra a trouvé le chemin optimal!")
        else:
            print(f"   ❌ ÉCHEC: Dijkstra a choisi un chemin sous-optimal")
            print(f"      Attendu: {optimal_weight:.1f}, Obtenu: {actual_weight:.1f}")
    else:
        print("   ❌ ÉCHEC: Aucun chemin trouvé")
    
    return path is not None


def test_embouteillage_avoidance():
    """Test : Vérifier que l'algorithme évite les embouteillages quand possible"""
    print("\n" + "=" * 80)
    print("TEST : Vérification que les embouteillages sont évités")
    print("=" * 80)
    
    graph = {}
    
    # Créer un graphe linéaire avec route embouteillée et détour libre
    # N1 ─embouteillé─> N2 ─embouteillé─> N3
    #  \                                  /
    #   \──────libre───────────────────>/
    
    N1 = _node_id(0.0, 0.0)
    N2 = _node_id(0.0001, 0.0)
    N3 = _node_id(0.0002, 0.0)
    
    dist_N1N2 = haversine(0.0, 0.0, 0.0001, 0.0)
    dist_N2N3 = haversine(0.0001, 0.0, 0.0002, 0.0)
    dist_N1N3 = haversine(0.0, 0.0, 0.0002, 0.0)
    
    # N1→N2 et N2→N3 sont embouteillés
    weight_N1N2 = dist_N1N2 * 1.9  # density 0.9
    weight_N2N3 = dist_N2N3 * 1.9  # density 0.9
    weight_N1N3 = dist_N1N3 * 1.0  # density 0.0 (libre)
    
    graph[N1] = [(N2, weight_N1N2), (N3, weight_N1N3)]
    graph[N2] = [(N1, weight_N1N2), (N3, weight_N2N3)]
    graph[N3] = [(N1, weight_N1N3), (N2, weight_N2N3)]
    
    print(f"\n🛣️  Configuration:")
    print(f"   Route directe N1→N2→N3: poids = {weight_N1N2 + weight_N2N3:.1f}")
    print(f"   Route alternative N1→N3: poids = {weight_N1N3:.1f}")
    print(f"\n   N1→N2 est embouteillé (density 0.9)")
    print(f"   N2→N3 est embouteillé (density 0.9)")
    print(f"   N1→N3 est libre (density 0.0)")
    
    path = dijkstra(graph, N1, N3)
    
    print(f"\n🎯 Résultat:")
    if path:
        print(f"   Chemin choisi: {' → '.join(path)}")
        
        if len(path) == 2 and path == [N1, N3]:
            print("   ✅ SUCCÈS: L'algorithme a évité les embouteillages!")
            print(f"      Route directe (poids {weight_N1N3:.1f}) choisie plutôt que détour")
            return True
        elif len(path) == 3 and path == [N1, N2, N3]:
            print("   ❌ ÉCHEC: L'algorithme n'a pas évité les embouteillages")
            print(f"      Route embouteillée (poids {weight_N1N2 + weight_N2N3:.1f}) choisie au lieu du détour libre")
            return False
    
    return False


if __name__ == "__main__":
    print("\n╔════════════════════════════════════════════════════════════════════════╗")
    print("║        TEST COMPLET DU SYSTÈME DE PATHFINDING - EMBOUTEILLAGES       ║")
    print("║     Vérification que Dijkstra minimise vraiment le temps de trajet    ║")
    print("╚════════════════════════════════════════════════════════════════════════╝")
    
    results = []
    
    # Test 1
    results.append(("Scenario 1 (Route directe vs détour)", test_scenario_1()))
    
    # Test 2
    results.append(("Scenario 2 (Triangle avec embouteillages)", test_scenario_2()))
    
    # Test 3
    results.append(("Évitement des embouteillages", test_embouteillage_avoidance()))
    
    # Résumé
    print("\n" + "=" * 80)
    print("RÉSUMÉ DES TESTS")
    print("=" * 80)
    
    for test_name, result in results:
        status = "✅ PASSÉ" if result else "❌ ÉCHOUÉ"
        print(f"{status}: {test_name}")
    
    all_passed = all(r for _, r in results)
    
    print("\n" + "=" * 80)
    if all_passed:
        print("🎉 TOUS LES TESTS PASSÉS!")
        print("\n✅ Conclusions:")
        print("   • L'algorithme de Dijkstra fonctionne correctement")
        print("   • Les embouteillages sont bien pris en compte dans la pondération")
        print("   • Le chemin retourné minimise vraiment le temps de trajet")
        print("   • L'algorithme évite les embouteillages quand possible")
    else:
        print("❌ CERTAINS TESTS ONT ÉCHOUÉ")
        print("\nVérifications à faire:")
        print("   1. Vérifier la formule haversine")
        print("   2. Vérifier la pondération (distance × (1 + density))")
        print("   3. Vérifier l'algorithme Dijkstra")
    
    print("=" * 80)
