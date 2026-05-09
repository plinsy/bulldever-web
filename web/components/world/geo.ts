"use client";

import { useEffect, useState } from "react";
import * as THREE from "three";

// Antananarivo center
export const CENTER = { lat: -18.9137, lng: 47.5361 };
export const SCALE = 8000;
export const METER = SCALE / 111320; // 1 scene unit = ~13.9 meters, so 1 meter = 0.0718 scene units

// Bounding box for roads: ~3km radius
const ROAD_BBOX = `${CENTER.lat - 0.03},${CENTER.lng - 0.04},${CENTER.lat + 0.03},${CENTER.lng + 0.04}`;

// Bounding box for buildings: ~1km radius (reduced to avoid rendering too many buildings)
const BUILDING_BBOX = `${CENTER.lat - 0.01},${CENTER.lng - 0.015},${CENTER.lat + 0.01},${CENTER.lng + 0.015}`;

export function latLngToXZ(lat: number, lng: number) {
    const x = (lng - CENTER.lng) * SCALE;
    const z = -(lat - CENTER.lat) * SCALE;
    return { x, z };
}

export function latLngToVector3(lat: number, lng: number, y = 0) {
    const { x, z } = latLngToXZ(lat, lng);
    return new THREE.Vector3(x, y, z);
}

// --- Overpass API ---
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

// ---- ROADS ----
const ROAD_QUERY = `
[out:json][timeout:30];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|service)$"]
    (${ROAD_BBOX});
);
out body;
>;
out skel qt;
`;

export interface OsmRoad {
    id: number;
    name: string;
    highway: string;
    points: { lat: number; lng: number }[];
}


/** Fetch with an AbortController timeout so hanging requests don't block retries */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 10000): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(id);
    }
}

export async function fetchOsmRoads(): Promise<OsmRoad[]> {
    const res = await fetchWithTimeout(OVERPASS_URL, {
        method: "POST",
        body: "data=" + encodeURIComponent(ROAD_QUERY),
    }, 12000);
    const json = await res.json();

    const nodes: Record<number, { lat: number; lng: number }> = {};
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
                    points,
                });
            }
        }
    }
    return roads; // may be empty — hook will retry
}

// ---- BUILDINGS ----
const BUILDING_QUERY = `
[out:json][timeout:30];
(
  way["building"]
    (${BUILDING_BBOX});
);
out body;
>;
out skel qt;
`;

export interface OsmBuilding {
    id: number;
    points: { x: number; z: number }[];
    levels: number;
}

export async function fetchOsmBuildings(): Promise<OsmBuilding[]> {
    const res = await fetchWithTimeout(OVERPASS_URL, {
        method: "POST",
        body: "data=" + encodeURIComponent(BUILDING_QUERY),
    }, 15000);
    const json = await res.json();

    const nodes: Record<number, { lat: number; lng: number }> = {};
    for (const el of json.elements) {
        if (el.type === "node") nodes[el.id] = { lat: el.lat, lng: el.lon };
    }

    const buildings: OsmBuilding[] = [];
    for (const el of json.elements) {
        if (el.type === "way" && el.tags?.building && el.nodes) {
            const pts = el.nodes.map((n: number) => nodes[n]).filter(Boolean);
            if (pts.length < 3) continue;

            const projectedPoints = pts.map((p: { lat: number; lng: number }) => latLngToXZ(p.lat, p.lng));

            const rawLevels = parseInt(el.tags?.["building:levels"] || "1");
            const levels = isNaN(rawLevels) ? 1 : Math.min(rawLevels, 6);

            buildings.push({ id: el.id, points: projectedPoints, levels });
        }
    }
    
    if (buildings.length === 0) throw new Error("Empty response");
    return buildings;
}

// ---- HOOKS ----
// ---- HOOKS WITH AUTO-RETRY ----

/** Retry a fetch function with exponential backoff. Never gives up. */
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
            const delay = Math.min(2000 * 2 ** (attempt - 1), 30000); // 2s, 4s, 8s … max 30s
            console.warn(`OSM fetch failed (attempt ${attempt}), retrying in ${delay / 1000}s…`, err);
            await new Promise((r) => setTimeout(r, delay));
        }
    }
}

export function useOsmRoads() {
    const [roads, setRoads] = useState<OsmRoad[]>([]);
    const [loading, setLoading] = useState(true);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let cancelled = false;
        fetchWithRetry(
            async () => {
                const data = await fetchOsmRoads();
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
    }, []);

    return { roads, loading, attempt };
}

export function useOsmBuildings() {
    const [buildings, setBuildings] = useState<OsmBuilding[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        fetchWithRetry(
            () => fetchOsmBuildings()
        ).then((data) => {
            if (!cancelled) {
                setBuildings(data);
                setLoading(false);
            }
        });
        return () => { cancelled = true; };
    }, []);

    return { buildings, loading };
}
