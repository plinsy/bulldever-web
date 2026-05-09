import { CENTER, SCALE } from "../world/geo";

/**
 * Named geographic zones for Antananarivo.
 * Bounds are defined as lat/lng rectangles and pre-converted to scene XZ
 * so membership tests run at 60 fps without recomputing projections.
 */
export interface Zone {
    id: string;
    label: string;
    /** Scene-space bounding box */
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
}

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

function lngToX(lng: number): number {
    return (lng - CENTER.lng) * SCALE;
}

function latToZ(lat: number): number {
    return -(lat - CENTER.lat) * SCALE;
}

/** Pre-projected zones – computed once at module load. */
export const ZONES: Zone[] = RAW_ZONES.map((z) => ({
    id: z.id,
    label: z.label,
    minX: lngToX(z.west),
    maxX: lngToX(z.east),
    // lat increases northward → z decreases northward
    minZ: latToZ(z.north),
    maxZ: latToZ(z.south),
}));

/** Returns the zone id the given scene position falls in, or null. */
export function classifyZone(x: number, z: number): string | null {
    for (const zone of ZONES) {
        if (x >= zone.minX && x <= zone.maxX && z >= zone.minZ && z <= zone.maxZ) {
            return zone.id;
        }
    }
    return null;
}
