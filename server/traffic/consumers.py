import json
from channels.generic.websocket import AsyncWebsocketConsumer
from .models import TrafficSnapshot
from .serializers import TrafficSnapshotIngestSerializer
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
            await self.save_snapshot(payload)
            # Broadcast to everyone else
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
            serializer.save()
        else:
            print(f"WS Serializer Error: {serializer.errors}")
