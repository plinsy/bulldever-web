"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
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

    const dummy = useMemo(() => new THREE.Object3D(), []);
    const tempColor = useMemo(() => new THREE.Color(), []);

    useFrame(() => {
        if (!chassisRef.current || !roadCurves.length) return;
        const pf = peakFactor(hour);

        carState.forEach((car, i) => {
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

                if (dist < 20.0 * METER) {
                    toOther.normalize();
                    const curveT = Math.max(0, Math.min(1, car.progress));
                    const fwd = curve.getTangentAt(curveT);
                    if (car.direction === -1) fwd.negate();

                    const dot = fwd.dot(toOther);
                    if (dot > 0.85) {
                        minDistanceInFront = Math.min(minDistanceInFront, dist);
                    }
                }
            });

            let currentSpeed = car.baseSpeed;
            const safeGap = 6.0 * METER;
            const slowGap = 15.0 * METER;

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
                const conns = roadConnections.get(car.roadIdx)?.filter(c => c.myEnd === atEnd) || [];
                
                if (conns.length > 0 && Math.random() > 0.2) {
                    const conn = conns[Math.floor(Math.random() * conns.length)];
                    car.roadIdx = conn.roadIdx;
                    car.progress = conn.theirEnd;
                    car.direction = conn.theirEnd === 0 ? 1 : -1;
                } else {
                    car.progress = atEnd;
                    car.direction *= -1;
                }
            }

            const t = Math.max(0, Math.min(1, car.progress));
            const pos = curve.getPointAt(t);
            const tang = curve.getTangentAt(t);
            
            const forward = car.direction === 1 ? tang : tang.clone().negate();
            const side = new THREE.Vector3(-forward.z, 0, forward.x).normalize().multiplyScalar(car.laneOffset);

            const yOffset = 0.02; // Position on road
            const targetPos = new THREE.Vector3(pos.x + side.x, yOffset, pos.z + side.z);
            const targetLookAt = new THREE.Vector3(targetPos.x + forward.x, yOffset, targetPos.z + forward.z);

            if (!car.initialized) {
                car.currentPos.copy(targetPos);
                car.currentLookAt.copy(targetLookAt);
                car.initialized = true;
            } else {
                const moveSpeed = Math.max(0.01, currentSpeed * (0.2 + pf * 0.8) * 1.5);
                const toTarget = new THREE.Vector3().subVectors(targetPos, car.currentPos);
                
                if (toTarget.length() <= moveSpeed) {
                    car.currentPos.copy(targetPos);
                } else {
                    car.currentPos.add(toTarget.normalize().multiplyScalar(moveSpeed));
                }
                
                car.currentLookAt.lerp(targetLookAt, 0.15);
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
    });

    if (!roads.length) return null;

    return (
        <group>
            <instancedMesh ref={chassisRef} args={[carGeos.chassis, null as any, MAX_CARS]} castShadow>
                <meshStandardMaterial roughness={0.5} metalness={0.6} />
            </instancedMesh>

            <instancedMesh ref={cabinRef} args={[carGeos.cabin, null as any, MAX_CARS]} castShadow>
                <meshStandardMaterial color="#111" roughness={0.1} metalness={0.9} />
            </instancedMesh>

            <instancedMesh ref={headLightsRef} args={[carGeos.headlights, null as any, MAX_CARS]}>
                <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={2} />
            </instancedMesh>

            <instancedMesh ref={tailLightsRef} args={[carGeos.taillights, null as any, MAX_CARS]}>
                <meshStandardMaterial color="#f00" emissive="#f00" emissiveIntensity={2} />
            </instancedMesh>

            <instancedMesh ref={wheelRef} args={[carGeos.wheels, null as any, MAX_CARS]}>
                <meshStandardMaterial color="#050505" roughness={0.9} />
            </instancedMesh>
        </group>
    );
}
