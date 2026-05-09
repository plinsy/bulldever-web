"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { OsmRoad, CENTER, ROAD_WIDTHS } from "../world/geo";
import { classifyZone } from "./zones";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as CONFIG from "./config";
import type { AccidentEvent, AccidentHotspot } from "./accidentTypes";
import type { TrafficSignalMap } from "./trafficLightTypes";

export type { AccidentEvent };

const METER = CONFIG.METER;
const CAR_COLORS = CONFIG.CAR_COLORS.map(c => new THREE.Color(c));
const API_BASE = "http://localhost:8000/api";

// Speed threshold (scene units/frame) below which a car is considered stopped
const STOPPED_SPEED_THRESHOLD = 0.0003;
// Intersection detection radius in scene units
const INTERSECTION_RADIUS = 10 * METER;
// How often (ms) to POST metrics to the backend
const SNAPSHOT_INTERVAL_MS = 5000;

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
    /** Called once per detected collision with the accident details */
    onAccident?: (event: AccidentEvent) => void;
    /** Shared signal map written by TrafficLightSystem; read here to stop cars at red lights. */
    signalMapRef?: React.MutableRefObject<TrafficSignalMap>;
    /** Danger zones fetched from the backend; cars slow down near them. */
    hotspots?: AccidentHotspot[];
}

/** Generate a Madagascar-style license plate: "AB 1234" or "TAM 5678" */
function generatePlate(): string {
    const chars = "ABCDEFGHJKLMNPRSTUVWXY";
    const len = Math.random() > 0.5 ? 2 : 3;
    let prefix = "";
    for (let i = 0; i < len; i++) prefix += chars[Math.floor(Math.random() * chars.length)];
    const digits = String(Math.floor(Math.random() * 9000) + 1000);
    return `${prefix} ${digits}`;
}

function roadXZ(road: OsmRoad) {
    return road.points.map((p: { lat: number; lng: number }) => {
        const x = (p.lng - CENTER.lng) * CONFIG.SCALE;
        const z = -(p.lat - CENTER.lat) * CONFIG.SCALE;
        return new THREE.Vector3(x, 0.02, z); // road surface level
    });
}

function peakFactor(hour: number) {
    if ((hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 19)) return CONFIG.PEAK_HOUR_MAX_SPEED_FACTOR * 0.8;
    if (hour >= 10 && hour <= 15) return CONFIG.PEAK_HOUR_MAX_SPEED_FACTOR * 0.5;
    return CONFIG.PEAK_HOUR_MIN_SPEED_FACTOR;
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
        if (road.points.length < 2) continue;
        const endpoints = [road.points[0], road.points[road.points.length - 1]];
        for (const p of endpoints) {
            const k = key(p.lat, p.lng);
            if (!counts.has(k)) {
                const x = (p.lng - CENTER.lng) * CONFIG.SCALE;
                const z = -(p.lat - CENTER.lat) * CONFIG.SCALE;
                counts.set(k, { count: 0, pos: new THREE.Vector3(x, 0, z) });
            }
            counts.get(k)!.count++;
        }
    }
    return [...counts.values()]
        .filter((v) => v.count >= 2)
        .map((v) => v.pos);
}

/** Scene-unit speed → km/h */
function sceneSpeedToKmh(sceneUnitsPerFrame: number, fps = 60): number {
    const metersPerFrame = sceneUnitsPerFrame / METER; // meters
    const metersPerSecond = metersPerFrame * fps;
    return metersPerSecond * 3.6;
}

async function postAccident(x: number, z: number, bodily: boolean): Promise<void> {
    try {
        await fetch(`${API_BASE}/accidents/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scene_x: x, scene_z: z, bodily }),
        });
    } catch {
        // Network errors are non-fatal; simulation continues
    }
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

export default function CarSystem({ roads, hour, onMetrics, onAccident, signalMapRef, hotspots = [] }: CarSystemProps) {
    const chassisRef = useRef<THREE.InstancedMesh>(null!);
    const cabinRef = useRef<THREE.InstancedMesh>(null!);
    const headLightsRef = useRef<THREE.InstancedMesh>(null!);
    const tailLightsRef = useRef<THREE.InstancedMesh>(null!);
    const wheelRef = useRef<THREE.InstancedMesh>(null!);
    const smokeRef = useRef<THREE.InstancedMesh>(null!);

    const lastSnapshotRef = useRef<number>(0);
    const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
    const collidedPairsRef = useRef<Set<string>>(new Set());
    const frameCountRef = useRef<number>(0);

    const intersections = useMemo(() => deriveIntersections(roads), [roads]);

    const roadConnections = useMemo(() => {
        const map = new Map<number, { roadIdx: number, myEnd: number, theirEnd: number }[]>();
        for (let i = 0; i < roads.length; i++) {
            map.set(i, []);
        }
        for (let i = 0; i < roads.length; i++) {
            const p1 = roads[i].points;
            if (p1.length < 2) continue;

            for (let j = i + 1; j < roads.length; j++) {
                const p2 = roads[j].points;
                if (p2.length < 2) continue;

                const THRESH = CONFIG.INTERSECTION_THRESH;
                const check = (pA: any, pB: any) => Math.abs(pA.lat - pB.lat) < THRESH && Math.abs(pA.lng - pB.lng) < THRESH;

                const ends1 = [0, p1.length - 1];
                for (const idx1 of ends1) {
                    for (let idx2 = 0; idx2 < p2.length; idx2++) {
                        if (check(p1[idx1], p2[idx2])) {
                            const myEnd = idx1 === 0 ? 0 : 1;
                            const theirEnd = idx2 / (p2.length - 1);
                            const existingIdx = map.get(i)!.findIndex(conn => conn.roadIdx === j && Math.abs(conn.myEnd - myEnd) < 0.1);
                            if (existingIdx === -1) {
                                map.get(i)!.push({ roadIdx: j, myEnd, theirEnd });
                                map.get(j)!.push({ roadIdx: i, myEnd: theirEnd, theirEnd: myEnd });
                            }
                        }
                    }
                }

                const ends2 = [0, p2.length - 1];
                for (const idx2 of ends2) {
                    for (let idx1 = 0; idx1 < p1.length; idx1++) {
                        if (ends1.includes(idx1)) continue; 
                        if (check(p2[idx2], p1[idx1])) {
                            const theirEnd = idx2 === 0 ? 0 : 1;
                            const myEnd = idx1 / (p1.length - 1);
                            const existingIdx = map.get(i)!.findIndex(conn => conn.roadIdx === j && Math.abs(conn.myEnd - myEnd) < 0.1);
                            if (existingIdx === -1) {
                                map.get(i)!.push({ roadIdx: j, myEnd, theirEnd });
                                map.get(j)!.push({ roadIdx: i, myEnd: theirEnd, theirEnd: myEnd });
                            }
                        }
                    }
                }
            }
        }
        return map;
    }, [roads]);

    const carState = useMemo(() => {
        if (!roads.length) return [];
        const sortedRoads = roads.map((r, i) => {
            const pts = roadXZ(r);
            let cx = 0, cz = 0;
            if (pts.length) { cx = pts[0].x; cz = pts[0].z; }
            return { idx: i, distSq: cx*cx + cz*cz };
        }).sort((a, b) => a.distSq - b.distSq);
        
        const closestRoads = sortedRoads.slice(0, Math.max(1, Math.min(CONFIG.MAX_CARS, sortedRoads.length)));

        return Array.from({ length: CONFIG.MAX_CARS }, (_, i) => {
            const roadIdx = closestRoads[i % closestRoads.length].idx;
            const road = roads[roadIdx];
            const baseSpeed = CONFIG.TRAFFIC_SPEED_MIN + Math.random() * (CONFIG.TRAFFIC_SPEED_MAX - CONFIG.TRAFFIC_SPEED_MIN);
            const direction = road.oneway ? 1 : (Math.random() > 0.5 ? 1 : -1);
            const roadWidth = ROAD_WIDTHS[road.highway] || CONFIG.NARROW_ROAD_LIMIT * METER;
            const laneOffset = roadWidth > CONFIG.NARROW_ROAD_LIMIT * METER ? CONFIG.LANE_OFFSET * METER : 0;

            return {
                roadIdx,
                progress: Math.random(),
                direction,
                baseSpeed,
                laneOffset, 
                currentLaneOffset: laneOffset,
                colorIdx: Math.floor(Math.random() * CAR_COLORS.length),
                currentPos: new THREE.Vector3(),
                currentLookAt: new THREE.Vector3(),
                initialized: false,
                prevRoadIdx: -1,
                isExploded: false,
                smokeTimer: 0,
                smokeSeeds: Array.from({ length: 8 }, () => ({
                    offset: new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).multiplyScalar(METER),
                    speed: 0.02 + Math.random() * 0.03,
                    delay: Math.random() * 2
                })),
                currentActualSpeed: 0,
                plate: generatePlate(),
            };
        });
    }, [roads]);

    const roadCurves = useMemo(() =>
        roads.map((r) => {
            const pts = roadXZ(r);
            return pts.length >= 2 ? new THREE.CatmullRomCurve3(pts) : null;
        }),
    [roads]);

    const carGeos = useMemo(() => {
        const chassis = new THREE.BoxGeometry(1.8 * METER, 0.6 * METER, 4.0 * METER);
        chassis.translate(0, 0.3 * METER, 0);
        const cabin = new THREE.BoxGeometry(1.6 * METER, 0.6 * METER, 2.2 * METER);
        cabin.translate(0, 0.9 * METER, -0.4 * METER);
        const headLight = new THREE.BoxGeometry(0.35 * METER, 0.15 * METER, 0.1 * METER);
        const hl1 = headLight.clone().translate(0.6 * METER, 0.4 * METER, 2.0 * METER);
        const hl2 = headLight.clone().translate(-0.6 * METER, 0.4 * METER, 2.0 * METER);
        const headlights = BufferGeometryUtils.mergeGeometries([hl1, hl2]);
        const tailLight = new THREE.BoxGeometry(0.35 * METER, 0.15 * METER, 0.1 * METER);
        const tl1 = tailLight.clone().translate(0.6 * METER, 0.4 * METER, -2.0 * METER);
        const tl2 = tailLight.clone().translate(-0.6 * METER, 0.4 * METER, -2.0 * METER);
        const taillights = BufferGeometryUtils.mergeGeometries([tl1, tl2]);
        const wheel = new THREE.BoxGeometry(0.3 * METER, 0.5 * METER, 0.7 * METER);
        const w1 = wheel.clone().translate(0.9 * METER, 0.25 * METER, 1.2 * METER);
        const w2 = wheel.clone().translate(-0.9 * METER, 0.25 * METER, 1.2 * METER);
        const w3 = wheel.clone().translate(0.9 * METER, 0.25 * METER, -1.2 * METER);
        const w4 = wheel.clone().translate(-0.9 * METER, 0.25 * METER, -1.2 * METER);
        const wheels = BufferGeometryUtils.mergeGeometries([w1, w2, w3, w4]);
        return { chassis, cabin, headlights, taillights, wheels };
    }, []);

    const dummy = useMemo(() => new THREE.Object3D(), []);
    const tempColor = useMemo(() => new THREE.Color(), []);
    const tempVec = useMemo(() => new THREE.Vector3(), []);

    useFrame((state) => {
        if (!chassisRef.current || !roadCurves.length) return;
        const pf = peakFactor(hour);
        const time = state.clock.elapsedTime;

        let stopped = 0;
        let inIntersection = 0;
        let speedSum = 0;
        const zoneStats: Record<string, ZoneStat> = {};
        const intersectionCounts: Record<string, number> = {};

        carState.forEach((car, i) => {
            if (car.isExploded) {
                car.smokeTimer += CONFIG.SMOKE_ANIM_SPEED;
                const lifetime = CONFIG.SMOKE_LIFETIME;
                for (let p = 0; p < 8; p++) {
                    const seed = car.smokeSeeds[p];
                    const life = (car.smokeTimer + seed.delay) % lifetime; 
                    const t = life / lifetime;
                    const smokeIdx = i * 8 + p;
                    const rise = t * CONFIG.SMOKE_RISE_HEIGHT * METER;
                    const drift = Math.sin(car.smokeTimer + p) * 0.8 * METER;
                    dummy.position.copy(car.currentPos).add(new THREE.Vector3(0, 1.0 * METER, 0)).add(seed.offset).add(new THREE.Vector3(drift, rise, 0));
                    dummy.scale.setScalar((1.0 - t) * CONFIG.SMOKE_SIZE);
                    dummy.updateMatrix();
                    smokeRef.current.setMatrixAt(smokeIdx, dummy.matrix);
                }
                dummy.position.copy(car.currentPos);
                dummy.lookAt(car.currentLookAt);
                dummy.scale.setScalar(1);
                dummy.updateMatrix();
                chassisRef.current.setMatrixAt(i, dummy.matrix);
                cabinRef.current.setMatrixAt(i, dummy.matrix);
                wheelRef.current.setMatrixAt(i, dummy.matrix);
                dummy.scale.setScalar(0);
                dummy.updateMatrix();
                headLightsRef.current.setMatrixAt(i, dummy.matrix);
                tailLightsRef.current.setMatrixAt(i, dummy.matrix);
                tempColor.set("#1a1a1a");
                chassisRef.current.setColorAt(i, tempColor);
                stopped++; // Exploded car is stopped
                return;
            }

            for (let p = 0; p < 8; p++) {
                dummy.scale.setScalar(0); dummy.updateMatrix();
                smokeRef.current.setMatrixAt(i * 8 + p, dummy.matrix);
            }
            dummy.scale.setScalar(1);

            const curve = roadCurves[car.roadIdx];
            if (!curve) return;

            let minDistanceInFront = Infinity;
            carState.forEach((otherCar, j) => {
                if (i === j || !otherCar.initialized || !car.initialized) return;
                const sameRoadAndDir = (otherCar.roadIdx === car.roadIdx && otherCar.direction === car.direction);
                if (otherCar.roadIdx === car.roadIdx && otherCar.direction !== car.direction) return;
                if (!sameRoadAndDir && i > j) return;
                const toOther = new THREE.Vector3().subVectors(otherCar.currentPos, car.currentPos);
                const dist = toOther.length();
                if (dist < CONFIG.RADAR_DISTANCE * METER) {
                    toOther.normalize();
                    const curveT = Math.max(0, Math.min(1, car.progress));
                    const fwd = curve.getTangentAt(curveT);
                    if (car.direction === -1) fwd.negate();
                    if (fwd.dot(toOther) > CONFIG.RADAR_CONE_DOT) {
                        minDistanceInFront = Math.min(minDistanceInFront, dist);
                    }
                }
            });

            let currentSpeed = car.baseSpeed;
            const safeGap = CONFIG.SAFE_GAP * METER;
            const slowGap = CONFIG.SLOW_GAP * METER;
            if (minDistanceInFront < safeGap) {
                currentSpeed = 0;
            } else if (minDistanceInFront < slowGap) {
                currentSpeed *= 0.3;
            }

            // ── Traffic light check ──────────────────────────────────────
            if (currentSpeed > 0 && signalMapRef?.current) {
                const curveT = Math.max(0, Math.min(1, car.progress));
                const fwd = curve.getTangentAt(curveT);
                if (car.direction === -1) fwd.negate();

                const approachDist = CONFIG.TRAFFIC_LIGHT_APPROACH * METER;
                const stopDist = CONFIG.TRAFFIC_LIGHT_STOP * METER;
                const innerDist = CONFIG.TRAFFIC_LIGHT_INNER * METER;
                const queueDist = CONFIG.TRAFFIC_LIGHT_QUEUE_ZONE * METER;

                for (const signal of signalMapRef.current.values()) {
                    const dx = signal.position.x - car.currentPos.x;
                    const dz = signal.position.z - car.currentPos.z;
                    const distSq = dx * dx + dz * dz;
                    if (distSq > approachDist * approachDist) continue;

                    const dist = Math.sqrt(distSq);
                    if (dist < innerDist) continue; // already inside, don't stop

                    // Only react if the intersection is ahead of the car
                    const towardDot = (dx / dist) * fwd.x + (dz / dist) * fwd.z;
                    if (towardDot < 0.3) continue;

                    const inA = signal.phaseARoads.has(car.roadIdx);
                    const inB = signal.phaseBRoads.has(car.roadIdx);
                    if (!inA && !inB) continue;

                    // Phase 0 = A green, phase 2 = B green
                    const isRed = inA ? signal.currentPhase !== 0 : signal.currentPhase !== 2;
                    if (!isRed) continue;

                    // Brake proportionally and hard-stop at the stop line
                    if (dist <= stopDist) {
                        currentSpeed = 0;
                    } else {
                        const brakeFactor = (dist - stopDist) / (approachDist - stopDist);
                        currentSpeed = Math.min(currentSpeed, car.baseSpeed * brakeFactor * 0.6);
                    }

                    // Count this car as queued for adaptive timing
                    if (dist < queueDist) {
                        if (inA) signal.phaseAQueueCount++;
                        else signal.phaseBQueueCount++;
                    }
                }
            }
            // ── End traffic light check ───────────────────────────────────

            // ── Hotspot slowdown (accident prevention) ───────────────────
            if (currentSpeed > 0 && hotspots.length > 0) {
                const influenceSq = CONFIG.HOTSPOT_INFLUENCE_RADIUS * CONFIG.HOTSPOT_INFLUENCE_RADIUS;
                for (const hs of hotspots) {
                    const dx = hs.x - car.currentPos.x;
                    const dz = hs.z - car.currentPos.z;
                    if (dx * dx + dz * dz < influenceSq) {
                        currentSpeed *= CONFIG.HOTSPOT_SPEED_PENALTY;
                        break; // One hotspot hit is enough
                    }
                }
            }
            // ── End hotspot slowdown ──────────────────────────────────────

            const curveLen = curve.getLength();
            if (curveLen > 0.1) {
                const progressSpeed = (currentSpeed * (0.2 + pf * 0.8)) / curveLen;
                car.progress += progressSpeed * car.direction;
            }
            
            if (car.progress >= 1 || car.progress <= 0) {
                const atEnd = car.progress >= 1 ? 1 : 0;
                const conns = roadConnections.get(car.roadIdx)?.filter(c => {
                    if (Math.abs(c.myEnd - atEnd) > CONFIG.INTERSECTION_TOLERANCE) return false;
                    const nextRoad = roads[c.roadIdx];
                    if (nextRoad.oneway && c.theirEnd === 1) return false;
                    return true;
                }) || [];
                
                if (conns.length > 0) {
                    const filteredConns = conns.filter(c => c.roadIdx !== car.prevRoadIdx);
                    const options = filteredConns.length > 0 ? filteredConns : conns;
                    const conn = options[Math.floor(Math.random() * options.length)];
                    car.prevRoadIdx = car.roadIdx;
                    car.roadIdx = conn.roadIdx;
                    car.progress = conn.theirEnd;
                    car.direction = conn.theirEnd === 0 ? 1 : -1;
                } else {
                    if (roads[car.roadIdx].oneway) {
                        car.progress = 0; 
                    } else {
                        car.progress = atEnd;
                        car.direction *= -1;
                    }
                }
            }

            const t = Math.max(0, Math.min(1, car.progress));
            const pos = curve.getPointAt(t);
            const tang = curve.getTangentAt(t);
            const forward = car.direction === 1 ? tang : tang.clone().negate();
            const roadWidth = ROAD_WIDTHS[roads[car.roadIdx].highway] || CONFIG.NARROW_ROAD_LIMIT * METER;
            const targetLaneOffset = roadWidth > CONFIG.NARROW_ROAD_LIMIT * METER ? CONFIG.LANE_OFFSET * METER : 0;
            car.currentLaneOffset = THREE.MathUtils.lerp(car.currentLaneOffset, targetLaneOffset, CONFIG.LERP_LANE_OFFSET);
            const side = new THREE.Vector3(forward.z, 0, -forward.x).normalize().multiplyScalar(car.currentLaneOffset);
            const yOffset = 0.02;
            const targetPos = new THREE.Vector3(pos.x + side.x, yOffset, pos.z + side.z);
            const targetLookAt = new THREE.Vector3(targetPos.x + forward.x, yOffset, targetPos.z + forward.z);

            if (!car.initialized) {
                car.currentPos.copy(targetPos);
                car.currentLookAt.copy(targetLookAt);
                car.initialized = true;
            } else {
                const moveSpeed = Math.max(0.01, currentSpeed * (0.2 + pf * 0.8) * CONFIG.TURN_SPEED_MULTIPLIER);
                const toTarget = new THREE.Vector3().subVectors(targetPos, car.currentPos);
                if (toTarget.length() <= moveSpeed) {
                    car.currentPos.copy(targetPos);
                } else {
                    car.currentPos.add(toTarget.normalize().multiplyScalar(moveSpeed));
                }
                car.currentLookAt.lerp(targetLookAt, CONFIG.LERP_LOOKAT);
            }

            dummy.position.copy(car.currentPos);
            dummy.lookAt(car.currentLookAt);
            dummy.updateMatrix();

            chassisRef.current.setMatrixAt(i, dummy.matrix);
            cabinRef.current.setMatrixAt(i, dummy.matrix);
            headLightsRef.current.setMatrixAt(i, dummy.matrix);
            tailLightsRef.current.setMatrixAt(i, dummy.matrix);
            wheelRef.current.setMatrixAt(i, dummy.matrix);
            tempColor.copy(CAR_COLORS[car.colorIdx]);
            chassisRef.current.setColorAt(i, tempColor);

            // --- Metrics ---
            const effectiveSpeed = currentSpeed * (0.2 + pf * 0.8);
            const isStopped = effectiveSpeed < STOPPED_SPEED_THRESHOLD;
            speedSum += effectiveSpeed;
            if (isStopped) stopped++;

            const zoneId = classifyZone(pos.x, pos.z);
            if (zoneId !== null) {
                if (!zoneStats[zoneId]) zoneStats[zoneId] = { total: 0, stopped: 0 };
                zoneStats[zoneId].total++;
                if (isStopped) zoneStats[zoneId].stopped++;
            }

            tempVec.set(pos.x, 0, pos.z);
            intersections.forEach((iPos, idx) => {
                if (tempVec.distanceTo(iPos) <= INTERSECTION_RADIUS) {
                    inIntersection++;
                    const key = String(idx);
                    intersectionCounts[key] = (intersectionCounts[key] ?? 0) + 1;
                }
            });
        });

        chassisRef.current.instanceMatrix.needsUpdate = true;
        chassisRef.current.instanceColor!.needsUpdate = true;
        cabinRef.current.instanceMatrix.needsUpdate = true;
        headLightsRef.current.instanceMatrix.needsUpdate = true;
        tailLightsRef.current.instanceMatrix.needsUpdate = true;
        wheelRef.current.instanceMatrix.needsUpdate = true;
        smokeRef.current.instanceMatrix.needsUpdate = true;

        // --- Accident / Collision detection ---
        frameCountRef.current++;
        if (frameCountRef.current > CONFIG.ACCIDENT_GRACE_FRAMES && onAccident) {
            const collDist = CONFIG.COLLISION_DISTANCE * METER;
            for (let i = 0; i < carState.length; i++) {
                const a = carState[i];
                if (!a.initialized) continue;
                for (let j = i + 1; j < carState.length; j++) {
                    const b = carState[j];
                    if (!b.initialized) continue;
                    const pairId = `${i}-${j}`;
                    if (collidedPairsRef.current.has(pairId)) continue;
                    const dist = a.currentPos.distanceTo(b.currentPos);
                    if (dist < collDist) {
                        collidedPairsRef.current.add(pairId);
                        a.isExploded = true;
                        b.isExploded = true;
                        const midpoint = new THREE.Vector3().addVectors(a.currentPos, b.currentPos).multiplyScalar(0.5);
                        const bodily = Math.random() < 0.4; // 40% chance of bodily injury
                        onAccident({
                            id: pairId,
                            position: { x: midpoint.x, y: midpoint.y, z: midpoint.z },
                            plates: [a.plate, b.plate],
                            bodily,
                            timestamp: Date.now(),
                        });
                        postAccident(midpoint.x, midpoint.z, bodily);
                    }
                }
            }
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

        const now = state.clock.getElapsedTime() * 1000;
        if (now - lastSnapshotRef.current >= SNAPSHOT_INTERVAL_MS) {
            lastSnapshotRef.current = now;
            postSnapshot(metrics, hour);
        }
    });

    if (!roads.length) return null;
    const selectedCar = selectedIdx !== null ? carState[selectedIdx] : null;

    return (
        <group>
            {selectedCar && (
                <group>
                    <mesh position={[selectedCar.currentPos.x, selectedCar.currentPos.y + 4 * METER, selectedCar.currentPos.z]}>
                        <Html center>
                            <div style={{
                                background: "rgba(0,0,0,0.8)", color: "white", padding: "12px", borderRadius: "8px", border: "1px solid #444", minWidth: "150px", pointerEvents: "auto", backdropFilter: "blur(4px)", fontSize: "14px", userSelect: "none"
                            }}>
                                <div style={{ fontWeight: "bold", marginBottom: "5px" }}>Véhicule #{selectedIdx}</div>
                                <div>Vitesse: {(selectedCar.baseSpeed * 5000).toFixed(0)} km/h</div>
                                <div>Route: {roads[selectedCar.roadIdx].highway} ({roads[selectedCar.roadIdx].name || "Sans nom"})</div>
                                <div style={{ marginTop: "10px" }}>
                                    <button onClick={(e) => { e.stopPropagation(); selectedCar.isExploded = !selectedCar.isExploded; setSelectedIdx(null); }} style={{ background: selectedCar.isExploded ? "#22c55e" : "#ef4444", color: "white", border: "none", padding: "5px 10px", borderRadius: "4px", cursor: "pointer", width: "100%", fontWeight: "bold" }}>
                                        {selectedCar.isExploded ? "🔧 RÉPARER" : "💥 EXPLOSER !"}
                                    </button>
                                </div>
                            </div>
                        </Html>
                    </mesh>
                </group>
            )}

            <instancedMesh ref={chassisRef} args={[carGeos.chassis, null as any, CONFIG.MAX_CARS]} castShadow onClick={(e) => { e.stopPropagation(); setSelectedIdx(e.instanceId!); }} onPointerMissed={() => setSelectedIdx(null)}>
                <meshStandardMaterial roughness={0.5} metalness={0.6} />
            </instancedMesh>
            <instancedMesh ref={cabinRef} args={[carGeos.cabin, null as any, CONFIG.MAX_CARS]} castShadow>
                <meshStandardMaterial color="#111" roughness={0.1} metalness={0.9} />
            </instancedMesh>
            <instancedMesh ref={headLightsRef} args={[carGeos.headlights, null as any, CONFIG.MAX_CARS]}>
                <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={2} />
            </instancedMesh>
            <instancedMesh ref={tailLightsRef} args={[carGeos.taillights, null as any, CONFIG.MAX_CARS]}>
                <meshStandardMaterial color="#f00" emissive="#f00" emissiveIntensity={2} />
            </instancedMesh>
            <instancedMesh ref={wheelRef} args={[carGeos.wheels, null as any, CONFIG.MAX_CARS]}>
                <meshStandardMaterial color="#050505" roughness={0.9} />
            </instancedMesh>
            <instancedMesh ref={smokeRef} args={[new THREE.SphereGeometry(0.5, 8, 8), null as any, CONFIG.MAX_CARS * 8]}>
                <meshStandardMaterial color="#444" transparent opacity={0.6} />
            </instancedMesh>
        </group>
    );
}
