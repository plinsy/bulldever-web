import json
from channels.generic.websocket import AsyncWebsocketConsumer
from .models import TrafficSnapshot, Accident
from .serializers import TrafficSnapshotIngestSerializer, AccidentReportSerializer
from channels.db import database_sync_to_async

class TrafficConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.group_name = "traffic_updates"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data):
        data = json.loads(text_data)
        action = data.get('action')

        if action == 'snapshot':
            payload = data.get('payload')
            # Save to database
            snapshot = await self.save_snapshot(payload)
            if snapshot:
                # Check for congestion
                alerts = await self.check_congestion()
                if alerts:
                    await self.channel_layer.group_send(
                        self.group_name,
                        {
                            'type': 'traffic_message',
                            'message': {
                                'action': 'congestion_alerts',
                                'payload': alerts
                            }
                        }
                    )
            
            # Broadcast to everyone else
            await self.channel_layer.group_send(
                self.group_name,
                {
                    'type': 'traffic_message',
                    'message': data
                }
            )
            
        elif action == 'accident':
            payload = data.get('payload')
            await self.save_accident(payload)
            # Broadcast the accident
            await self.channel_layer.group_send(
                self.group_name,
                {
                    'type': 'traffic_message',
                    'message': data
                }
            )

    async def traffic_message(self, event):
        message = event['message']
        await self.send(text_data=json.dumps(message))

    @database_sync_to_async
    def save_snapshot(self, payload):
        serializer = TrafficSnapshotIngestSerializer(data=payload)
        if serializer.is_valid():
            return serializer.save()
        else:
            print(f"WS Snapshot Error: {serializer.errors}")
            return None

    @database_sync_to_async
    def save_accident(self, payload):
        serializer = AccidentReportSerializer(data=payload)
        if serializer.is_valid():
            return serializer.save()
        else:
            print(f"WS Accident Error: {serializer.errors}")
            return None

    @database_sync_to_async
    def check_congestion(self):
        snapshots = list(TrafficSnapshot.objects.order_by('-recorded_at')[:2])
        if len(snapshots) < 2:
            return []
            
        latest = snapshots[0]
        prev = snapshots[1]
        alerts = []
        
        all_zones = latest.zone_counts.keys()
        for zone_id in all_zones:
            l_val = latest.zone_counts.get(zone_id, 0)
            p_val = prev.zone_counts.get(zone_id, 0)
            
            latest_count = l_val.get('stopped', 0) if isinstance(l_val, dict) else l_val
            prev_count = p_val.get('stopped', 0) if isinstance(p_val, dict) else p_val
            
            if latest_count > prev_count + 2:
                alerts.append({
                    "type": "zone",
                    "zone_id": zone_id,
                    "level": "danger" if latest_count > 10 else "warning",
                    "message": f"Congestion imminente: {zone_id} ({latest_count} voitures à l'arrêt)"
                })
        return alerts
