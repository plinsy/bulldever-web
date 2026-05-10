"use client";

import { useEffect, useState } from "react";
import * as THREE from "three";
import { SCALE, METER, ROAD_WIDTH_METERS, ROAD_FETCH_RADIUS, BUILDING_FETCH_RADIUS } from "../simulation/config";

export { SCALE, METER };

export const ROAD_WIDTHS: Record<string, number> = {};
Object.entries(ROAD_WIDTH_METERS).forEach(([k, v]) => {
    ROAD_WIDTHS[k] = v * METER;
});

export interface LatLng {
    lat: number;
    lng: number;
}

// Initial center: Antananarivo center
export const INITIAL_CENTER: LatLng = { lat: -18.9137, lng: 47.5361 };

/**
 * Project Latitude/Longitude to Scene X/Z coordinates relative to an origin.
 */
export function latLngToXZ(lat: number, lng: number, origin: LatLng) {
    const x = (lng - origin.lng) * SCALE;
    const z = -(lat - origin.lat) * SCALE;
    return { x, z };
}

export function latLngToVector3(lat: number, lng: number, origin: LatLng, y = 0) {
    const { x, z } = latLngToXZ(lat, lng, origin);
    return new THREE.Vector3(x, y, z);
}

// --- Overpass API ---
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

function buildRoadQuery(center: LatLng) {
    const lat = center.lat;
    const lng = center.lng;
    const bbox = `${lat - ROAD_FETCH_RADIUS},${lng - ROAD_FETCH_RADIUS * 1.3},${lat + ROAD_FETCH_RADIUS},${lng + ROAD_FETCH_RADIUS * 1.3}`;
    return `
    [out:json][timeout:30];
    (
      way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|service)$"]
        (${bbox});
    );
    out body;
    >;
    out skel qt;
    `;
}

function buildBuildingQuery(center: LatLng) {
    const lat = center.lat;
    const lng = center.lng;
    const bbox = `${lat - BUILDING_FETCH_RADIUS},${lng - BUILDING_FETCH_RADIUS * 1.5},${lat + BUILDING_FETCH_RADIUS},${lng + BUILDING_FETCH_RADIUS * 1.5}`;
    return `
    [out:json][timeout:30];
    (
      way["building"]
        (${bbox});
    );
    out body;
    >;
    out skel qt;
    `;
}

export interface OsmRoad {
    id: number;
    name: string;
    highway: string;
    oneway: boolean;
    points: LatLng[];
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 10000): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(id);
    }
}

export async function fetchOsmRoads(center: LatLng): Promise<OsmRoad[]> {
    const res = await fetchWithTimeout(OVERPASS_URL, {
        method: "POST",
        body: "data=" + encodeURIComponent(buildRoadQuery(center)),
    }, 45000);
    if (res.status === 429) throw new Error("Overpass API: Too many requests");
    const json = await res.json();

    const nodes: Record<number, LatLng> = {};
    for (const el of json.elements) {
        if (el.type === "node") nodes[el.id] = { lat: el.lat, lng: el.lon };
    }

    const roads: OsmRoad[] = [];
    for (const el of json.elements) {
        if (el.type === "way" && el.nodes) {
            const points = el.nodes.map((n: number) => nodes[n]).filter(Boolean);
            if (points.length >= 2) {
                roads.push({
                    id: el.id,
                    name: el.tags?.name || "",
                    highway: el.tags?.highway || "road",
                    oneway: el.tags?.oneway === "yes",
                    points,
                });
            }
        }
    }
    return roads;
}

export interface OsmBuilding {
    id: number;
    points: { x: number; z: number }[];
    levels: number;
}

export async function fetchOsmBuildings(center: LatLng): Promise<OsmBuilding[]> {
    const res = await fetchWithTimeout(OVERPASS_URL, {
        method: "POST",
        body: "data=" + encodeURIComponent(buildBuildingQuery(center)),
    }, 45000);
    if (res.status === 429) throw new Error("Overpass API: Too many requests");
    const json = await res.json();

    const nodes: Record<number, LatLng> = {};
    for (const el of json.elements) {
        if (el.type === "node") nodes[el.id] = { lat: el.lat, lng: el.lon };
    }

    const buildings: OsmBuilding[] = [];
    for (const el of json.elements) {
        if (el.type === "way" && el.tags?.building && el.nodes) {
            const pts = el.nodes.map((n: number) => nodes[n]).filter(Boolean);
            if (pts.length < 3) continue;

            const projectedPoints = pts.map((p: LatLng) => latLngToXZ(p.lat, p.lng, center));

            const rawLevels = parseInt(el.tags?.["building:levels"] || "1");
            const levels = isNaN(rawLevels) ? 1 : Math.min(rawLevels, 6);

            buildings.push({ id: el.id, points: projectedPoints, levels });
        }
    }
    return buildings;
}

async function fetchWithRetry<T>(
    fn: () => Promise<T>,
    onAttempt?: (attempt: number) => void
): Promise<T> {
    let attempt = 0;
    while (true) {
        try {
            attempt++;
            onAttempt?.(attempt);
            return await fn();
        } catch (err) {
            const delay = Math.min(2000 * 2 ** (attempt - 1), 30000);
            console.warn(`OSM fetch failed (attempt ${attempt}), retrying in ${delay / 1000}s…`, err);
            await new Promise((r) => setTimeout(r, delay));
        }
    }
}

export function useOsmRoads(center: LatLng) {
    const [roads, setRoads] = useState<OsmRoad[]>([]);
    const [loading, setLoading] = useState(true);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        fetchWithRetry(
            async () => {
                const data = await fetchOsmRoads(center);
                if (data.length === 0) throw new Error("Empty response");
                return data;
            },
            (a) => !cancelled && setAttempt(a)
        ).then((data) => {
            if (!cancelled) {
                setRoads(data);
                setLoading(false);
            }
        });
        return () => { cancelled = true; };
    }, [center.lat, center.lng]);

    return { roads, loading, attempt };
}

export function useOsmBuildings(center: LatLng) {
    const [buildings, setBuildings] = useState<OsmBuilding[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        fetchWithRetry(
            () => fetchOsmBuildings(center)
        ).then((data) => {
            if (!cancelled) {
                setBuildings(data);
                setLoading(false);
            }
        });
        return () => { cancelled = true; };
    }, [center.lat, center.lng]);

    return { buildings, loading };
}
