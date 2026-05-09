"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { OsmRoad, CENTER, SCALE, METER } from "../world/geo";
import { classifyZone } from "./zones";
import { useFrame } from "@react-three/fiber";

const MAX_CARS = 500;
const API_BASE = "http://localhost:8000/api";

// Speed threshold (scene units/frame) below which a car is considered stopped
const STOPPED_SPEED_THRESHOLD = 0.0003;

// Intersection detection radius in scene units (~10 m)
const INTERSECTION_RADIUS = 10 * METER;

// How often (ms) to POST metrics to the backend
const SNAPSHOT_INTERVAL_MS = 5000;

// Car color palette – varied realistic vehicle colors
const CAR_COLORS = [
    new THREE.Color("#60a5fa"), // blue
    new THREE.Color("#f87171"), // red
    new THREE.Color("#fbbf24"), // yellow
    new THREE.Color("#a3e635"), // lime
    new THREE.Color("#e2e8f0"), // white
    new THREE.Color("#94a3b8"), // silver
    new THREE.Color("#f97316"), // orange
];

export interface ZoneStat {
    total: number;
    stopped: number;
}

export interface TrafficMetrics {
    totalCars: number;
    stoppedCars: number;
    carsInIntersections: number;
    avgSpeedKmh: number;
    /** per-named-zone stats (total vehicles + stopped vehicles) */
    zoneStats: Record<string, ZoneStat>;
    /** car count per intersection index */
    intersectionCounts: Record<string, number>;
}

interface CarSystemProps {
    roads: OsmRoad[];
    hour: number;
    /** Called every frame with updated metrics */
    onMetrics?: (metrics: TrafficMetrics) => void;
}

function roadXZ(road: OsmRoad) {
    return road.points.map((p: { lat: number; lng: number }) => {
        const x = (p.lng - CENTER.lng) * SCALE;
        const z = -(p.lat - CENTER.lat) * SCALE;
        return new THREE.Vector3(x, 0.02, z);
    });
}

function peakFactor(hour: number) {
    if ((hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 19)) return 0.8;
    if (hour >= 10 && hour <= 15) return 0.4;
    return 0.15;
}

/**
 * Derive intersection nodes: points shared by ≥ 2 road endpoints.
 * Returns a small list of THREE.Vector3 intersection positions.
 */
function deriveIntersections(roads: OsmRoad[]): THREE.Vector3[] {
    const key = (lat: number, lng: number) =>
        `${lat.toFixed(4)},${lng.toFixed(4)}`;

    const counts = new Map<string, { count: number; pos: THREE.Vector3 }>();
    for (const road of roads) {
        const endpoints = [road.points[0], road.points[road.points.length - 1]];
        for (const p of endpoints) {
            const k = key(p.lat, p.lng);
            if (!counts.has(k)) {
                const x = (p.lng - CENTER.lng) * SCALE;
                const z = -(p.lat - CENTER.lat) * SCALE;
                counts.set(k, { count: 0, pos: new THREE.Vector3(x, 0, z) });
            }
            counts.get(k)!.count++;
        }
    }
    return [...counts.values()]
        .filter((v) => v.count >= 2)
        .map((v) => v.pos);
}

/** Scene-unit speed → km/h (approx: 1 scene unit ≈ 0.125 m at SCALE=8000/111320) */
function sceneSpeedToKmh(sceneUnitsPerFrame: number, fps = 60): number {
    const metersPerFrame = sceneUnitsPerFrame / METER; // meters
    const metersPerSecond = metersPerFrame * fps;
    return metersPerSecond * 3.6;
}

async function postSnapshot(metrics: TrafficMetrics, hour: number): Promise<void> {
    try {
        await fetch(`${API_BASE}/traffic-stats/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                sim_hour: hour,
                total_cars: metrics.totalCars,
                stopped_cars: metrics.stoppedCars,
                cars_in_intersections: metrics.carsInIntersections,
                avg_speed_kmh: metrics.avgSpeedKmh,
                zone_counts: metrics.zoneStats,
                intersection_counts: metrics.intersectionCounts,
            }),
        });
    } catch {
        // Network errors are non-fatal; simulation continues
    }
}

export default function CarSystem({ roads, hour, onMetrics }: CarSystemProps) {
    const meshRef = useRef<THREE.InstancedMesh>(null!);
    const lastSnapshotRef = useRef<number>(0);

    const intersections = useMemo(() => deriveIntersections(roads), [roads]);

    const carState = useMemo(() => {
        if (!roads.length) return [];
        return Array.from({ length: MAX_CARS }, (_, i) => ({
            roadIdx: i % roads.length,
            progress: Math.random(),
            speed: 0.0008 + Math.random() * 0.0018,
            laneOffset: ((Math.random() - 0.5) * 3.0) * METER,
            colorIdx: Math.floor(Math.random() * CAR_COLORS.length),
            currentSpeed: 0,
        }));
    }, [roads]);

    const roadCurves = useMemo(() =>
        roads.map((r) => {
            const pts = roadXZ(r);
            return pts.length >= 2 ? new THREE.CatmullRomCurve3(pts) : null;
        }),
    [roads]);

    const dummy = useMemo(() => new THREE.Object3D(), []);
    const tempColor = useMemo(() => new THREE.Color(), []);
    const tempVec = useMemo(() => new THREE.Vector3(), []);

    useFrame((state) => {
        if (!meshRef.current || !roadCurves.length) return;
        const pf = peakFactor(hour);

        let stopped = 0;
        let inIntersection = 0;
        let speedSum = 0;
        const zoneStats: Record<string, ZoneStat> = {};
        const intersectionCounts: Record<string, number> = {};

        carState.forEach((car, i) => {
            const curve = roadCurves[car.roadIdx];
            if (!curve) return;

            const effectiveSpeed = car.speed * (0.2 + pf * 0.8);
            car.currentSpeed = effectiveSpeed;
            car.progress += effectiveSpeed;
            if (car.progress > 1) {
                car.progress = 0;
                car.roadIdx = Math.floor(Math.random() * roads.length);
            }

            const t = Math.min(car.progress, 0.9999);
            const pos = curve.getPointAt(t);
            const tang = curve.getTangentAt(t);
            const side = new THREE.Vector3(-tang.z, 0, tang.x).multiplyScalar(car.laneOffset);

            const yOffset = 0.02 + (1.5 * METER) / 2;
            dummy.position.set(pos.x + side.x, yOffset, pos.z + side.z);
            dummy.lookAt(pos.x + tang.x, yOffset, pos.z + tang.z);
            dummy.updateMatrix();
            meshRef.current.setMatrixAt(i, dummy.matrix);

            tempColor.copy(CAR_COLORS[car.colorIdx]);
            meshRef.current.setColorAt(i, tempColor);

            // --- Metrics ---
            const isStopped = effectiveSpeed < STOPPED_SPEED_THRESHOLD;
            speedSum += effectiveSpeed;
            if (isStopped) stopped++;

            // Named zone classification by car position
            const zoneId = classifyZone(pos.x, pos.z);
            if (zoneId !== null) {
                if (!zoneStats[zoneId]) zoneStats[zoneId] = { total: 0, stopped: 0 };
                zoneStats[zoneId].total++;
                if (isStopped) zoneStats[zoneId].stopped++;
            }

            // Intersection proximity check
            tempVec.set(pos.x, 0, pos.z);
            intersections.forEach((iPos, idx) => {
                if (tempVec.distanceTo(iPos) <= INTERSECTION_RADIUS) {
                    inIntersection++;
                    const key = String(idx);
                    intersectionCounts[key] = (intersectionCounts[key] ?? 0) + 1;
                }
            });
        });

        meshRef.current.instanceMatrix.needsUpdate = true;
        if (meshRef.current.instanceColor) {
            meshRef.current.instanceColor.needsUpdate = true;
        }

        const avgSceneSpeed = carState.length > 0 ? speedSum / carState.length : 0;
        const metrics: TrafficMetrics = {
            totalCars: carState.length,
            stoppedCars: stopped,
            carsInIntersections: inIntersection,
            avgSpeedKmh: Math.round(sceneSpeedToKmh(avgSceneSpeed) * 10) / 10,
            zoneStats,
            intersectionCounts,
        };

        onMetrics?.(metrics);

        // Throttled backend snapshot
        const now = state.clock.getElapsedTime() * 1000;
        if (now - lastSnapshotRef.current >= SNAPSHOT_INTERVAL_MS) {
            lastSnapshotRef.current = now;
            postSnapshot(metrics, hour);
        }
    });

    if (!roads.length) return null;

    return (
        <instancedMesh ref={meshRef} args={[null as any, null as any, MAX_CARS]} castShadow>
            <boxGeometry args={[2.0 * METER, 1.5 * METER, 4.5 * METER]} />
            <meshStandardMaterial metalness={0.3} roughness={0.5} />
        </instancedMesh>
    );
}
