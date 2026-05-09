import { LatLng, SCALE } from "../world/geo";

/**
 * Named geographic zones for Antananarivo.
 * These are static Lat/Lng bounds.
 */
interface LatLngBounds {
    id: string;
    label: string;
    south: number;
    north: number;
    west: number;
    east: number;
}

const RAW_ZONES: LatLngBounds[] = [
    { id: "analakely",   label: "Analakely",   south: -18.9180, north: -18.9050, west: 47.5280, east: 47.5420 },
    { id: "anosizato",   label: "Anosizato",   south: -18.9280, north: -18.9160, west: 47.5180, east: 47.5310 },
    { id: "isotry",      label: "Isotry",      south: -18.9250, north: -18.9140, west: 47.5300, east: 47.5430 },
    { id: "67ha",        label: "67 Ha",       south: -18.9060, north: -18.8940, west: 47.5230, east: 47.5370 },
    { id: "ambohijatovo",label: "Ambohijatovo",south: -18.9150, north: -18.9070, west: 47.5340, east: 47.5450 },
    { id: "tsaralalana", label: "Tsaralalana", south: -18.9120, north: -18.9030, west: 47.5260, east: 47.5360 },
    { id: "ankorondrano",label: "Ankorondrano",south: -18.9020, north: -18.8920, west: 47.5310, east: 47.5430 },
    { id: "behoririka",  label: "Behoririka",  south: -18.9220, north: -18.9120, west: 47.5340, east: 47.5480 },
];

/** 
 * Returns the zone id the given scene position falls in, or null.
 * Requires the current map center origin for inverse projection.
 */
export function classifyZone(x: number, z: number, center: LatLng): string | null {
    // Inverse project: Scene -> Lat/Lng
    const lng = x / SCALE + center.lng;
    const lat = -z / SCALE + center.lat;

    for (const zone of RAW_ZONES) {
        if (lat >= zone.south && lat <= zone.north && lng >= zone.west && lng <= zone.east) {
            return zone.id;
        }
    }
    return null;
}
