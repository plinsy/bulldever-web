from django.core.management.base import BaseCommand
from traffic.models import RoadSegment, POI


class Command(BaseCommand):
    help = 'Seeds initial data for Antananarivo'

    def handle(self, *args, **options):
        RoadSegment.objects.all().delete()
        POI.objects.all().delete()

        # -------------------------------------------------------------------
        # Connected grid covering central Antananarivo (visible at zoom 14)
        # Rows (lat south): -18.885 → -18.945, step -0.005  (13 rows)
        # Cols (lng east):   47.490 → 47.570, step +0.005  (17 cols)
        # All intersections are shared exactly → fully connected graph.
        # -------------------------------------------------------------------
        LATS = [round(-18.885 - i * 0.005, 3) for i in range(13)]
        LNGS = [round(47.490 + i * 0.005, 3) for i in range(17)]

        roads = []

        # East-west segments
        for lat in LATS:
            for j in range(len(LNGS) - 1):
                roads.append({
                    "name": f"Axe E-O ({lat})",
                    "geometry": [
                        {"lat": lat, "lng": LNGS[j]},
                        {"lat": lat, "lng": LNGS[j + 1]},
                    ],
                    "speed_limit": 40,
                    "density": 0.2,
                })

        # North-south segments
        for lng in LNGS:
            for i in range(len(LATS) - 1):
                roads.append({
                    "name": f"Axe N-S ({lng})",
                    "geometry": [
                        {"lat": LATS[i], "lng": lng},
                        {"lat": LATS[i + 1], "lng": lng},
                    ],
                    "speed_limit": 40,
                    "density": 0.2,
                })

        # -------------------------------------------------------------------
        # Named arteries — waypoints aligned to grid nodes
        # -------------------------------------------------------------------
        named_roads = [
            {
                "name": "Avenue de l'Indépendance",
                "geometry": [
                    {"lat": -18.900, "lng": 47.520},
                    {"lat": -18.905, "lng": 47.520},
                    {"lat": -18.910, "lng": 47.520},
                    {"lat": -18.915, "lng": 47.520},
                ],
                "speed_limit": 40,
                "density": 0.5,
            },
            {
                "name": "Route Digue",
                "geometry": [
                    {"lat": -18.910, "lng": 47.525},
                    {"lat": -18.910, "lng": 47.530},
                    {"lat": -18.910, "lng": 47.535},
                    {"lat": -18.910, "lng": 47.540},
                ],
                "speed_limit": 50,
                "density": 0.4,
            },
            {
                "name": "Route d'Anosizato",
                "geometry": [
                    {"lat": -18.925, "lng": 47.495},
                    {"lat": -18.930, "lng": 47.500},
                    {"lat": -18.935, "lng": 47.505},
                    {"lat": -18.940, "lng": 47.510},
                ],
                "speed_limit": 60,
                "density": 0.3,
            },
            {
                "name": "Tunnel d'Ambohidahy",
                "geometry": [
                    {"lat": -18.910, "lng": 47.520},
                    {"lat": -18.910, "lng": 47.515},
                    {"lat": -18.910, "lng": 47.510},
                ],
                "speed_limit": 30,
                "density": 0.6,
            },
            {
                "name": "Boulevard de l'Europe",
                "geometry": [
                    {"lat": -18.895, "lng": 47.530},
                    {"lat": -18.900, "lng": 47.530},
                    {"lat": -18.905, "lng": 47.530},
                    {"lat": -18.910, "lng": 47.530},
                    {"lat": -18.915, "lng": 47.530},
                ],
                "speed_limit": 50,
                "density": 0.3,
            },
            {
                "name": "Rue Rainandriamampandry",
                "geometry": [
                    {"lat": -18.905, "lng": 47.510},
                    {"lat": -18.905, "lng": 47.515},
                    {"lat": -18.905, "lng": 47.520},
                    {"lat": -18.905, "lng": 47.525},
                    {"lat": -18.905, "lng": 47.530},
                ],
                "speed_limit": 40,
                "density": 0.4,
            },
        ]

        all_roads = roads + named_roads

        for r in all_roads:
            RoadSegment.objects.create(
                name=r['name'],
                geometry=r['geometry'],
                speed_limit=r.get('speed_limit', 40),
                density=r.get('density', 0.2),
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
