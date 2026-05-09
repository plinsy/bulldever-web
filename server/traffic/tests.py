from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status

from .models import RoadSegment, TrafficSnapshot


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

VALID_SNAPSHOT_PAYLOAD = {
    "sim_hour": 8,
    "total_cars": 500,
    "stopped_cars": 87,
    "cars_in_intersections": 23,
    "avg_speed_kmh": 34.2,
    "zone_counts": {"analakely": 32, "isotry": 15},
    "intersection_counts": {"0": 4, "7": 11},
}


def make_road(name="Route Test", density=0.5):
    return RoadSegment.objects.create(
        name=name,
        geometry=[{"lat": -18.914, "lng": 47.536}, {"lat": -18.915, "lng": 47.537}],
        density=density,
        speed_limit=50.0,
    )


# ---------------------------------------------------------------------------
# GET /api/traffic-data/
# ---------------------------------------------------------------------------

class TrafficDataViewTests(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.url = reverse("traffic-data")

    def test_returns_200_with_no_roads(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json(), [])

    def test_returns_all_roads(self):
        make_road("Avenue A")
        make_road("Avenue B")
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.json()), 2)

    def test_response_contains_required_fields(self):
        make_road("Avenue A")
        response = self.client.get(self.url)
        road = response.json()[0]
        for field in ("id", "name", "geometry", "density"):
            self.assertIn(field, road, msg=f"Champ manquant : {field}")

    def test_density_is_between_0_and_1(self):
        for i in range(5):
            make_road(f"Route {i}")
        for hour in (0, 8, 12, 17, 23):
            response = self.client.get(self.url, {"hour": hour})
            for road in response.json():
                self.assertGreaterEqual(road["density"], 0.0)
                self.assertLessEqual(road["density"], 1.0)

    def test_default_hour_is_12(self):
        """Sans paramètre hour, l'API utilise 12h (trafic modéré)."""
        make_road()
        response_no_param = self.client.get(self.url)
        response_hour_12 = self.client.get(self.url, {"hour": 12})
        self.assertEqual(response_no_param.json(), response_hour_12.json())

    def test_peak_hour_density_higher_than_off_peak(self):
        """À heure de pointe (8h), la densité de base doit être > nuit (2h)."""
        make_road()
        peak = self.client.get(self.url, {"hour": 8}).json()[0]["density"]
        night = self.client.get(self.url, {"hour": 2}).json()[0]["density"]
        self.assertGreater(peak, night)

    def test_invalid_hour_string_returns_500_or_400(self):
        """Un paramètre hour non numérique ne doit pas faire planter silencieusement."""
        with self.assertRaises(ValueError):
            response = self.client.get(self.url, {"hour": "abc"})
            self.assertIn(response.status_code, (400, 500))

    def test_hour_boundaries(self):
        """hour=0 et hour=23 doivent renvoyer 200 sans erreur."""
        make_road()
        for hour in (0, 23):
            response = self.client.get(self.url, {"hour": hour})
            self.assertEqual(response.status_code, status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# POST /api/traffic-stats/
# ---------------------------------------------------------------------------

class TrafficStatsPostTests(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.url = reverse("traffic-stats")

    def test_valid_payload_returns_201(self):
        response = self.client.post(self.url, VALID_SNAPSHOT_PAYLOAD, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_snapshot_persisted_in_db(self):
        self.assertEqual(TrafficSnapshot.objects.count(), 0)
        self.client.post(self.url, VALID_SNAPSHOT_PAYLOAD, format="json")
        self.assertEqual(TrafficSnapshot.objects.count(), 1)

    def test_response_contains_id_and_recorded_at(self):
        response = self.client.post(self.url, VALID_SNAPSHOT_PAYLOAD, format="json")
        data = response.json()
        self.assertIn("id", data)
        self.assertIn("recorded_at", data)

    def test_response_reflects_payload_values(self):
        response = self.client.post(self.url, VALID_SNAPSHOT_PAYLOAD, format="json")
        data = response.json()
        self.assertEqual(data["sim_hour"], VALID_SNAPSHOT_PAYLOAD["sim_hour"])
        self.assertEqual(data["total_cars"], VALID_SNAPSHOT_PAYLOAD["total_cars"])
        self.assertEqual(data["stopped_cars"], VALID_SNAPSHOT_PAYLOAD["stopped_cars"])
        self.assertEqual(data["cars_in_intersections"], VALID_SNAPSHOT_PAYLOAD["cars_in_intersections"])
        self.assertAlmostEqual(data["avg_speed_kmh"], VALID_SNAPSHOT_PAYLOAD["avg_speed_kmh"], places=1)

    def test_zone_counts_and_intersection_counts_stored(self):
        self.client.post(self.url, VALID_SNAPSHOT_PAYLOAD, format="json")
        snap = TrafficSnapshot.objects.first()
        self.assertEqual(snap.zone_counts, VALID_SNAPSHOT_PAYLOAD["zone_counts"])
        self.assertEqual(snap.intersection_counts, VALID_SNAPSHOT_PAYLOAD["intersection_counts"])

    def test_missing_required_field_returns_400(self):
        for field in ("sim_hour", "total_cars", "stopped_cars", "cars_in_intersections", "avg_speed_kmh"):
            payload = {k: v for k, v in VALID_SNAPSHOT_PAYLOAD.items() if k != field}
            response = self.client.post(self.url, payload, format="json")
            self.assertEqual(
                response.status_code, status.HTTP_400_BAD_REQUEST,
                msg=f"Devrait échouer avec 400 quand '{field}' est absent",
            )

    def test_sim_hour_below_0_returns_400(self):
        payload = {**VALID_SNAPSHOT_PAYLOAD, "sim_hour": -1}
        response = self.client.post(self.url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_sim_hour_above_23_returns_400(self):
        payload = {**VALID_SNAPSHOT_PAYLOAD, "sim_hour": 24}
        response = self.client.post(self.url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_negative_total_cars_returns_400(self):
        payload = {**VALID_SNAPSHOT_PAYLOAD, "total_cars": -1}
        response = self.client.post(self.url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_negative_avg_speed_returns_400(self):
        payload = {**VALID_SNAPSHOT_PAYLOAD, "avg_speed_kmh": -5.0}
        response = self.client.post(self.url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_optional_zone_counts_defaults_to_empty_dict(self):
        payload = {k: v for k, v in VALID_SNAPSHOT_PAYLOAD.items()
                   if k not in ("zone_counts", "intersection_counts")}
        response = self.client.post(self.url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        snap = TrafficSnapshot.objects.first()
        self.assertEqual(snap.zone_counts, {})
        self.assertEqual(snap.intersection_counts, {})

    def test_empty_body_returns_400(self):
        response = self.client.post(self.url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


# ---------------------------------------------------------------------------
# GET /api/traffic-stats/
# ---------------------------------------------------------------------------

class TrafficStatsGetTests(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.url = reverse("traffic-stats")

    def _create_snapshot(self, hour=8):
        return TrafficSnapshot.objects.create(
            sim_hour=hour,
            total_cars=500,
            stopped_cars=50,
            cars_in_intersections=10,
            avg_speed_kmh=40.0,
            zone_counts={},
            intersection_counts={},
        )

    def test_empty_db_returns_empty_list(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json(), [])

    def test_returns_existing_snapshots(self):
        self._create_snapshot(hour=8)
        self._create_snapshot(hour=12)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.json()), 2)

    def test_default_limit_is_20(self):
        for i in range(25):
            self._create_snapshot()
        response = self.client.get(self.url)
        self.assertEqual(len(response.json()), 20)

    def test_custom_limit_respected(self):
        for i in range(10):
            self._create_snapshot()
        response = self.client.get(self.url, {"limit": 5})
        self.assertEqual(len(response.json()), 5)

    def test_limit_capped_at_200(self):
        for i in range(205):
            self._create_snapshot()
        response = self.client.get(self.url, {"limit": 300})
        self.assertLessEqual(len(response.json()), 200)

    def test_snapshots_ordered_most_recent_first(self):
        s1 = self._create_snapshot(hour=7)
        s2 = self._create_snapshot(hour=17)
        response = self.client.get(self.url)
        ids = [snap["id"] for snap in response.json()]
        # s2 was created after s1 → should appear first
        self.assertEqual(ids[0], s2.id)
        self.assertEqual(ids[1], s1.id)

    def test_snapshot_fields_present(self):
        self._create_snapshot()
        response = self.client.get(self.url)
        snap = response.json()[0]
        for field in (
            "id", "recorded_at", "sim_hour", "total_cars",
            "stopped_cars", "cars_in_intersections", "avg_speed_kmh",
            "zone_counts", "intersection_counts",
        ):
            self.assertIn(field, snap, msg=f"Champ manquant dans la réponse : {field}")

    def test_roundtrip_post_then_get(self):
        """Un snapshot posté doit être récupérable via GET."""
        self.client.post(self.url, VALID_SNAPSHOT_PAYLOAD, format="json")
        response = self.client.get(self.url)
        snap = response.json()[0]
        self.assertEqual(snap["sim_hour"], VALID_SNAPSHOT_PAYLOAD["sim_hour"])
        self.assertEqual(snap["total_cars"], VALID_SNAPSHOT_PAYLOAD["total_cars"])
        self.assertEqual(snap["zone_counts"], VALID_SNAPSHOT_PAYLOAD["zone_counts"])
