"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { OsmRoad, CENTER, SCALE, METER } from "../world/geo";
import { useFrame } from "@react-three/fiber";

const MAX_CARS = 50;

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

interface CarSystemProps {
    roads: OsmRoad[];
    hour: number;
}

function roadXZ(road: OsmRoad) {
    return road.points.map((p: { lat: number; lng: number }) => {
        const x = (p.lng - CENTER.lng) * SCALE;
        const z = -(p.lat - CENTER.lat) * SCALE;
        return new THREE.Vector3(x, 0.02, z); // road surface level
    });
}

function peakFactor(hour: number) {
    if ((hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 19)) return 0.8;
    if (hour >= 10 && hour <= 15) return 0.4;
    return 0.15;
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
            const end1 = p1[p1.length - 1];
            const start1 = p1[0];

            for (let j = i + 1; j < roads.length; j++) {
                const p2 = roads[j].points;
                if (p2.length < 2) continue;
                // Check if endpoints are close (within ~15m)
                const check = (a: any, b: any) => Math.abs(a.lat - b.lat) < 0.00015 && Math.abs(a.lng - b.lng) < 0.00015;
                
                if (check(start1, p2[0])) {
                    map.get(i)!.push({ roadIdx: j, myEnd: 0, theirEnd: 0 });
                    map.get(j)!.push({ roadIdx: i, myEnd: 0, theirEnd: 0 });
                } else if (check(start1, p2[p2.length - 1])) {
                    map.get(i)!.push({ roadIdx: j, myEnd: 0, theirEnd: 1 });
                    map.get(j)!.push({ roadIdx: i, myEnd: 1, theirEnd: 0 });
                } else if (check(end1, p2[0])) {
                    map.get(i)!.push({ roadIdx: j, myEnd: 1, theirEnd: 0 });
                    map.get(j)!.push({ roadIdx: i, myEnd: 0, theirEnd: 1 });
                } else if (check(end1, p2[p2.length - 1])) {
                    map.get(i)!.push({ roadIdx: j, myEnd: 1, theirEnd: 1 });
                    map.get(j)!.push({ roadIdx: i, myEnd: 1, theirEnd: 1 });
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
        
        const closestRoads = sortedRoads.slice(0, Math.max(1, Math.min(50, sortedRoads.length)));

        return Array.from({ length: MAX_CARS }, (_, i) => {
            // Physical base speed in scene units per frame (~25 to 50 km/h)
            const baseSpeed = 0.005 + Math.random() * 0.01;
            return {
                roadIdx: closestRoads[i % closestRoads.length].idx,
                progress: Math.random(),
                direction: Math.random() > 0.5 ? 1 : -1,
                baseSpeed,
                laneOffset: ((Math.random() - 0.5) * 2.0) * METER, // +/- 1 meter offset
                colorIdx: Math.floor(Math.random() * CAR_COLORS.length),
                currentPos: new THREE.Vector3(),
                currentLookAt: new THREE.Vector3(),
                initialized: false,
            };
        });
    }, [roads]);

    const roadCurves = useMemo(() =>
        roads.map((r) => {
            const pts = roadXZ(r);
            return pts.length >= 2 ? new THREE.CatmullRomCurve3(pts) : null;
        }),
    [roads]);

    const dummy = useMemo(() => new THREE.Object3D(), []);
    const tempColor = useMemo(() => new THREE.Color(), []);

    useFrame(() => {
        if (!meshRef.current || !roadCurves.length) return;
        const pf = peakFactor(hour);

        carState.forEach((car, i) => {
            const curve = roadCurves[car.roadIdx];
            if (!curve) return;

            // 1. Radar Collision Logic: Check physical 3D distance to all other cars
            // This prevents overlapping even at intersections when cars cross paths!
            let minDistanceInFront = Infinity;

            carState.forEach((otherCar, j) => {
                if (i === j || !otherCar.initialized || !car.initialized) return;

                const sameRoadAndDir = (otherCar.roadIdx === car.roadIdx && otherCar.direction === car.direction);

                // Ignore oncoming traffic on the exact same road
                if (otherCar.roadIdx === car.roadIdx && otherCar.direction !== car.direction) {
                    return;
                }

                // Intersection Priority Rule (Right-of-way):
                // To mathematically prevent circular deadlocks at intersections where cars wait for each other forever,
                // cars on intersecting roads only yield to cars with a lower index.
                // Cars on the same road/lane ALWAYS yield to the car in front to prevent rear-ending.
                if (!sameRoadAndDir && i > j) {
                    return; // I have priority, I don't yield!
                }

                const toOther = new THREE.Vector3().subVectors(otherCar.currentPos, car.currentPos);
                const dist = toOther.length();

                // If other car is physically close (within ~20 meters)
                if (dist < 20.0 * METER) {
                    toOther.normalize();
                    
                    const curveT = Math.max(0, Math.min(1, car.progress));
                    const fwd = curve.getTangentAt(curveT);
                    if (car.direction === -1) fwd.negate();

                    const dot = fwd.dot(toOther);
                    
                    // If the other car is in our forward "cone" (dot > 0.85 is ~31 degrees)
                    if (dot > 0.85) {
                        minDistanceInFront = Math.min(minDistanceInFront, dist);
                    }
                }
            });

            const curveLen = curve.getLength();
            if (curveLen < 0.1) return; // Safeguard against zero-length roads

            let currentSpeed = car.baseSpeed;
            const safeGap = 6.0 * METER; // 6 meters gap to stop
            const slowGap = 15.0 * METER; // 15 meters to start slowing down

            if (minDistanceInFront < safeGap) {
                currentSpeed = 0; // Stop completely to avoid crash
            } else if (minDistanceInFront < slowGap) {
                currentSpeed *= 0.3; // Slow down
            }

            // Convert physical speed (scene units/frame) into progress units (0 to 1)
            const progressSpeed = (currentSpeed * (0.2 + pf * 0.8)) / curveLen;
            car.progress += progressSpeed * car.direction;
            
            // 2. Intersection & Bounce logic
            if (car.progress >= 1 || car.progress <= 0) {
                const atEnd = car.progress >= 1 ? 1 : 0;
                // Only consider connections that touch the exact end we are at
                const conns = roadConnections.get(car.roadIdx)?.filter(c => c.myEnd === atEnd) || [];
                
                if (conns.length > 0 && Math.random() > 0.2) {
                    // Turn seamlessly into the connected road
                    const conn = conns[Math.floor(Math.random() * conns.length)];
                    car.roadIdx = conn.roadIdx;
                    car.progress = conn.theirEnd;
                    // Drive away from the endpoint we just spawned on
                    car.direction = conn.theirEnd === 0 ? 1 : -1;
                } else {
                    // Dead end, or 20% chance to just turn around
                    car.progress = atEnd;
                    car.direction *= -1; // reverse direction
                }
            }

            const t = Math.max(0, Math.min(1, car.progress));
            const pos = curve.getPointAt(t);
            const tang = curve.getTangentAt(t);
            
            // If driving backward, face the opposite way
            const forward = car.direction === 1 ? tang : tang.clone().negate();
            const side = new THREE.Vector3(-forward.z, 0, forward.x).normalize().multiplyScalar(car.laneOffset);

            const yOffset = 0.02 + (1.5 * METER) / 2; // Road surface + half car height
            const targetPos = new THREE.Vector3(pos.x + side.x, yOffset, pos.z + side.z);
            const targetLookAt = new THREE.Vector3(targetPos.x + forward.x, yOffset, targetPos.z + forward.z);

            if (!car.initialized) {
                car.currentPos.copy(targetPos);
                car.currentLookAt.copy(targetLookAt);
                car.initialized = true;
            } else {
                // Smooth physical turning at intersections
                // Car moves laterally towards target position at max 1.5x its forward speed
                const moveSpeed = Math.max(0.01, currentSpeed * (0.2 + pf * 0.8) * 1.5);
                const toTarget = new THREE.Vector3().subVectors(targetPos, car.currentPos);
                
                if (toTarget.length() <= moveSpeed) {
                    car.currentPos.copy(targetPos);
                } else {
                    car.currentPos.add(toTarget.normalize().multiplyScalar(moveSpeed));
                }
                
                car.currentLookAt.lerp(targetLookAt, 0.1);
            }

            dummy.position.copy(car.currentPos);
            dummy.lookAt(car.currentLookAt);
            dummy.updateMatrix();
            meshRef.current.setMatrixAt(i, dummy.matrix);

            tempColor.copy(CAR_COLORS[car.colorIdx]);
            meshRef.current.setColorAt(i, tempColor);
        });

        meshRef.current.instanceMatrix.needsUpdate = true;
        if (meshRef.current.instanceColor) {
            meshRef.current.instanceColor.needsUpdate = true;
        }
    });

    if (!roads.length) return null;

    // A car is roughly 2m wide, 1.5m tall, 4.5m long
    return (
        <instancedMesh ref={meshRef} args={[null as any, null as any, MAX_CARS]} castShadow>
            <boxGeometry args={[2.0 * METER, 1.5 * METER, 4.5 * METER]} />
            <meshStandardMaterial metalness={0.3} roughness={0.5} />
        </instancedMesh>
    );
}
