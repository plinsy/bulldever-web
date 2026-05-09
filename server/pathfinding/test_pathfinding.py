"""
Script de test pour le système de pathfinding.
À exécuter dans django shell : python manage.py shell < test_pathfinding.py
"""

from pathfinding.graph import build_graph, dijkstra, nearest_node, haversine
from traffic.models import RoadSegment

print("=" * 60)
print("TEST DU SYSTÈME DE PATHFINDING")
print("=" * 60)

# Vérifier que des RoadSegment existent
segments = RoadSegment.objects.all()
print(f"\n✓ RoadSegment trouvés en BDD: {segments.count()}")

if segments.count() > 0:
    # Afficher un exemple
    sample = segments.first()
    print(f"  Exemple: {sample.name or 'Sans nom'}")
    print(f"  Nœuds: {len(sample.geometry)}")
    print(f"  Densité: {sample.density}")
    print(f"  Limite de vitesse: {sample.speed_limit} km/h")

# Construire le graphe
print("\n⏳ Construction du graphe...")
graph = build_graph()
print(f"✓ Graphe construit")
print(f"  Nœuds totaux: {len(graph)}")

# Compter les arêtes
total_edges = sum(len(neighbors) for neighbors in graph.values()) // 2
print(f"  Arêtes totales: {total_edges}")

if len(graph) > 0:
    # Test de la fonction haversine
    print("\n✓ Test haversine:")
    dist = haversine(-18.9, 47.5, -18.91, 47.51)
    print(f"  Distance Antananarivo → 1 latitude/longitude: {dist:.0f}m")
    
    # Test nearest_node
    print("\n✓ Test nearest_node:")
    graph_nodes = list(graph.keys())
    nearest = nearest_node(-18.9, 47.5, graph_nodes)
    print(f"  Nœud le plus proche de (-18.9, 47.5): {nearest}")
    
    # Test dijkstra (si nous avons au moins 2 nœuds)
    if len(graph_nodes) >= 2:
        print("\n✓ Test dijkstra:")
        start = graph_nodes[0]
        end = graph_nodes[-1]
        print(f"  Du point: {start}")
        print(f"  Au point: {end}")
        
        path = dijkstra(graph, start, end)
        if path:
            print(f"  Chemin trouvé! Nœuds: {len(path)}")
            print(f"  Premier nœud: {path[0]}")
            print(f"  Dernier nœud: {path[-1]}")
        else:
            print(f"  Aucun chemin trouvé")
else:
    print("\n⚠ Aucun nœud dans le graphe (pas assez de RoadSegment?)")

print("\n" + "=" * 60)
print("TESTS TERMINÉS")
print("=" * 60)
