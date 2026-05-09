"use client";

import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { OsmRoad, CENTER, ROAD_WIDTHS } from "../world/geo";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as CONFIG from "./config";

const METER = CONFIG.METER;
const CAR_COLORS = CONFIG.CAR_COLORS.map(c => new THREE.Color(c));

interface CarSystemProps {
    roads: OsmRoad[];
    hour: number;
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

export default function CarSystem({ roads, hour }: CarSystemProps) {
    const meshRef = useRef<THREE.InstancedMesh>(null!);

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

                // Threshold for connection
                const THRESH = CONFIG.INTERSECTION_THRESH;
                const check = (pA: any, pB: any) => Math.abs(pA.lat - pB.lat) < THRESH && Math.abs(pA.lng - pB.lng) < THRESH;

                // 1. Check if endpoints of road i connect to ANY point of road j
                const ends1 = [0, p1.length - 1];
                for (const idx1 of ends1) {
                    for (let idx2 = 0; idx2 < p2.length; idx2++) {
                        if (check(p1[idx1], p2[idx2])) {
                            const myEnd = idx1 === 0 ? 0 : 1;
                            const theirEnd = idx2 / (p2.length - 1);
                            
                            // Prioritize endpoints (0 or 1) over middle points
                            const weight = (idx2 === 0 || idx2 === p2.length - 1) ? 0 : 1;

                            // Avoid duplicates or prefer endpoints
                            const existingIdx = map.get(i)!.findIndex(conn => conn.roadIdx === j && Math.abs(conn.myEnd - myEnd) < 0.1);
                            if (existingIdx === -1) {
                                map.get(i)!.push({ roadIdx: j, myEnd, theirEnd });
                                map.get(j)!.push({ roadIdx: i, myEnd: theirEnd, theirEnd: myEnd });
                            }
                        }
                    }
                }

                // 2. Check if endpoints of road j connect to ANY point of road i
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
        
        // Find roads closest to the center so cars spawn in the immediate view
        const sortedRoads = roads.map((r, i) => {
            const pts = roadXZ(r);
            let cx = 0, cz = 0;
            if (pts.length) {
                cx = pts[0].x; cz = pts[0].z;
            }
            return { idx: i, distSq: cx*cx + cz*cz };
        }).sort((a, b) => a.distSq - b.distSq);
        
        const closestRoads = sortedRoads.slice(0, Math.max(1, Math.min(CONFIG.MAX_CARS, sortedRoads.length)));

        return Array.from({ length: CONFIG.MAX_CARS }, (_, i) => {
            const roadIdx = closestRoads[i % closestRoads.length].idx;
            const road = roads[roadIdx];
            
            // Physical base speed in scene units per frame
            const baseSpeed = CONFIG.TRAFFIC_SPEED_MIN + Math.random() * (CONFIG.TRAFFIC_SPEED_MAX - CONFIG.TRAFFIC_SPEED_MIN);
            
            // Respect one-way roads
            const direction = road.oneway ? 1 : (Math.random() > 0.5 ? 1 : -1);

            // Dynamic Lane Offset based on road width
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
                }))
            };
        });
    }, [roads]);

    const roadCurves = useMemo(() =>
        roads.map((r) => {
            const pts = roadXZ(r);
            return pts.length >= 2 ? new THREE.CatmullRomCurve3(pts) : null;
        }),
    [roads]);

    // Pre-calculated geometries for the detailed car model
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

    const chassisRef = useRef<THREE.InstancedMesh>(null!);
    const cabinRef = useRef<THREE.InstancedMesh>(null!);
    const headLightsRef = useRef<THREE.InstancedMesh>(null!);
    const tailLightsRef = useRef<THREE.InstancedMesh>(null!);
    const wheelRef = useRef<THREE.InstancedMesh>(null!);
    const smokeRef = useRef<THREE.InstancedMesh>(null!);

    const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

    const dummy = useMemo(() => new THREE.Object3D(), []);
    const tempColor = useMemo(() => new THREE.Color(), []);

    useFrame((state) => {
        if (!chassisRef.current || !roadCurves.length) return;
        const pf = peakFactor(hour);
        const time = state.clock.elapsedTime;

        carState.forEach((car, i) => {
            if (car.isExploded) {
                // Animate 8 smoke particles
                car.smokeTimer += CONFIG.SMOKE_ANIM_SPEED;
                const lifetime = CONFIG.SMOKE_LIFETIME;
                for (let p = 0; p < 8; p++) {
                    const seed = car.smokeSeeds[p];
                    const life = (car.smokeTimer + seed.delay) % lifetime; 
                    const t = life / lifetime;
                    
                    const smokeIdx = i * 8 + p;
                    const rise = t * CONFIG.SMOKE_RISE_HEIGHT * METER;
                    const drift = Math.sin(car.smokeTimer + p) * 0.8 * METER;
                    
                    dummy.position.copy(car.currentPos)
                        .add(new THREE.Vector3(0, 1.0 * METER, 0)) 
                        .add(seed.offset)
                        .add(new THREE.Vector3(drift, rise, 0));
                    
                    const size = (1.0 - t) * CONFIG.SMOKE_SIZE; // Shrink as it rises
                    dummy.scale.setScalar(size);
                    dummy.updateMatrix();
                    smokeRef.current.setMatrixAt(smokeIdx, dummy.matrix);
                }
                
                // Keep car in place with burnt look
                dummy.position.copy(car.currentPos);
                dummy.lookAt(car.currentLookAt);
                dummy.scale.setScalar(1);
                dummy.updateMatrix();
                
                chassisRef.current.setMatrixAt(i, dummy.matrix);
                cabinRef.current.setMatrixAt(i, dummy.matrix);
                wheelRef.current.setMatrixAt(i, dummy.matrix);

                // Turn off lights (scale to 0)
                dummy.scale.setScalar(0);
                dummy.updateMatrix();
                headLightsRef.current.setMatrixAt(i, dummy.matrix);
                tailLightsRef.current.setMatrixAt(i, dummy.matrix);

                tempColor.set("#1a1a1a"); // Burnt black
                chassisRef.current.setColorAt(i, tempColor);
                return;
            }

            // Hide smoke for normal cars
            for (let p = 0; p < 8; p++) {
                dummy.scale.setScalar(0);
                dummy.updateMatrix();
                smokeRef.current.setMatrixAt(i * 8 + p, dummy.matrix);
            }
            dummy.scale.setScalar(1);

            const curve = roadCurves[car.roadIdx];
            if (!curve) return;

            // 1. Radar Collision Logic: Check physical 3D distance to all other cars
            let minDistanceInFront = Infinity;

            carState.forEach((otherCar, j) => {
                if (i === j || !otherCar.initialized || !car.initialized) return;
                
                const sameRoadAndDir = (otherCar.roadIdx === car.roadIdx && otherCar.direction === car.direction);

                // Ignore oncoming traffic on the exact same road
                if (otherCar.roadIdx === car.roadIdx && otherCar.direction !== car.direction) return;

                // Priority Rule: yield to cars with lower index at intersections
                if (!sameRoadAndDir && i > j) return;

                const toOther = new THREE.Vector3().subVectors(otherCar.currentPos, car.currentPos);
                const dist = toOther.length();

                if (dist < CONFIG.RADAR_DISTANCE * METER) {
                    toOther.normalize();
                    const curveT = Math.max(0, Math.min(1, car.progress));
                    const fwd = curve.getTangentAt(curveT);
                    if (car.direction === -1) fwd.negate();

                    const dot = fwd.dot(toOther);
                    if (dot > CONFIG.RADAR_CONE_DOT) {
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

            const curveLen = curve.getLength();
            if (curveLen > 0.1) {
                const progressSpeed = (currentSpeed * (0.2 + pf * 0.8)) / curveLen;
                car.progress += progressSpeed * car.direction;
            }
            
            // 2. Intersection & Bounce logic
            if (car.progress >= 1 || car.progress <= 0) {
                const atEnd = car.progress >= 1 ? 1 : 0;
                // Use tolerance from config
                const conns = roadConnections.get(car.roadIdx)?.filter(c => {
                    if (Math.abs(c.myEnd - atEnd) > CONFIG.INTERSECTION_TOLERANCE) return false;
                    const nextRoad = roads[c.roadIdx];
                    // Don't enter a one-way road in the wrong direction
                    // If we spawn at theirEnd=1, we would have direction -1. 
                    // Not allowed if it's one-way.
                    if (nextRoad.oneway && c.theirEnd === 1) return false;
                    return true;
                }) || [];
                
                if (conns.length > 0) {
                    // Filter out the road we just came from to avoid immediate U-turns
                    const filteredConns = conns.filter(c => c.roadIdx !== car.prevRoadIdx);
                    const options = filteredConns.length > 0 ? filteredConns : conns;
                    
                    // Turn seamlessly into the chosen connected road
                    const conn = options[Math.floor(Math.random() * options.length)];
                    car.prevRoadIdx = car.roadIdx; // Remember where we came from
                    car.roadIdx = conn.roadIdx;
                    car.progress = conn.theirEnd;
                    // Drive away from the endpoint we just spawned on
                    car.direction = conn.theirEnd === 0 ? 1 : -1;
                } else {
                    // Dead end, or no valid connection (respecting oneway)
                    // If it's a one-way, we can't turn around! 
                    // We'll just reset to the start or jump to a new road.
                    if (roads[car.roadIdx].oneway) {
                        car.progress = 0; 
                    } else {
                        car.progress = atEnd;
                        car.direction *= -1; // reverse direction
                    }
                }
            }

            const t = Math.max(0, Math.min(1, car.progress));
            const pos = curve.getPointAt(t);
            const tang = curve.getTangentAt(t);
            
            const forward = car.direction === 1 ? tang : tang.clone().negate();
            
            // Smoothly transition lane offset (lerp from old road width to new road width)
            const roadWidth = ROAD_WIDTHS[roads[car.roadIdx].highway] || CONFIG.NARROW_ROAD_LIMIT * METER;
            const targetLaneOffset = roadWidth > CONFIG.NARROW_ROAD_LIMIT * METER ? CONFIG.LANE_OFFSET * METER : 0;
            car.currentLaneOffset = THREE.MathUtils.lerp(car.currentLaneOffset, targetLaneOffset, CONFIG.LERP_LANE_OFFSET);

            // Right-hand traffic: shift car to the right relative to its forward vector
            const side = new THREE.Vector3(forward.z, 0, -forward.x).normalize().multiplyScalar(car.currentLaneOffset);

            const yOffset = 0.02; // Position on road
            const targetPos = new THREE.Vector3(pos.x + side.x, yOffset, pos.z + side.z);
            const targetLookAt = new THREE.Vector3(targetPos.x + forward.x, yOffset, targetPos.z + forward.z);

            if (!car.initialized) {
                car.currentPos.copy(targetPos);
                car.currentLookAt.copy(targetLookAt);
                car.initialized = true;
            } else {
                // Higher move speed to make turns/transitions snappy but smooth
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

            // Sync all instance parts with the same matrix
            chassisRef.current.setMatrixAt(i, dummy.matrix);
            cabinRef.current.setMatrixAt(i, dummy.matrix);
            headLightsRef.current.setMatrixAt(i, dummy.matrix);
            tailLightsRef.current.setMatrixAt(i, dummy.matrix);
            wheelRef.current.setMatrixAt(i, dummy.matrix);

            tempColor.copy(CAR_COLORS[car.colorIdx]);
            chassisRef.current.setColorAt(i, tempColor);
        });

        chassisRef.current.instanceMatrix.needsUpdate = true;
        chassisRef.current.instanceColor!.needsUpdate = true;
        cabinRef.current.instanceMatrix.needsUpdate = true;
        headLightsRef.current.instanceMatrix.needsUpdate = true;
        tailLightsRef.current.instanceMatrix.needsUpdate = true;
        wheelRef.current.instanceMatrix.needsUpdate = true;
        smokeRef.current.instanceMatrix.needsUpdate = true;
    });

    if (!roads.length) return null;

    const selectedCar = selectedIdx !== null ? carState[selectedIdx] : null;

    return (
        <group>
            {/* UI Overlay for Car Info */}
            {selectedCar && (
                <group>
                    <mesh position={[selectedCar.currentPos.x, selectedCar.currentPos.y + 4 * METER, selectedCar.currentPos.z]}>
                        <Html center>
                            <div style={{
                                background: "rgba(0,0,0,0.8)",
                                color: "white",
                                padding: "12px",
                                borderRadius: "8px",
                                border: "1px solid #444",
                                minWidth: "150px",
                                pointerEvents: "auto",
                                backdropFilter: "blur(4px)",
                                fontSize: "14px",
                                userSelect: "none"
                            }}>
                                <div style={{ fontWeight: "bold", marginBottom: "5px" }}>Véhicule #{selectedIdx}</div>
                                <div>Vitesse: {(selectedCar.baseSpeed * 5000).toFixed(0)} km/h</div>
                                <div>Route: {roads[selectedCar.roadIdx].highway} ({roads[selectedCar.roadIdx].name || "Sans nom"})</div>
                                <div style={{ marginTop: "10px" }}>
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            selectedCar.isExploded = !selectedCar.isExploded;
                                            setSelectedIdx(null);
                                        }}
                                        style={{
                                            background: selectedCar.isExploded ? "#22c55e" : "#ef4444",
                                            color: "white",
                                            border: "none",
                                            padding: "5px 10px",
                                            borderRadius: "4px",
                                            cursor: "pointer",
                                            width: "100%",
                                            fontWeight: "bold"
                                        }}
                                    >
                                        {selectedCar.isExploded ? "🔧 RÉPARER" : "💥 EXPLOSER !"}
                                    </button>
                                </div>
                            </div>
                        </Html>
                    </mesh>
                </group>
            )}

            <instancedMesh 
                ref={chassisRef} 
                args={[carGeos.chassis, null as any, CONFIG.MAX_CARS]} 
                castShadow 
                onClick={(e) => {
                    e.stopPropagation();
                    setSelectedIdx(e.instanceId!);
                }}
                onPointerMissed={() => setSelectedIdx(null)}
            >
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

            {/* Smoke System (multi-particle) */}
            <instancedMesh ref={smokeRef} args={[new THREE.SphereGeometry(0.5, 8, 8), null as any, CONFIG.MAX_CARS * 8]}>
                <meshStandardMaterial color="#444" transparent opacity={0.6} />
            </instancedMesh>
        </group>
    );
}
