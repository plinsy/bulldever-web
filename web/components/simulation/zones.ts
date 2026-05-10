import { LatLng, SCALE } from "../world/geo";
import type { OsmZone } from "../world/geo";

/** 
 * Returns the zone id the given scene position falls in, or null.
 * Requires the current map center origin for inverse projection,
 * and the list of dynamic zones fetched from OSM.
 * Uses Nearest Neighbor classification within a max radius.
 */
export function classifyZone(x: number, z: number, center: LatLng, dynamicZones: OsmZone[]): string | null {
    if (!dynamicZones || dynamicZones.length === 0) return null;

    // Inverse project: Scene -> Lat/Lng
    const lng = x / SCALE + center.lng;
    const lat = -z / SCALE + center.lat;

    let nearestZone: OsmZone | null = null;
    let minDistanceSq = Infinity;

    // Roughly 2km max radius (0.02 degrees)
    const MAX_DIST_SQ = 0.02 * 0.02;

    for (const zone of dynamicZones) {
        const dLat = zone.lat - lat;
        const dLng = zone.lng - lng;
        const distSq = dLat * dLat + dLng * dLng;

        if (distSq < minDistanceSq) {
            minDistanceSq = distSq;
            nearestZone = zone;
        }
    }

    if (minDistanceSq <= MAX_DIST_SQ && nearestZone) {
        return nearestZone.id; // Returns the dynamic ID (lowercase no spaces)
    }

    return null;
}
