"use client";

import { useEffect, useState } from "react";
import * as THREE from "three";

// Antananarivo center
const CENTER = { lat: -18.9137, lng: 47.5361 };
const SCALE = 8000;

export function latLngToXZ(lat: number, lng: number) {
    const x = (lng - CENTER.lng) * SCALE;
    const z = -(lat - CENTER.lat) * SCALE;
    return { x, z };
}

export function latLngToVector3(lat: number, lng: number, y = 0) {
    const { x, z } = latLngToXZ(lat, lng);
    return new THREE.Vector3(x, y, z);
}

// --- Fetch real roads from Overpass API (OpenStreetMap) ---
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

const QUERY = `
[out:json][timeout:25];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified)$"]
    (${CENTER.lat - 0.03},${CENTER.lng - 0.03},${CENTER.lat + 0.03},${CENTER.lng + 0.03});
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

export async function fetchOsmRoads(): Promise<OsmRoad[]> {
    const res = await fetch(OVERPASS_URL, {
        method: "POST",
        body: "data=" + encodeURIComponent(QUERY),
    });
    const json = await res.json();

    // Build node lookup
    const nodes: Record<number, { lat: number; lng: number }> = {};
    for (const el of json.elements) {
        if (el.type === "node") {
            nodes[el.id] = { lat: el.lat, lng: el.lon };
        }
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
    return roads;
}

export function useOsmRoads() {
    const [roads, setRoads] = useState<OsmRoad[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchOsmRoads()
            .then(setRoads)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    return { roads, loading };
}
