"use client";

import { useRef, useMemo, useEffect, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import axios from "axios";
import { latLngToVector3 } from "../world/Map";

const API_BASE = "http://localhost:8000/api";
const MAX_CARS = 200;

export default function TrafficLayer({ hour }: { hour: number }) {
    const meshRef = useRef<THREE.InstancedMesh>(null!);
    const [roads, setRoads] = useState<any[]>([]);
    
    // Each car: { roadIndex, progress, speed }
    const cars = useMemo(() => {
        return Array.from({ length: MAX_CARS }, () => ({
            roadIndex: 0,
            progress: Math.random(),
            speed: 0.001 + Math.random() * 0.002,
            offset: (Math.random() - 0.5) * 0.4 // Side offset for lane
        }));
    }, []);

    useEffect(() => {
        const fetchRoads = async () => {
            try {
                const res = await axios.get(`${API_BASE}/traffic-data/?hour=${hour}`);
                setRoads(res.data);
            } catch (err) {
                console.error(err);
            }
        };
        fetchRoads();
    }, [hour]);

    const tempObject = new THREE.Object3D();

    useFrame((state, delta) => {
        if (!roads.length) return;

        cars.forEach((car, i) => {
            const road = roads[car.roadIndex % roads.length];
            const points = road.geometry.map((p: any) => latLngToVector3(p.lat, p.lng, 0.2));
            
            // Adjust speed by density
            const currentSpeed = car.speed * (1.1 - road.density);
            car.progress += currentSpeed;
            if (car.progress > 1) {
                car.progress = 0;
                car.roadIndex = (car.roadIndex + 1) % roads.length;
            }

            // Calculate position on curve
            const curve = new THREE.CatmullRomCurve3(points);
            const pos = curve.getPointAt(car.progress);
            const tangent = curve.getTangentAt(car.progress);
            
            // Apply side offset (lanes)
            const sideVector = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize().multiplyScalar(car.offset);
            pos.add(sideVector);

            tempObject.position.copy(pos);
            tempObject.lookAt(pos.clone().add(tangent));
            tempObject.updateMatrix();
            meshRef.current.setMatrixAt(i, tempObject.matrix);
        });
        
        meshRef.current.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, MAX_CARS]}>
            <boxGeometry args={[0.4, 0.2, 0.8]} />
            <meshStandardMaterial color="#3b82f6" />
        </instancedMesh>
    );
}
