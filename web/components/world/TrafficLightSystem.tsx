"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CENTER } from "./geo";
import { SCALE, METER } from "../simulation/config";
import * as CONFIG from "../simulation/config";
import type { OsmRoad } from "./geo";
import type {
    IntersectionSignal,
    TrafficSignalMap,
    TrafficPhase,
} from "../simulation/trafficLightTypes";

// ─── Qualification ───────────────────────────────────────────────────────────

/** Road types eligible to have a traffic light at their intersection. */
const SIGNAL_TYPES = new Set([
    "primary",
    "secondary",
    "tertiary",
    "residential",
]);

/** At least one road of this type must be present for a signal to be placed. */
const MAJOR_TYPES = new Set(["primary", "secondary", "tertiary"]);

// ─── Internal data structures ────────────────────────────────────────────────

interface ConnectedRoad {
    roadIdx: number;
    /** true → road connects here at points[0]; false → at points[n-1] */
    atStart: boolean;
}

interface IntersectionData {
    idx: number;
    position: THREE.Vector3;
    phaseARoads: Set<number>;
    phaseBRoads: Set<number>;
}

// ─── Pure derivation helpers (SRP) ───────────────────────────────────────────

/**
 * Returns the clockwise-from-north angle (radians) at which a road
 * departs from its intersection endpoint into its own body.
 */
function approachAngle(road: OsmRoad, atStart: boolean): number {
    const pts = road.points;
    const from = atStart ? pts[0] : pts[pts.length - 1];
    const to = atStart ? pts[1] : pts[pts.length - 2];
    if (!to) return 0;
    const dx = (to.lng - from.lng) * SCALE;
    const dz = -(to.lat - from.lat) * SCALE;
    return Math.atan2(dx, -dz);
}

/**
 * Assigns connected roads to two phases using an angular sort so that
 * roughly parallel/opposing roads share the same phase.
 */
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

    // Guarantee both phases are non-empty
    if (phaseB.size === 0 && phaseA.size > 1) {
        const first = [...phaseA][0];
        phaseA.delete(first);
        phaseB.add(first);
    }

    return { phaseA, phaseB };
}

/**
 * Derives the set of intersections that should receive a traffic signal.
 *
 * An intersection qualifies when:
 *  - ≥ 3 road endpoints share the same lat/lng key (= T-junction or better)
 *  - At least one connecting road is of a major type (primary/secondary/tertiary)
 *  - At least two distinct roads connect (deduplication step)
 */
function deriveSignaledIntersections(roads: OsmRoad[]): IntersectionData[] {
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
                const x = (point.lng - CENTER.lng) * SCALE;
                const z = -(point.lat - CENTER.lat) * SCALE;
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

        // Remove duplicate road indices (loop roads whose both ends land here)
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

/** Adaptive green duration formula (clamps to configured bounds). */
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
    /** Shared mutable ref – TrafficLightSystem advances phases; CarSystem updates queues. */
    signalMapRef: React.MutableRefObject<TrafficSignalMap>;
}

/**
 * TrafficLightSystem
 *
 * Responsibilities (SRP):
 *  1. Derive qualified intersections from the road network.
 *  2. Initialise the shared signal map.
 *  3. Advance phase timers and adapt green durations each frame.
 *  4. Render 3-D traffic-light poles.
 *
 * Queue counts (phaseA/BQueueCount) are written by CarSystem each frame;
 * this component only reads them to compute the next phase duration.
 */
export default function TrafficLightSystem({
    roads,
    signalMapRef,
}: TrafficLightSystemProps) {
    const intersections = useMemo(
        () => deriveSignaledIntersections(roads),
        [roads]
    );

    // One-time initialisation: populate signalMapRef when intersections are ready
    const initializedRef = useRef(false);
    if (!initializedRef.current && intersections.length > 0) {
        signalMapRef.current.clear();
        intersections.forEach((inter, i) => {
            // Stagger phases so not every intersection turns green simultaneously
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
        initializedRef.current = true;
    }

    /**
     * Runs BEFORE CarSystem (earlier position in the JSX tree).
     * Reads last frame's queue counts to adapt durations, then resets them
     * so CarSystem can fill them fresh this frame.
     */
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

                // Adapt duration of the phase that is about to go green
                if (next === 0) {
                    signal.phaseADuration = adaptGreenDuration(signal.phaseAQueueCount);
                } else if (next === 2) {
                    signal.phaseBDuration = adaptGreenDuration(signal.phaseBQueueCount);
                }

                signal.currentPhase = next;
            }

            // Reset queue counts so CarSystem writes fresh values this frame
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
const CORNER = 3 * METER; // offset from intersection centre to pole base

/**
 * One traffic-light pole per intersection.
 *
 * The pole shows the signal state for phase-A traffic:
 *   Green  → phase 0 (A has right of way)
 *   Yellow → phase 1 or 3 (transition)
 *   Red    → phase 2 (B has right of way)
 *
 * Material emissive intensity is mutated in useFrame (no React re-renders).
 */
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

    // Place pole at the NE corner of the intersection
    const px = position.x + CORNER;
    const pz = position.z + CORNER;

    return (
        <group position={[px, 0, pz]}>
            {/* Vertical pole */}
            <mesh position={[0, POLE_H / 2, 0]}>
                <cylinderGeometry args={[0.12 * METER, 0.12 * METER, POLE_H, 6]} />
                <meshStandardMaterial color="#4b5563" metalness={0.8} roughness={0.4} />
            </mesh>

            {/* Signal head housing */}
            <mesh position={[0, POLE_H + LIGHT_R * 3.2, 0]}>
                <boxGeometry
                    args={[LIGHT_R * 1.4, LIGHT_R * 7, LIGHT_R * 1.0]}
                />
                <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
            </mesh>

            {/* Red light (top) */}
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

            {/* Yellow light (middle) */}
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

            {/* Green light (bottom) */}
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
