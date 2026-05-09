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
from google import genai
from google.genai import types
import os
from dotenv import load_dotenv

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
        
        # In a real app, we'd use A* on the road network
        # For this prototype, we'll return a straight line path along the nearest road segments
        # or a mock path for demonstration.
        
        # Mocking a path
        path = [start, end] # Simplest path
        
        return Response({
            'path': path,
            'distance': 1.5, # km
            'estimated_time': 15 # mins
        })

# --- AI TOOLS DEFINITIONS ---

def get_traffic_stats(zone_id: str = None):
    """
    Récupère les statistiques de trafic en temps réel pour une zone spécifique ou pour toute la ville.
    Zones valides : analakely, anosizato, isotry, 67ha, ambohijatovo, tsaralalana, ankorondrano, behoririka.
    """
    latest = TrafficSnapshot.objects.order_by('-recorded_at').first()
    if not latest:
        return {"error": "Aucune donnée disponible."}
    
    if zone_id:
        zone_data = latest.zone_counts.get(zone_id.lower(), {"total": 0, "stopped": 0})
        return {
            "zone": zone_id,
            "total_cars": zone_data.get("total", 0),
            "stopped_cars": zone_data.get("stopped", 0),
            "congestion_level": f"{round((zone_data.get('stopped', 0) / zone_data.get('total', 1)) * 100)}%" if zone_data.get("total", 0) > 0 else "0%"
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
        z = s.zone_counts.get(zone_id.lower(), {"stopped": 0})
        vals.append(z.get("stopped", 0))
    
    trend = "en augmentation" if vals[0] > vals[-1] else "en diminution" if vals[0] < vals[-1] else "stable"
    return {
        "zone": zone_id,
        "current_stopped": vals[0],
        "trend": trend,
        "prediction": "Risque élevé de bouchon" if trend == "en augmentation" and vals[0] > 5 else "Trafic fluide attendu"
    }

# --- END AI TOOLS ---

class ChatbotView(APIView):
    def post(self, request):
        user_query = request.data.get('query')
        
        try:
            if not GEMINI_API_KEY:
                return Response({
                    'response': "Clé API manquante. Veuillez configurer GEMINI_API_KEY."
                })

            client = genai.Client(api_key=GEMINI_API_KEY)
            model_id = "gemma-4-26b-a4b-it" 

            system_instruction = """
            Vous êtes AlaminoAI, l'assistant expert du Jumeau Numérique d'Antananarivo.
            
            VOS CAPACITÉS :
            - Vous pouvez consulter les statistiques réelles via 'get_traffic_stats'.
            - Vous pouvez prédire l'évolution via 'predict_zone_congestion'.
            - Vous répondez en Français ou Malgache.
            
            CONSEILS :
            - Si l'utilisateur demande "comment est le trafic ?", appelez 'get_traffic_stats'.
            - Soyez précis et utilisez les chiffres retournés par vos outils.
            """

            # Automatic Function Calling configuration
            generate_content_config = types.GenerateContentConfig(
                system_instruction=system_instruction,
                tools=[get_traffic_stats, predict_zone_congestion, types.Tool(google_search=types.GoogleSearch())],
                tool_config=types.ToolConfig(
                    include_server_side_tool_invocations=True
                )
            )
            
            response = client.models.generate_content(
                model=model_id,
                contents=user_query,
                config=generate_content_config
            )
            
            return Response({'response': response.text})

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

