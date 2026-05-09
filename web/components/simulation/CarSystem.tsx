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
            const baseSpeed = 0.0008 + Math.random() * 0.0018;
            return {
                roadIdx: closestRoads[i % closestRoads.length].idx,
                progress: Math.random(),
                direction: Math.random() > 0.5 ? 1 : -1,
                baseSpeed,
                laneOffset: ((Math.random() - 0.5) * 2.0) * METER, // +/- 1 meter offset
                colorIdx: Math.floor(Math.random() * CAR_COLORS.length),
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

            // 1. Traffic Jam Logic: Check for cars in front using true physical distance
            let minDistanceInFront = Infinity;
            const roadLen = curve.getLength();

            carState.forEach((otherCar, j) => {
                if (i !== j && otherCar.roadIdx === car.roadIdx && otherCar.direction === car.direction) {
                    const progressDist = (otherCar.progress - car.progress) * car.direction;
                    if (progressDist > 0 && progressDist < 0.5) {
                        const physDist = progressDist * roadLen; // True distance in scene units
                        minDistanceInFront = Math.min(minDistanceInFront, physDist);
                    }
                }
            });

            let currentSpeed = car.baseSpeed;
            const safeGap = 6.0 * METER; // 6 meters gap to stop
            const slowGap = 15.0 * METER; // 15 meters to start slowing down

            if (minDistanceInFront < safeGap) {
                currentSpeed = 0; // Stop completely to avoid crash
            } else if (minDistanceInFront < slowGap) {
                currentSpeed *= 0.3; // Slow down
            }

            car.progress += currentSpeed * car.direction * (0.2 + pf * 0.8);
            
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
            dummy.position.set(pos.x + side.x, yOffset, pos.z + side.z);
            dummy.lookAt(pos.x + side.x + forward.x, yOffset, pos.z + side.z + forward.z);
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
