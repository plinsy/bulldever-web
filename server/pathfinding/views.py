from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from .graph import build_graph, dijkstra, nearest_node, haversine, _parse_node_id


class ShortestPathView(APIView):
    """
    Endpoint qui calcule le plus court chemin entre deux coordonnées GPS
    en utilisant l'algorithme de Dijkstra avec pondération par densité de trafic.
    """
    
    def get(self, request, *args, **kwargs):
        """
        GET /api/shortest-path/?start_lat=<float>&start_lng=<float>&end_lat=<float>&end_lng=<float>
        """
        try:
            # Récupérer et valider les paramètres
            start_lat = request.query_params.get('start_lat')
            start_lng = request.query_params.get('start_lng')
            end_lat = request.query_params.get('end_lat')
            end_lng = request.query_params.get('end_lng')
            
            # Vérifier que tous les paramètres sont présents
            if not all([start_lat, start_lng, end_lat, end_lng]):
                return Response(
                    {"error": "Paramètres invalides"},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Convertir en float et valider
            try:
                start_lat = float(start_lat)
                start_lng = float(start_lng)
                end_lat = float(end_lat)
                end_lng = float(end_lng)
            except ValueError:
                return Response(
                    {"error": "Paramètres invalides"},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Construire le graphe
            graph = build_graph()
            
            if not graph:
                return Response(
                    {"error": "Aucun chemin trouvé"},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Obtenir la liste de tous les nœuds
            graph_nodes = list(graph.keys())
            
            # Trouver les nœuds les plus proches des points de départ et d'arrivée
            start_node = nearest_node(start_lat, start_lng, graph_nodes)
            end_node = nearest_node(end_lat, end_lng, graph_nodes)
            
            # Récupérer les coordonnées réelles des nœuds snappés
            start_snapped_lat, start_snapped_lng = _parse_node_id(start_node)
            end_snapped_lat, end_snapped_lng = _parse_node_id(end_node)
            
            # Lancer l'algorithme de Dijkstra
            path_nodes = dijkstra(graph, start_node, end_node)
            
            if path_nodes is None:
                return Response(
                    {"error": "Aucun chemin trouvé"},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Convertir les identifiants de nœuds en coordonnées
            path_coords = []
            total_distance = 0.0
            
            for i, node_id in enumerate(path_nodes):
                lat, lng = _parse_node_id(node_id)
                path_coords.append({"lat": lat, "lng": lng})
                
                # Calculer la distance entre les nœuds consécutifs (sans facteur density)
                if i > 0:
                    prev_lat, prev_lng = _parse_node_id(path_nodes[i - 1])
                    segment_distance = haversine(prev_lat, prev_lng, lat, lng)
                    total_distance += segment_distance
            
            # Construire la réponse
            response_data = {
                "path": path_coords,
                "total_distance_m": round(total_distance, 2),
                "node_count": len(path_nodes),
                "start_snapped": {
                    "lat": start_snapped_lat,
                    "lng": start_snapped_lng
                },
                "end_snapped": {
                    "lat": end_snapped_lat,
                    "lng": end_snapped_lng
                }
            }
            
            return Response(response_data, status=status.HTTP_200_OK)
        
        except Exception as e:
            return Response(
                {"error": f"Erreur interne: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
