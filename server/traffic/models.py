from django.db import models

class RoadSegment(models.Model):
    name = models.CharField(max_length=255, blank=True)
    geometry = models.JSONField()  # Array of {lat, lng} or [lat, lng]
    density = models.FloatField(default=0.0)  # 0.0 to 1.0 (0: green, 1: red)
    speed_limit = models.FloatField(default=50.0)
    
    def __str__(self):
        return f"Road: {self.name or 'Unnamed'}"

class POI(models.Model):
    name = models.CharField(max_length=255)
    category = models.CharField(max_length=100)
    latitude = models.FloatField()
    longitude = models.FloatField()
    description = models.TextField(blank=True)

    def __str__(self):
        return self.name
