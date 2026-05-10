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
    { id: "analakely",   label: "Analakely",   south: -18.9100, north: -18.9000, west: 47.5200, east: 47.5300 },
    { id: "anosizato",   label: "Anosizato",   south: -18.9450, north: -18.9250, west: 47.4900, east: 47.5150 },
    { id: "isotry",      label: "Isotry",      south: -18.9100, north: -18.8950, west: 47.5100, east: 47.5200 },
    { id: "67ha",        label: "67 Ha",       south: -18.9050, north: -18.8900, west: 47.5000, east: 47.5150 },
    { id: "ambohijatovo",label: "Ambohijatovo",south: -18.9200, north: -18.9100, west: 47.5250, east: 47.5350 },
    { id: "tsaralalana", label: "Tsaralalana", south: -18.9150, north: -18.9050, west: 47.5150, east: 47.5250 },
    { id: "ankorondrano",label: "Ankorondrano",south: -18.8950, north: -18.8750, west: 47.5200, east: 47.5350 },
    { id: "behoririka",  label: "Behoririka",  south: -18.9080, north: -18.8980, west: 47.5280, east: 47.5380 },
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
