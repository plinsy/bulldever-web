"""
API tests for the pathfinding endpoints.
Run with:  uv run python manage.py test pathfinding.tests_api
"""
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from traffic.models import RoadSegment


def _make_segment(name, points, density=0.0, speed_limit=50.0):
    """Helper: create a RoadSegment from a list of (lat, lng) tuples."""
    return RoadSegment.objects.create(
        name=name,
        geometry=[{"lat": lat, "lng": lng} for lat, lng in points],
        density=density,
        speed_limit=speed_limit,
    )


class ShortestPathAPITests(TestCase):
    """Tests for GET /api/shortest-path/"""

    URL = "/api/shortest-path/"

    def setUp(self):
        self.client = APIClient()
        # Build a simple L-shaped connected network:
        #   A(-18.910, 47.520) ─── B(-18.910, 47.530)
        #                                   │
        #                          C(-18.920, 47.530)
        _make_segment("Rue AB", [(-18.910, 47.520), (-18.910, 47.530)])
        _make_segment("Rue BC", [(-18.910, 47.530), (-18.920, 47.530)])

    # ── Success cases ──────────────────────────────────────────────────────────

    def test_valid_path_returns_200(self):
        resp = self.client.get(self.URL, {
            "start_lat": -18.910, "start_lng": 47.520,
            "end_lat": -18.920, "end_lng": 47.530,
        })
        self.assertEqual(resp.status_code, 200)

    def test_response_contains_required_fields(self):
        resp = self.client.get(self.URL, {
            "start_lat": -18.910, "start_lng": 47.520,
            "end_lat": -18.920, "end_lng": 47.530,
        })
        data = resp.json()
        self.assertIn("distance_km", data)
        self.assertIn("duration_minutes", data)
        self.assertIn("path", data)
        self.assertIn("node_count", data)

    def test_distance_is_positive(self):
        resp = self.client.get(self.URL, {
            "start_lat": -18.910, "start_lng": 47.520,
            "end_lat": -18.920, "end_lng": 47.530,
        })
        data = resp.json()
        self.assertGreater(data["distance_km"], 0)
        self.assertGreater(data["duration_minutes"], 0)

    def test_path_is_list_of_lat_lng_pairs(self):
        resp = self.client.get(self.URL, {
            "start_lat": -18.910, "start_lng": 47.520,
            "end_lat": -18.920, "end_lng": 47.530,
        })
        data = resp.json()
        self.assertIsInstance(data["path"], list)
        self.assertGreater(len(data["path"]), 0)
        for point in data["path"]:
            self.assertIsInstance(point, list)
            self.assertEqual(len(point), 2)
            lat, lng = point
            self.assertIsInstance(lat, float)
            self.assertIsInstance(lng, float)

    def test_snapped_nodes_in_response(self):
        resp = self.client.get(self.URL, {
            "start_lat": -18.910, "start_lng": 47.520,
            "end_lat": -18.920, "end_lng": 47.530,
        })
        data = resp.json()
        self.assertIn("start_snapped", data)
        self.assertIn("end_snapped", data)
        self.assertIn("lat", data["start_snapped"])
        self.assertIn("lng", data["start_snapped"])

    def test_high_density_increases_weight_not_path(self):
        """High-density segment is avoided if an alternative exists."""
        # Add a direct but very expensive shortcut A→C via high density
        _make_segment("Rue AC direct", [(-18.910, 47.520), (-18.920, 47.530)], density=100.0)
        resp = self.client.get(self.URL, {
            "start_lat": -18.910, "start_lng": 47.520,
            "end_lat": -18.920, "end_lng": 47.530,
        })
        # Still expects a valid response — it should take the cheaper A→B→C route
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertGreater(data["node_count"], 2)  # 3 nodes: A, B, C

    # ── Error cases ────────────────────────────────────────────────────────────

    def test_missing_all_params_returns_400(self):
        resp = self.client.get(self.URL)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("error", resp.json())

    def test_missing_one_param_returns_400(self):
        resp = self.client.get(self.URL, {
            "start_lat": -18.910, "start_lng": 47.520,
            "end_lat": -18.920,
            # end_lng missing
        })
        self.assertEqual(resp.status_code, 400)

    def test_non_numeric_param_returns_400(self):
        resp = self.client.get(self.URL, {
            "start_lat": "invalid", "start_lng": 47.520,
            "end_lat": -18.920, "end_lng": 47.530,
        })
        self.assertEqual(resp.status_code, 400)

    def test_empty_graph_returns_404(self):
        RoadSegment.objects.all().delete()
        resp = self.client.get(self.URL, {
            "start_lat": -18.910, "start_lng": 47.520,
            "end_lat": -18.920, "end_lng": 47.530,
        })
        self.assertEqual(resp.status_code, 404)

    def test_isolated_point_returns_404(self):
        """Points on a disconnected island produce 404."""
        _make_segment("Ile isolée", [(-18.850, 47.600), (-18.851, 47.601)])
        resp = self.client.get(self.URL, {
            "start_lat": -18.910, "start_lng": 47.520,
            "end_lat": -18.850, "end_lng": 47.600,
        })
        self.assertEqual(resp.status_code, 404)

    # ── Edge cases ─────────────────────────────────────────────────────────────

    def test_start_equals_end_returns_valid(self):
        """When start ≈ end, Dijkstra should still return a result."""
        resp = self.client.get(self.URL, {
            "start_lat": -18.910, "start_lng": 47.520,
            "end_lat": -18.910, "end_lng": 47.520,
        })
        # Either 200 with single-node path or 404 — both are acceptable
        self.assertIn(resp.status_code, [200, 404])

    def test_points_snapped_to_nearest_node(self):
        """Coordinates slightly off the network are snapped and still work."""
        # Start slightly off A, end slightly off C
        resp = self.client.get(self.URL, {
            "start_lat": -18.9101, "start_lng": 47.5201,
            "end_lat": -18.9199, "end_lng": 47.5299,
        })
        self.assertEqual(resp.status_code, 200)
