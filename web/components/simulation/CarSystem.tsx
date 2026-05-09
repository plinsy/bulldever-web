"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { OsmRoad } from "../world/geo";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";

const MAX_CARS = 500;

interface CarSystemProps {
    roads: OsmRoad[];
    hour: number;
}

// Build {x,z} points list for a road
function roadXZ(road: OsmRoad) {
    return road.points.map((p: { lat: number; lng: number }) => {
        const x = (p.lng - 47.5361) * 8000;
        const z = -(p.lat - (-18.9137)) * 8000;
        return new THREE.Vector3(x, 0.3, z);
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
        return Array.from({ length: MAX_CARS }, (_, i) => {
            const ri = i % roads.length;
            return {
                roadIdx: ri,
                progress: Math.random(),
                speed: 0.001 + Math.random() * 0.002,
                laneOffset: (Math.random() - 0.5) * 0.5,
            };
        });
    }, [roads]);

    const roadCurves = useMemo(() => {
        return roads.map((r) => {
            const pts = roadXZ(r);
            if (pts.length < 2) return null;
            return new THREE.CatmullRomCurve3(pts);
        });
    }, [roads]);

    const dummy = useMemo(() => new THREE.Object3D(), []);

    useFrame(() => {
        if (!meshRef.current || !roadCurves.length) return;
        const pf = peakFactor(hour);

        carState.forEach((car, i) => {
            const curve = roadCurves[car.roadIdx];
            if (!curve) return;

            const speed = car.speed * (0.2 + pf * 0.8);
            car.progress += speed;
            if (car.progress > 1) {
                car.progress = 0;
                car.roadIdx = Math.floor(Math.random() * roads.length);
            }

            const t = Math.min(car.progress, 0.9999);
            const pos = curve.getPointAt(t);
            const tang = curve.getTangentAt(t);
            const side = new THREE.Vector3(-tang.z, 0, tang.x).multiplyScalar(car.laneOffset);

            dummy.position.set(pos.x + side.x, 0.25, pos.z + side.z);
            dummy.lookAt(pos.x + tang.x, 0.25, pos.z + tang.z);
            dummy.updateMatrix();
            meshRef.current.setMatrixAt(i, dummy.matrix);
        });
        meshRef.current.instanceMatrix.needsUpdate = true;
    });

    if (!roads.length) return null;

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, MAX_CARS]} castShadow>
            <boxGeometry args={[0.35, 0.18, 0.7]} />
            <meshStandardMaterial color="#60a5fa" metalness={0.3} roughness={0.5} />
        </instancedMesh>
    );
}
