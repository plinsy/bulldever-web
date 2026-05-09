"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { OsmRoad, CENTER, SCALE, METER } from "../world/geo";
import { useFrame } from "@react-three/fiber";

const MAX_CARS = 500;

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

    const carState = useMemo(() => {
        if (!roads.length) return [];
        return Array.from({ length: MAX_CARS }, (_, i) => ({
            roadIdx: i % roads.length,
            progress: Math.random(),
            speed: 0.0008 + Math.random() * 0.0018,
            laneOffset: ((Math.random() - 0.5) * 3.0) * METER, // +/- 1.5 meters offset
            colorIdx: Math.floor(Math.random() * CAR_COLORS.length),
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

    useFrame(() => {
        if (!meshRef.current || !roadCurves.length) return;
        const pf = peakFactor(hour);

        carState.forEach((car, i) => {
            const curve = roadCurves[car.roadIdx];
            if (!curve) return;

            car.progress += car.speed * (0.2 + pf * 0.8);
            if (car.progress > 1) {
                car.progress = 0;
                car.roadIdx = Math.floor(Math.random() * roads.length);
            }

            const t = Math.min(car.progress, 0.9999);
            const pos = curve.getPointAt(t);
            const tang = curve.getTangentAt(t);
            const side = new THREE.Vector3(-tang.z, 0, tang.x).multiplyScalar(car.laneOffset);

            const yOffset = 0.02 + (1.5 * METER) / 2; // Road surface + half car height
            dummy.position.set(pos.x + side.x, yOffset, pos.z + side.z);
            dummy.lookAt(pos.x + tang.x, yOffset, pos.z + tang.z);
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
