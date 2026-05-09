from django.db import models


class RoadSegment(models.Model):
    name = models.CharField(max_length=255, blank=True)
    geometry = models.JSONField()  # Array of {lat, lng} or [lat, lng]
    density = models.FloatField(default=0.0)  # 0.0 to 1.0 (0: green, 1: red)
    speed_limit = models.FloatField(default=50.0)

    def __str__(self):
        return f"Road: {self.name or 'Unnamed'}"


class TrafficSnapshot(models.Model):
    """Periodic snapshot of simulation-derived traffic metrics."""
    recorded_at = models.DateTimeField(auto_now_add=True, db_index=True)
    sim_hour = models.IntegerField()                     # simulated hour (0-23)
    total_cars = models.IntegerField()
    stopped_cars = models.IntegerField()                 # speed ≈ 0
    cars_in_intersections = models.IntegerField()
    avg_speed_kmh = models.FloatField()
    zone_counts = models.JSONField(default=dict)         # {zone_id: car_count}
    intersection_counts = models.JSONField(default=dict) # {intersection_id: car_count}

    class Meta:
        ordering = ["-recorded_at"]

    def __str__(self):
        return f"Snapshot {self.recorded_at} — hour {self.sim_hour}"


class POI(models.Model):
    name = models.CharField(max_length=255)
    category = models.CharField(max_length=100)
    latitude = models.FloatField()
    longitude = models.FloatField()
    description = models.TextField(blank=True)

    def __str__(self):
        return self.name
