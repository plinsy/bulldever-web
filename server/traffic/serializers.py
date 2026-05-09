from rest_framework import serializers
from .models import RoadSegment, POI

class RoadSegmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = RoadSegment
        fields = '__all__'

class POISerializer(serializers.ModelSerializer):
    class Meta:
        model = POI
        fields = '__all__'
