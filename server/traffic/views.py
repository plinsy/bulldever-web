import json
import math
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from .models import RoadSegment, POI, TrafficSnapshot, Accident
from .serializers import (
    RoadSegmentSerializer, POISerializer,
    TrafficSnapshotSerializer, TrafficSnapshotIngestSerializer,
    AccidentSerializer, AccidentReportSerializer,
)
import os
import threading
from dotenv import load_dotenv
from google import genai
from google.genai import types
from pathfinding.graph import build_graph, dijkstra, nearest_node, _parse_node_id

# Thread-local storage to capture actions during tool execution
request_context = threading.local()

load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    GEMINI_API_KEY = GEMINI_API_KEY.strip()
    print(f"DEBUG: Final API Key: {GEMINI_API_KEY[:5]}...{GEMINI_API_KEY[-4:]} (length: {len(GEMINI_API_KEY)})")
else:
    print("DEBUG: GEMINI_API_KEY is NOT set!")

class TrafficDataView(APIView):
    def get(self, request):
        hour = int(request.query_params.get('hour', 12))
        roads = RoadSegment.objects.all()
        
        # Simple procedural traffic density based on hour
        # Peak hours: 7-9 AM and 4-7 PM
        peak_factor = 0.0
        if 7 <= hour <= 9 or 16 <= hour <= 19:
            peak_factor = 0.6
        elif 10 <= hour <= 15:
            peak_factor = 0.3
        else:
            peak_factor = 0.1

        data = []
        for road in roads:
            # Add some randomness to each road
            density = min(1.0, peak_factor + (hash(road.id) % 10) / 30.0)
            data.append({
                'id': road.id,
                'name': road.name,
                'geometry': road.geometry,
                'density': density
            })
            
        return Response(data)

class POIView(APIView):
    def get(self, request):
        pois = POI.objects.all()
        serializer = POISerializer(pois, many=True)
        return Response(serializer.data)

class PathfindingView(APIView):
    def post(self, request):
        start = request.data.get('start') # {lat, lng}
        end = request.data.get('end')     # {lat, lng}
        
        if not start or not end:
            return Response({'error': 'start and end coordinates are required'}, status=status.HTTP_400_BAD_REQUEST)
            
        result = _calculate_route_path(start['lat'], start['lng'], end['lat'], end['lng'])
        
        if "error" in result:
            return Response(result, status=status.HTTP_400_BAD_REQUEST)
            
        return Response({
            'path': result['path'],
            'distance': result['distance_km'],
            'estimated_time': max(1, int(result['distance_km'] * 60 / 20)) # Assuming 20km/h avg in Mada
        })

# --- AI TOOLS DEFINITIONS ---

def get_traffic_stats(zone_id: str = None):
    """
    Récupère les statistiques de trafic en temps réel pour une zone spécifique ou pour toute la ville.
    N'importe quel quartier d'Antananarivo est valide s'il y a du trafic (ex: analakely, mahamasina, etc.).
    """
    latest = TrafficSnapshot.objects.order_by('-recorded_at').first()
    if not latest:
        return {"error": "Aucune donnée disponible."}
    
    if zone_id:
        val = latest.zone_counts.get(zone_id.lower(), 0)
        # Handle both integer (stopped count) and dict format
        stopped = val.get("stopped", 0) if isinstance(val, dict) else val
        total = val.get("total", 0) if isinstance(val, dict) else "N/A"
        
        return {
            "zone": zone_id,
            "total_cars": total,
            "stopped_cars": stopped,
            "congestion_level": f"{round((stopped / total) * 100)}%" if isinstance(total, int) and total > 0 else "0%"
        }
    
    return {
        "total_city_cars": latest.total_cars,
        "total_city_stopped": latest.stopped_cars,
        "avg_speed": latest.avg_speed_kmh,
        "timestamp": latest.recorded_at.isoformat()
    }

def predict_zone_congestion(zone_id: str):
    """
    Prédit le niveau de congestion futur pour une zone donnée en analysant les tendances récentes.
    """
    snapshots = TrafficSnapshot.objects.order_by('-recorded_at')[:5]
    if len(snapshots) < 2:
        return {"prediction": "Incertain (pas assez de données)", "trend": "stable"}
    
    # Simple logic: is it increasing?
    vals = []
    for s in snapshots:
        val = s.zone_counts.get(zone_id.lower(), 0)
        stopped = val.get("stopped", 0) if isinstance(val, dict) else val
        vals.append(stopped)
    
    trend = "en augmentation" if vals[0] > vals[-1] else "en diminution" if vals[0] < vals[-1] else "stable"
    return {
        "zone": zone_id,
        "current_stopped": vals[0],
        "trend": trend,
        "prediction": "Risque élevé de bouchon" if trend == "en augmentation" and vals[0] > 5 else "Trafic fluide attendu"
    }

def _calculate_route_path(start_lat: float, start_lng: float, end_lat: float, end_lng: float):
    import heapq, math, urllib.request, urllib.parse, json as _json

    def haversine(lat1, lng1, lat2, lng2):
        R = 6371000
        r1, r2 = math.radians(lat1), math.radians(lat2)
        dlat, dlng = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
        a = math.sin(dlat/2)**2 + math.cos(r1)*math.cos(r2)*math.sin(dlng/2)**2
        return R * 2 * math.asin(math.sqrt(a))

    try:
        margin = 0.015  # ~1.5 km padding around the route
        min_lat = min(start_lat, end_lat) - margin
        max_lat = max(start_lat, end_lat) + margin
        min_lng = min(start_lng, end_lng) - margin
        max_lng = max(start_lng, end_lng) + margin
        bbox = f"{min_lat},{min_lng},{max_lat},{max_lng}"

        query = f"""
        [out:json][timeout:20];
        (
          way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|service)$"]
            ({bbox});
        );
        out body;
        >;
        out skel qt;
        """
        data = urllib.parse.urlencode({"data": query}).encode()
        req = urllib.request.Request(
            "https://overpass-api.de/api/interpreter",
            data=data,
            headers={"User-Agent": "AlaminoAI/1.0"}
        )
        with urllib.request.urlopen(req, timeout=25) as resp:
            osm = _json.loads(resp.read())

        nodes = {}
        ways = []
        for el in osm.get("elements", []):
            if el["type"] == "node":
                nodes[el["id"]] = (el["lat"], el["lon"])
            elif el["type"] == "way" and "nodes" in el:
                ways.append(el["nodes"])

        if not nodes or not ways:
            return {"error": "Aucune route trouvée dans cette zone"}

        graph = {}
        for way in ways:
            for i in range(len(way) - 1):
                a, b = way[i], way[i + 1]
                if a not in nodes or b not in nodes:
                    continue
                la, loa = nodes[a]
                lb, lob = nodes[b]
                d = haversine(la, loa, lb, lob)
                graph.setdefault(a, []).append((b, d))
                graph.setdefault(b, []).append((a, d))

        def nearest(lat, lng):
            best, best_d = None, float('inf')
            for nid, (nlat, nlng) in nodes.items():
                if nid not in graph:
                    continue
                d = haversine(lat, lng, nlat, nlng)
                if d < best_d:
                    best, best_d = nid, d
            return best

        start_node = nearest(start_lat, start_lng)
        end_node   = nearest(end_lat,   end_lng)

        if start_node is None or end_node is None:
            return {"error": "Impossible de localiser les points sur le réseau routier"}

        dist = {start_node: 0.0}
        prev = {}
        heap = [(0.0, start_node)]
        visited = set()

        while heap:
            d, u = heapq.heappop(heap)
            if u in visited:
                continue
            visited.add(u)
            if u == end_node:
                break
            for v, w in graph.get(u, []):
                nd = d + w
                if nd < dist.get(v, float('inf')):
                    dist[v] = nd
                    prev[v] = u
                    heapq.heappush(heap, (nd, v))

        if end_node not in dist or dist[end_node] == float('inf'):
            return {"error": "Aucun chemin trouvé entre ces deux points"}

        path_ids, cur = [], end_node
        while cur is not None:
            path_ids.append(cur)
            cur = prev.get(cur)
        path_ids.reverse()

        path_coords = []
        last_lat, last_lng = None, None
        for nid in path_ids:
            lat, lng = nodes[nid]
            if last_lat is None or haversine(last_lat, last_lng, lat, lng) > 30:
                path_coords.append({"lat": lat, "lng": lng})
                last_lat, last_lng = lat, lng

        total_dist = round(dist[end_node] / 1000, 1)
        return {
            "path": path_coords,
            "distance_km": total_dist,
        }

    except Exception as e:
        return {"error": f"Erreur interne de routage: {str(e)}"}


def find_route(start_lat: float, start_lng: float, end_lat: float, end_lng: float):
    """
    Calcule le meilleur itinéraire entre deux points GPS et l'affiche sur la carte en vert.
    Utilise les vraies données routières OpenStreetMap (Overpass API) — pas de liste codée en dur.
    Les coordonnées doivent être en degrés décimaux (ex: lat=-18.91, lng=47.53).
    """
    result = _calculate_route_path(start_lat, start_lng, end_lat, end_lng)
    
    if "error" in result:
        return result

    path_coords = result["path"]
    total_dist = result["distance_km"]

    # ── Send actions to the frontend ──────────────────────────────
    if not hasattr(request_context, 'actions'):
        request_context.actions = []
    request_context.actions.append({"type": "SET_PATH", "payload": path_coords})
    request_context.actions.append({
        "type": "MOVE_CAMERA",
        "payload": {"lat": start_lat, "lng": start_lng, "zoom": 15}
    })

    return {
        "status": "Route tracée sur la carte",
        "points": len(path_coords),
        "distance_km": total_dist,
    }


def move_camera(lat: float, lng: float, zoom: float = 18):
    """
    Déplace la caméra de la carte vers une position spécifique (lat, lng).
    """
    if not hasattr(request_context, 'actions'): request_context.actions = []
    request_context.actions.append({
        "type": "MOVE_CAMERA",
        "payload": {"lat": lat, "lng": lng, "zoom": zoom}
    })
    return {"status": "Caméra déplacée"}

# --- END AI TOOLS ---

class ChatbotView(APIView):
    def post(self, request):
        user_query = request.data.get('query')
        user_loc = request.data.get('user_location') # Expects {lat, lng}
        
        # Initialize context for this request
        request_context.actions = []
        
        try:
            if not GEMINI_API_KEY:
                return Response({
                    'response': "Clé API manquante. Veuillez configurer GEMINI_API_KEY."
                })

            client = genai.Client(api_key=GEMINI_API_KEY)
            model_id = "gemma-4-26b-a4b-it" 

            loc_str = ""
            if user_loc:
                loc_str = f"\nPOSITION ACTUELLE DE L'UTILISATEUR : lat {user_loc.get('lat')}, lng {user_loc.get('lng')}"

            system_instruction = f"""
            Vous êtes AlaminoAI, l'assistant expert et contrôleur de la carte d'Antananarivo.
            {loc_str}
            
            VOS CAPACITÉS :
            - Consulter les stats via 'get_traffic_stats'.
            - Prédire l'évolution via 'predict_zone_congestion'.
            - Calculer et AFFICHER un itinéraire via 'find_route'. Utilisez la POSITION ACTUELLE DE L'UTILISATEUR comme point de départ si on vous demande un trajet depuis 'ma position'.
            - Déplacer la caméra via 'move_camera'.
            
            POINTS CONNUS (lat, lng) :
            - Analakely: -18.905, 47.525
            - Anosizato: -18.935, 47.502
            - Isotry: -18.902, 47.514
            - 67Ha: -18.898, 47.508
            - Ivato: -18.796, 47.478
            
            RÈGLES :
           * Pour les questions de trafic, utilisez l'outil get_traffic_stats(). S'il y a un quartier précisé, passez-le en paramètre (ex: "analakely", "mahamasina", "ankadifotsy").
        * Pour les itinéraires, utilisez l'outil find_route().
        * Vous connaissez géographiquement Antananarivo. Utilisez les outils pour donner des réponses réelles.
            - Si l'utilisateur veut voir un endroit, utilisez 'move_camera'.
            - Répondez en par la langue que le utilisateur utilise.
            """

            # Use Chat API with Automatic Function Calling
            chat = client.chats.create(
                model=model_id,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    tools=[get_traffic_stats, predict_zone_congestion, find_route, move_camera],
                    automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=False)
                )
            )
            
            response = chat.send_message(user_query)
            
            return Response({
                'response': response.text,
                'actions': getattr(request_context, 'actions', [])
            })

        except Exception as e:
            print(f"Chatbot Tool Error: {str(e)}")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# Scene-unit radius used when grouping nearby accidents into a single hotspot.
_CLUSTER_RADIUS = 30.0
# Minimum number of accidents in a cluster for it to be flagged as a hotspot.
_HOTSPOT_THRESHOLD = 2


def _build_hotspots(accidents):
    """Greedy O(n*k) clustering of accident records into danger-zone hotspots.

    Returns a list of dicts: {x, z, count, bodily_count, severity}
    Only clusters with count >= _HOTSPOT_THRESHOLD are returned so isolated
    one-off accidents don't pollute the map.
    """
    clusters = []
    for acc in accidents:
        placed = False
        for cluster in clusters:
            dx = acc.scene_x - cluster["x"]
            dz = acc.scene_z - cluster["z"]
            if (dx * dx + dz * dz) ** 0.5 < _CLUSTER_RADIUS:
                # Weighted centroid update
                n = cluster["count"]
                cluster["x"] = (cluster["x"] * n + acc.scene_x) / (n + 1)
                cluster["z"] = (cluster["z"] * n + acc.scene_z) / (n + 1)
                cluster["count"] += 1
                if acc.bodily:
                    cluster["bodily_count"] += 1
                placed = True
                break
        if not placed:
            clusters.append({
                "x": acc.scene_x,
                "z": acc.scene_z,
                "count": 1,
                "bodily_count": 1 if acc.bodily else 0,
            })

    result = []
    for c in clusters:
        if c["count"] < _HOTSPOT_THRESHOLD:
            continue
        c["severity"] = "high" if c["bodily_count"] > 0 else "medium"
        result.append(c)
    return result


class AccidentView(APIView):
    """
    POST – record an accident event from the simulation.
    GET  – return aggregated hotspots derived from recent accident history.
    """

    def post(self, request):
        serializer = AccidentReportSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        accident = Accident.objects.create(**serializer.validated_data)
        return Response(AccidentSerializer(accident).data, status=status.HTTP_201_CREATED)

    def get(self, request):
        # Use the most recent 500 accidents to compute hotspots so the map
        # stays relevant without an unbounded query.
        recent = Accident.objects.all()[:500]
        hotspots = _build_hotspots(list(recent))
        return Response(hotspots)


class TrafficStatsView(APIView):
    """
    POST  – ingest a simulation snapshot from the frontend.
    GET   – return the latest N snapshots (default 20) for dashboards.
    """

    def post(self, request):
        serializer = TrafficSnapshotIngestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        snapshot = TrafficSnapshot.objects.create(**serializer.validated_data)
        return Response(
            TrafficSnapshotSerializer(snapshot).data,
            status=status.HTTP_201_CREATED,
        )

    def get(self, request):
        limit = min(int(request.query_params.get("limit", 20)), 200)
        snapshots = TrafficSnapshot.objects.all()[:limit]
        serializer = TrafficSnapshotSerializer(snapshots, many=True)
        return Response(serializer.data)


class CongestionPredictionView(APIView):
    """
    Analyzes historical snapshots to predict future congestion.
    """
    def get(self, request):
        # Fetch last 10 snapshots
        snapshots = list(TrafficSnapshot.objects.all()[:10])
        if len(snapshots) < 3:
            return Response({"status": "insufficient_data", "alerts": []})

        alerts = []
        # Reverse to have chronological order for trend analysis
        snapshots.reverse()
        
        # 1. Global trend
        latest = snapshots[-1]
        prev = snapshots[-2]
        
        stopped_delta = latest.stopped_cars - prev.stopped_cars
        if stopped_delta > 5:
            alerts.append({
                "type": "global",
                "level": "warning",
                "message": f"Global congestion increasing (+{stopped_delta} cars stopped)"
            })

        # 2. Zone-specific trend
        all_zones = latest.zone_counts.keys()
        for zone_id in all_zones:
            l_val = latest.zone_counts.get(zone_id, 0)
            p_val = prev.zone_counts.get(zone_id, 0)
            
            # Handle both legacy dict format and new integer format
            latest_count = l_val.get('stopped', 0) if isinstance(l_val, dict) else l_val
            prev_count = p_val.get('stopped', 0) if isinstance(p_val, dict) else p_val
            
            # If stopped cars in zone increased by > 2 in 5 seconds
            if latest_count > prev_count + 2:
                alerts.append({
                    "type": "zone",
                    "zone_id": zone_id,
                    "level": "danger" if latest_count > 10 else "warning",
                    "message": f"Congestion imminent in {zone_id}"
                })

        return Response({
            "status": "ok",
            "timestamp": latest.recorded_at,
            "alerts": alerts,
            "prediction_confidence": 0.85
        })

