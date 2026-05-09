import json
import math
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from .models import RoadSegment, POI, TrafficSnapshot
from .serializers import (
    RoadSegmentSerializer, POISerializer,
    TrafficSnapshotSerializer, TrafficSnapshotIngestSerializer,
)
from google import genai
from google.genai import types
import os
from dotenv import load_dotenv

load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

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

class ChatbotView(APIView):
    def post(self, request):
        user_query = request.data.get('query')
        current_traffic_context = "The traffic is heavy in Anosizato and Analakely due to peak hours (5 PM)."
        
        try:
            if not GEMINI_API_KEY:
                return Response({
                    'response': f"Chatbot Mock (Gemini): To avoid traffic in Anosizato at 5 PM, I recommend taking the bypass road through Itaosy. (GEMINI_API_KEY missing)"
                })

            client = genai.Client(api_key=GEMINI_API_KEY)
            model_id = "gemini-2.0-flash" # Defaulting to flash for speed

            prompt = f"You are a traffic assistant for Antananarivo, Madagascar. Context: {current_traffic_context}\nUser: {user_query}"
            
            response = client.models.generate_content(
                model=model_id,
                contents=prompt,
                config=types.GenerateContentConfig(
                    tools=[types.Tool(google_search=types.GoogleSearch())]
                )
            )
            
            return Response({'response': response.text})
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


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

