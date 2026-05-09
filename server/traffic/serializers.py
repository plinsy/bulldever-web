from rest_framework import serializers
from .models import RoadSegment, POI, TrafficSnapshot, Accident


class RoadSegmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = RoadSegment
        fields = '__all__'


class POISerializer(serializers.ModelSerializer):
    class Meta:
        model = POI
        fields = '__all__'


class TrafficSnapshotSerializer(serializers.ModelSerializer):
    class Meta:
        model = TrafficSnapshot
        fields = '__all__'
        read_only_fields = ('id', 'recorded_at')


class AccidentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Accident
        fields = '__all__'
        read_only_fields = ('id', 'recorded_at')


class AccidentReportSerializer(serializers.Serializer):
    """Validates the payload sent by the frontend on each collision."""
    scene_x = serializers.FloatField()
    scene_z = serializers.FloatField()
    bodily = serializers.BooleanField(default=False)


class TrafficSnapshotIngestSerializer(serializers.Serializer):
    """Validates the payload sent by the frontend simulation."""
    sim_hour = serializers.IntegerField(min_value=0, max_value=23)
    total_cars = serializers.IntegerField(min_value=0)
    stopped_cars = serializers.IntegerField(min_value=0)
    cars_in_intersections = serializers.IntegerField(min_value=0)
    avg_speed_kmh = serializers.FloatField(min_value=0)
    zone_counts = serializers.DictField(child=serializers.IntegerField(min_value=0), default=dict)
    intersection_counts = serializers.DictField(child=serializers.IntegerField(min_value=0), default=dict)
