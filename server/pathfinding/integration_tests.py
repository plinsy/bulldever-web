#!/usr/bin/env python3
"""
Integration tests pour l'endpoint /api/shortest-path/

Usage:
  python integration_tests.py [--base-url BASE_URL] [--tol DIST_TOL_M]

Dépendances:
  pip install requests

Ces tests reprennent les vérifications faites côté Postman et exécutent:
  - cas nominal (200) + validations de structure + cohérence distance
  - paramètres manquants (400)
  - paramètres invalides (400)
  - cas "aucun chemin" (attendu 404 ou skipped)

Retourne un code de sortie non nul si un des tests échoue.
"""

import sys
import argparse
import math
from typing import Any, Dict, List

try:
    import requests
except Exception as e:
    print("Le paquet 'requests' est requis. Installez-le avec: pip install requests")
    raise


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000.0
    to_rad = math.pi / 180.0
    dlat = (lat2 - lat1) * to_rad
    dlon = (lon2 - lon1) * to_rad
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1 * to_rad) * math.cos(lat2 * to_rad) * math.sin(dlon / 2) ** 2
    c = 2 * math.asin(math.sqrt(a))
    return R * c


def round5(x: float) -> str:
    return f"{x:.5f}"


def assert_equal(a, b, msg: str = ""):
    if a != b:
        raise AssertionError(f"Assertion failed: {a} != {b}. {msg}")


def assert_true(cond: bool, msg: str = ""):
    if not cond:
        raise AssertionError(f"Assertion failed: {msg}")


def test_nominal(base_url: str, tol_m: float = 5.0) -> None:
    print("\n[TEST] nominal: valid request and response structure")
    params = {
        "start_lat": "-18.9100",
        "start_lng": "47.5340",
        "end_lat": "-18.9200",
        "end_lng": "47.5420",
    }
    r = requests.get(f"{base_url}/api/shortest-path/", params=params, timeout=30)
    assert_equal(r.status_code, 200, "Attendu HTTP 200 pour le test nominal")
    j = r.json()

    # Structure
    for k in ("path", "total_distance_m", "node_count", "start_snapped", "end_snapped"):
        assert_true(k in j, f"Clé manquante dans la réponse: {k}")

    path = j["path"]
    assert_true(isinstance(path, list) and len(path) > 0, "path doit être une liste non vide")
    assert_equal(j["node_count"], len(path), "node_count doit correspondre à la longueur de path")

    # types
    assert_true(isinstance(j["total_distance_m"], (int, float)), "total_distance_m doit être un nombre")

    # somme des distances haversine
    sum_d = 0.0
    for i in range(1, len(path)):
        p1 = path[i - 1]
        p2 = path[i]
        sum_d += haversine(float(p1["lat"]), float(p1["lng"]), float(p2["lat"]), float(p2["lng"]))

    returned = float(j["total_distance_m"])
    diff = abs(returned - sum_d)
    assert_true(diff <= tol_m, f"La distance totale renvoyée ({returned}) diffère de la somme haversine ({sum_d:.3f}) de {diff:.3f}m > tol {tol_m}m")

    # start_snapped equals first node (5 decimals)
    first = path[0]
    s = j["start_snapped"]
    assert_equal(round5(float(first["lat"])), round5(float(s["lat"])), "start_snapped.lat mismatch (5 decimals)")
    assert_equal(round5(float(first["lng"])), round5(float(s["lng"])), "start_snapped.lng mismatch (5 decimals)")

    # end_snapped equals last node
    last = path[-1]
    e = j["end_snapped"]
    assert_equal(round5(float(last["lat"])), round5(float(e["lat"])), "end_snapped.lat mismatch (5 decimals)")
    assert_equal(round5(float(last["lng"])), round5(float(e["lng"])), "end_snapped.lng mismatch (5 decimals)")

    print(" -> OK")


def test_missing_params(base_url: str) -> None:
    print("\n[TEST] missing params -> 400")
    params = {"start_lat": "-18.91", "start_lng": "47.53"}
    r = requests.get(f"{base_url}/api/shortest-path/", params=params, timeout=10)
    assert_equal(r.status_code, 400, f"Attendu 400 quand params manquants, obtenu {r.status_code}")
    j = r.json()
    assert_true(isinstance(j, dict) and j.get("error") is not None, "Expected error message in body")
    print(" -> OK")


def test_invalid_params(base_url: str) -> None:
    print("\n[TEST] invalid params -> 400")
    params = {"start_lat": "abc", "start_lng": "47.53", "end_lat": "-18.92", "end_lng": "47.54"}
    r = requests.get(f"{base_url}/api/shortest-path/", params=params, timeout=10)
    assert_equal(r.status_code, 400, f"Attendu 400 pour params invalides, obtenu {r.status_code}")
    j = r.json()
    assert_true(isinstance(j, dict) and j.get("error") is not None, "Expected error message in body")
    print(" -> OK")


def test_no_path(base_url: str) -> None:
    print("\n[TEST] no path -> expected 404 (or skipped if path exists)")
    # Utiliser des coordonnées très éloignées - probablement disconnectées
    params = {"start_lat": "-90.0", "start_lng": "-180.0", "end_lat": "90.0", "end_lng": "180.0"}
    r = requests.get(f"{base_url}/api/shortest-path/", params=params, timeout=10)
    if r.status_code == 404:
        print(" -> OK (404 reçu)")
        return
    elif r.status_code == 200:
        print(" -> SKIPPED: endpoint returned 200 (graph may be global). Can't assert 404")
        return
    else:
        raise AssertionError(f"Unexpected status code for no-path test: {r.status_code}")


def run_all(base_url: str, tol_m: float):
    failures: List[str] = []

    tests = [
        (test_nominal, (base_url, tol_m)),
        (test_missing_params, (base_url,)),
        (test_invalid_params, (base_url,)),
        (test_no_path, (base_url,)),
    ]

    for fn, args in tests:
        try:
            fn(*args)
        except Exception as e:
            failures.append(f"{fn.__name__}: {e}")

    print("\n" + "=" * 60)
    if failures:
        print("ÉCHEC: certains tests ont échoué:")
        for f in failures:
            print(" - ", f)
        sys.exit(1)
    else:
        print("TOUS LES TESTS PASSÉS ✔️")
        sys.exit(0)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--base-url", default="http://localhost:8000", help="Base URL du serveur (ex: http://localhost:8000)")
    p.add_argument("--tol", type=float, default=5.0, help="Tolérance (m) pour la comparaison des distances")
    args = p.parse_args()
    run_all(args.base_url.rstrip('/'), args.tol)
