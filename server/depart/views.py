from rest_framework.decorators import api_view
from rest_framework.response import Response
from datetime import datetime, timedelta
import math

DETOUR_FACTOR = {
    'anosizato':     2.2,
    'ankorondrano':  2.0,
    'analakely':     1.8,
    'isotry':        1.9,
    '67ha':          1.6,
    'ambohijatovo':  1.5,
    'tsaralalana':   1.7,
    'behoririka':    1.4,
}

ZONE_CENTERS = {
    'anosizato':    (-18.945, 47.510),
    'ankorondrano': (-18.893, 47.532),
    'analakely':    (-18.914, 47.536),
    'isotry':       (-18.920, 47.525),
    '67ha':         (-18.897, 47.525),
    'ambohijatovo': (-18.912, 47.542),
    'tsaralalana':  (-18.908, 47.530),
    'behoririka':   (-18.916, 47.548),
}

# Vitesses de base selon tranche horaire (km/h) — sans bouchon
SPEEDS = {
    'peak':   10,   
    'mid':    25,   
    'off':    35,  
}
def haversine_km(lat1, lng1, lat2, lng2) -> float:
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (math.sin(dlat/2)**2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlng/2)**2)
    return R * 2 * math.asin(math.sqrt(a))

def get_nearest_zone(lat, lng) -> str:
    return min(
        ZONE_CENTERS,
        key=lambda z: (ZONE_CENTERS[z][0]-lat)**2 + (ZONE_CENTERS[z][1]-lng)**2
    )

def get_peak_label(hour: int) -> str:
    if 7 <= hour <= 9 or 16 <= hour <= 19:
        return 'peak'
    elif 10 <= hour <= 15:
        return 'mid'
    return 'off'

def get_peak_factor(hour: int) -> float:
    return {'peak': 0.8, 'mid': 0.4, 'off': 0.15}[get_peak_label(hour)]

def get_congestion_level_at(lat, lng, congestion_points: list) -> float:
    """
    Retourne le niveau de congestion (0.0 à 1.0) au point (lat, lng)
    en cherchant dans les congestion_points reçus en temps réel.
    Si aucun point proche → 0.0 (pas de bouchon).
    """
    best_level = 0.0
    for pt in congestion_points:
        try:
            pt_lat = float(pt['latitude'])
            pt_lng = float(pt['longitude'])
            level  = float(pt['level']) / 100
        except (KeyError, ValueError, TypeError):
            continue

        dist = haversine_km(lat, lng, pt_lat, pt_lng)
        if dist <= 1.5:  # rayon d'influence d'un point de congestion
            # Plus on est proche, plus l'impact est fort
            weight = max(0, 1 - dist / 1.5)
            best_level = max(best_level, level * weight)

    return best_level  # 0.0 = libre, 1.0 = bloqué

def get_speed_at(hour: int, lat, lng, congestion_points: list) -> float:
    """
    Vitesse réelle en km/h selon :
    - la tranche horaire
    - la congestion temps réel à cette position
    """
    base_speed   = SPEEDS[get_peak_label(hour)]
    cong_level   = get_congestion_level_at(lat, lng, congestion_points)

    # La congestion temps réel réduit la vitesse jusqu'à 90%
    # level=0   → vitesse normale
    # level=0.5 → vitesse × 0.55
    # level=1.0 → vitesse × 0.10 (quasi à l'arrêt)
    speed = base_speed * (1 - cong_level * 0.9)
    return max(3, speed)  # minimum 3 km/h

def estimate_travel(distance_km, start_hour, origin_lat, origin_lng,
                    dest_lat, dest_lng, congestion_points) -> tuple[float, float]:
    """
    Simule le trajet minute par minute en interpolant la position sur le trajet
    et en appliquant la congestion temps réel à chaque étape.
    """
    remaining_km  = distance_km
    elapsed       = 0
    dominant_peak = 0.0
    progress      = 0.0  # 0.0 = départ, 1.0 = arrivée

    while remaining_km > 0 and elapsed < 300:
        hour_int = int(start_hour + elapsed / 60) % 24
        dominant_peak = max(dominant_peak, get_peak_factor(hour_int))

        # Position interpolée sur le trajet
        curr_lat = origin_lat + progress * (dest_lat - origin_lat)
        curr_lng = origin_lng + progress * (dest_lng - origin_lng)

        speed          = get_speed_at(hour_int, curr_lat, curr_lng, congestion_points)
        km_this_min    = speed / 60
        remaining_km  -= km_this_min
        elapsed       += 1
        progress       = min(1.0, 1 - remaining_km / distance_km)

    return elapsed, dominant_peak


@api_view(['POST'])
def calculate_departure(request):
    data = request.data

    for field in ['origin_lat', 'origin_lng', 'dest_lat', 'dest_lng', 'arrival_time']:
        if field not in data:
            return Response({'error': f'Champ manquant : {field}'}, status=400)

    try:
        origin_lat  = float(data['origin_lat'])
        origin_lng  = float(data['origin_lng'])
        dest_lat    = float(data['dest_lat'])
        dest_lng    = float(data['dest_lng'])
        arrival_dt  = datetime.strptime(data['arrival_time'], "%H:%M")
    except (ValueError, TypeError) as e:
        return Response({'error': f'Données invalides : {str(e)}'}, status=400)

    # Congestion temps réel — si vide = pas de bouchon nulle part
    congestion_points = data.get('congestion_points', [])

    # Zones et distance réelle (avec détour structurel)
    zone_origin  = get_nearest_zone(origin_lat, origin_lng)
    zone_dest    = get_nearest_zone(dest_lat, dest_lng)
    detour       = max(DETOUR_FACTOR[zone_origin], DETOUR_FACTOR[zone_dest])
    distance_km  = haversine_km(origin_lat, origin_lng, dest_lat, dest_lng) * detour

    # Recherche du départ optimal (minute par minute, jusqu'à 5h avant)
    best_departure = None
    best_duration  = None
    best_peak      = None

    for offset in range(0, 300):
        candidate   = arrival_dt - timedelta(minutes=offset)
        start_hour  = candidate.hour + candidate.minute / 60

        duration, peak = estimate_travel(
            distance_km, start_hour,
            origin_lat, origin_lng,
            dest_lat, dest_lng,
            congestion_points
        )

        diff = ((candidate + timedelta(minutes=duration)) - arrival_dt).total_seconds() / 60

        if -2 <= diff <= 8:
            best_departure = candidate
            best_duration  = duration
            best_peak      = peak
            break

    # Fallback
    if not best_departure:
        best_duration, best_peak = estimate_travel(
            distance_km, arrival_dt.hour,
            origin_lat, origin_lng,
            dest_lat, dest_lng,
            congestion_points
        )
        best_departure = arrival_dt - timedelta(minutes=best_duration)

    buffer_per_km  = {0.8: 3.0, 0.4: 1.5}.get(best_peak, 0.5)
    buffer_minutes = max(5, round(distance_km * buffer_per_km))
    safe_departure = best_departure - timedelta(minutes=buffer_minutes)

    traffic_level  = {0.8: 'Sature', 0.4: 'Modere'}.get(best_peak, 'Fluide')

    return Response({
        'safe_departure_time': safe_departure.strftime("%H:%M"),
        'departure_time':      best_departure.strftime("%H:%M"),
        'arrival_time':        arrival_dt.strftime("%H:%M"),
        'traffic_level':       traffic_level,
        'advice': (
            f"Pars a {safe_departure.strftime('%H:%M')} "
        )
    })