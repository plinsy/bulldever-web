"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { SCALE, METER } from "../simulation/config";
import * as CONFIG from "../simulation/config";
import type { OsmRoad, LatLng } from "./geo";
import type {
    TrafficSignalMap,
    TrafficPhase,
} from "../simulation/trafficLightTypes";

// ─── Qualification ───────────────────────────────────────────────────────────

const SIGNAL_TYPES = new Set([
    "primary",
    "secondary",
    "tertiary",
    "residential",
]);

const MAJOR_TYPES = new Set(["primary", "secondary", "tertiary"]);

// ─── Internal data structures ────────────────────────────────────────────────

interface ConnectedRoad {
    roadIdx: number;
    atStart: boolean;
}

interface IntersectionData {
    idx: number;
    position: THREE.Vector3;
    phaseARoads: Set<number>;
    phaseBRoads: Set<number>;
}

// ─── Pure derivation helpers (SRP) ───────────────────────────────────────────

function approachAngle(road: OsmRoad, atStart: boolean): number {
    const pts = road.points;
    const from = atStart ? pts[0] : pts[pts.length - 1];
    const to = atStart ? pts[1] : pts[pts.length - 2];
    if (!to) return 0;
    const dx = (to.lng - from.lng) * SCALE;
    const dz = -(to.lat - from.lat) * SCALE;
    return Math.atan2(dx, -dz);
}

function assignPhases(
    roads: OsmRoad[],
    connected: ConnectedRoad[]
): { phaseA: Set<number>; phaseB: Set<number> } {
    const phaseA = new Set<number>();
    const phaseB = new Set<number>();

    const sorted = connected
        .map((c) => ({
            roadIdx: c.roadIdx,
            angle: approachAngle(roads[c.roadIdx], c.atStart),
        }))
        .sort((a, b) => a.angle - b.angle);

    sorted.forEach((entry, i) => {
        if (i % 2 === 0) phaseA.add(entry.roadIdx);
        else phaseB.add(entry.roadIdx);
    });

    if (phaseB.size === 0 && phaseA.size > 1) {
        const first = [...phaseA][0];
        phaseA.delete(first);
        phaseB.add(first);
    }

    return { phaseA, phaseB };
}

function deriveSignaledIntersections(roads: OsmRoad[], center: LatLng): IntersectionData[] {
    const key = (lat: number, lng: number) =>
        `${lat.toFixed(4)},${lng.toFixed(4)}`;

    type Entry = {
        count: number;
        pos: THREE.Vector3;
        connected: ConnectedRoad[];
        hasMajor: boolean;
    };

    const map = new Map<string, Entry>();

    for (let i = 0; i < roads.length; i++) {
        const road = roads[i];
        if (road.points.length < 2) continue;
        if (!SIGNAL_TYPES.has(road.highway)) continue;

        const endpoints: Array<{ point: { lat: number; lng: number }; atStart: boolean }> = [
            { point: road.points[0], atStart: true },
            { point: road.points[road.points.length - 1], atStart: false },
        ];

        for (const { point, atStart } of endpoints) {
            const k = key(point.lat, point.lng);
            if (!map.has(k)) {
                const x = (point.lng - center.lng) * SCALE;
                const z = -(point.lat - center.lat) * SCALE;
                map.set(k, {
                    count: 0,
                    pos: new THREE.Vector3(x, 0, z),
                    connected: [],
                    hasMajor: false,
                });
            }
            const entry = map.get(k)!;
            entry.count++;
            entry.connected.push({ roadIdx: i, atStart });
            if (MAJOR_TYPES.has(road.highway)) entry.hasMajor = true;
        }
    }

    let idx = 0;
    const result: IntersectionData[] = [];

    for (const entry of map.values()) {
        if (entry.count < 3 || !entry.hasMajor) continue;

        const unique = entry.connected.filter(
            (c, i, arr) => arr.findIndex((x) => x.roadIdx === c.roadIdx) === i
        );
        if (unique.length < 2) continue;

        const { phaseA, phaseB } = assignPhases(roads, unique);
        result.push({
            idx: idx++,
            position: entry.pos,
            phaseARoads: phaseA,
            phaseBRoads: phaseB,
        });
    }

    return result;
}

function adaptGreenDuration(queueCount: number): number {
    return Math.max(
        CONFIG.SIGNAL_MIN_GREEN,
        Math.min(
            CONFIG.SIGNAL_MAX_GREEN,
            CONFIG.SIGNAL_BASE_GREEN + queueCount * CONFIG.SIGNAL_QUEUE_WEIGHT
        )
    );
}

// ─── Component ───────────────────────────────────────────────────────────────

export interface TrafficLightSystemProps {
    roads: OsmRoad[];
    signalMapRef: React.MutableRefObject<TrafficSignalMap>;
    center: LatLng;
}

export default function TrafficLightSystem({
    roads,
    signalMapRef,
    center,
}: TrafficLightSystemProps) {
    const intersections = useMemo(
        () => deriveSignaledIntersections(roads, center),
        [roads, center]
    );

    // Initialisation: populate signalMapRef when intersections change (due to map movement)
    useEffect(() => {
        signalMapRef.current.clear();
        intersections.forEach((inter, i) => {
            const initialPhase: TrafficPhase = i % 2 === 0 ? 0 : 2;
            signalMapRef.current.set(inter.idx, {
                idx: inter.idx,
                position: { x: inter.position.x, z: inter.position.z },
                phaseARoads: inter.phaseARoads,
                phaseBRoads: inter.phaseBRoads,
                currentPhase: initialPhase,
                phaseTimer: Math.random() * CONFIG.SIGNAL_BASE_GREEN,
                phaseADuration: CONFIG.SIGNAL_BASE_GREEN,
                phaseBDuration: CONFIG.SIGNAL_BASE_GREEN,
                phaseAQueueCount: 0,
                phaseBQueueCount: 0,
            });
        });
    }, [intersections, signalMapRef]);

    useFrame((_, delta) => {
        for (const signal of signalMapRef.current.values()) {
            const phaseDuration =
                signal.currentPhase === 0 ? signal.phaseADuration :
                signal.currentPhase === 2 ? signal.phaseBDuration :
                CONFIG.SIGNAL_YELLOW_DUR;

            signal.phaseTimer += delta;

            if (signal.phaseTimer >= phaseDuration) {
                signal.phaseTimer = 0;
                const next = ((signal.currentPhase + 1) % 4) as TrafficPhase;

                if (next === 0) {
                    signal.phaseADuration = adaptGreenDuration(signal.phaseAQueueCount);
                } else if (next === 2) {
                    signal.phaseBDuration = adaptGreenDuration(signal.phaseBQueueCount);
                }

                signal.currentPhase = next;
            }

            signal.phaseAQueueCount = 0;
            signal.phaseBQueueCount = 0;
        }
    });

    if (!intersections.length) return null;

    return (
        <group>
            {intersections.map((inter) => (
                <TrafficLightPole
                    key={inter.idx}
                    intersectionIdx={inter.idx}
                    position={inter.position}
                    signalMapRef={signalMapRef}
                />
            ))}
        </group>
    );
}

// ─── 3-D Pole sub-component ──────────────────────────────────────────────────

interface PoleProps {
    intersectionIdx: number;
    position: THREE.Vector3;
    signalMapRef: React.MutableRefObject<TrafficSignalMap>;
}

const POLE_H = 5 * METER;
const LIGHT_R = 0.5 * METER;
const CORNER = 3 * METER;

function TrafficLightPole({ intersectionIdx, position, signalMapRef }: PoleProps) {
    const redMatRef = useRef<THREE.MeshStandardMaterial>(null!);
    const yellowMatRef = useRef<THREE.MeshStandardMaterial>(null!);
    const greenMatRef = useRef<THREE.MeshStandardMaterial>(null!);

    useFrame(() => {
        const signal = signalMapRef.current.get(intersectionIdx);
        if (!signal || !redMatRef.current) return;

        const showGreen = signal.currentPhase === 0;
        const showYellow = signal.currentPhase === 1 || signal.currentPhase === 3;
        const showRed = signal.currentPhase === 2;

        redMatRef.current.emissiveIntensity = showRed ? 4 : 0.08;
        yellowMatRef.current.emissiveIntensity = showYellow ? 4 : 0.08;
        greenMatRef.current.emissiveIntensity = showGreen ? 4 : 0.08;
    });

    const px = position.x + CORNER;
    const pz = position.z + CORNER;

    return (
        <group position={[px, 0, pz]}>
            <mesh position={[0, POLE_H / 2, 0]}>
                <cylinderGeometry args={[0.12 * METER, 0.12 * METER, POLE_H, 6]} />
                <meshStandardMaterial color="#4b5563" metalness={0.8} roughness={0.4} />
            </mesh>

            <mesh position={[0, POLE_H + LIGHT_R * 3.2, 0]}>
                <boxGeometry
                    args={[LIGHT_R * 1.4, LIGHT_R * 7, LIGHT_R * 1.0]}
                />
                <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
            </mesh>

            <mesh position={[0, POLE_H + LIGHT_R * 5.5, 0]}>
                <sphereGeometry args={[LIGHT_R * 0.42, 10, 10]} />
                <meshStandardMaterial
                    ref={redMatRef}
                    color="#ff1a1a"
                    emissive="#ff0000"
                    emissiveIntensity={0.08}
                    roughness={0.3}
                />
            </mesh>

            <mesh position={[0, POLE_H + LIGHT_R * 3.2, 0]}>
                <sphereGeometry args={[LIGHT_R * 0.42, 10, 10]} />
                <meshStandardMaterial
                    ref={yellowMatRef}
                    color="#ffcc00"
                    emissive="#ffcc00"
                    emissiveIntensity={0.08}
                    roughness={0.3}
                />
            </mesh>

            <mesh position={[0, POLE_H + LIGHT_R * 0.9, 0]}>
                <sphereGeometry args={[LIGHT_R * 0.42, 10, 10]} />
                <meshStandardMaterial
                    ref={greenMatRef}
                    color="#00ff44"
                    emissive="#00ff44"
                    emissiveIntensity={0.08}
                    roughness={0.3}
                />
            </mesh>
        </group>
    );
}
