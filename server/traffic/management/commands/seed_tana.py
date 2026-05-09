from django.core.management.base import BaseCommand
from traffic.models import RoadSegment, POI

class Command(BaseCommand):
    help = 'Seeds initial data for Antananarivo'

    def handle(self, *args, **options):
        # Coordinates for Antananarivo center (Analakely area)
        # Lat: -18.907, Lng: 47.523
        
        RoadSegment.objects.all().delete()
        POI.objects.all().delete()

        # Simple road segments (representing main axes)
        roads = [
            {
                "name": "Avenue de l'Independance",
                "geometry": [{"lat": -18.905, "lng": 47.522}, {"lat": -18.910, "lng": 47.525}],
                "speed_limit": 40
            },
            {
                "name": "Route Circulaire",
                "geometry": [{"lat": -18.910, "lng": 47.525}, {"lat": -18.915, "lng": 47.530}],
                "speed_limit": 50
            },
            {
                "name": "Anosizato Main Road",
                "geometry": [{"lat": -18.930, "lng": 47.500}, {"lat": -18.935, "lng": 47.490}],
                "speed_limit": 60
            },
             {
                "name": "Tunnel d'Ambohidahy",
                "geometry": [{"lat": -18.911, "lng": 47.521}, {"lat": -18.913, "lng": 47.518}],
                "speed_limit": 30
            }
        ]

        for r in roads:
            RoadSegment.objects.create(
                name=r['name'],
                geometry=r['geometry'],
                speed_limit=r['speed_limit']
            )

        pois = [
            {"name": "Gare Soarano", "category": "Transport", "lat": -18.904, "lng": 47.521},
            {"name": "Hotel de Ville", "category": "Gov", "lat": -18.908, "lng": 47.523},
            {"name": "Lac Anosy", "category": "Park", "lat": -18.914, "lng": 47.519},
        ]

        for p in pois:
            POI.objects.create(
                name=p['name'],
                category=p['category'],
                latitude=p['lat'],
                longitude=p['lng']
            )

        # Simple Buildings
        buildings = [
            {"name": "Analakely Block 1", "lat": -18.906, "lng": 47.522, "height": 10},
            {"name": "Analakely Block 2", "lat": -18.907, "lng": 47.524, "height": 15},
            {"name": "Anosy Tower", "lat": -18.915, "lng": 47.518, "height": 20},
        ]
        
        # We'll use POI model for buildings too or just add them as special POIs
        for b in buildings:
            POI.objects.create(
                name=b['name'],
                category="Building",
                latitude=b['lat'],
                longitude=b['lng'],
                description=str(b['height']) # Store height in description for now
            )

        self.stdout.write(self.style.SUCCESS('Successfully seeded Antananarivo data'))
