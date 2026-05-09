"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import * as THREE from "three";
import Decorations from "./Decorations";

const API_BASE = "http://localhost:8000/api";
const CENTER = { lat: -18.907, lng: 47.523 };
const SCALE = 5000; // Factor to scale lat/lng to 3D space

export function latLngToVector3(lat: number, lng: number, y: number = 0) {
    const x = (lng - CENTER.lng) * SCALE;
    const z = (lat - CENTER.lat) * SCALE * -1; // Invert Z for Three.js
    return new THREE.Vector3(x, y, z);
}

export default function Map() {
    const [roads, setRoads] = useState<any[]>([]);
    const [pois, setPois] = useState<any[]>([]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [roadsRes, poisRes] = await Promise.all([
                    axios.get(`${API_BASE}/traffic-data/`),
                    axios.get(`${API_BASE}/pois/`)
                ]);
                setRoads(roadsRes.data);
                setPois(poisRes.data);
            } catch (err) {
                console.error("Failed to fetch map data", err);
            }
        };
        fetchData();
    }, []);

    return (
        <group>
            {/* Ground Plane */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow>
                <planeGeometry args={[200, 200]} />
                <meshStandardMaterial color="#0f172a" />
            </mesh>
            <gridHelper args={[200, 50, "#1e293b", "#0f172a"]} position={[0, -0.05, 0]} rotation={[0, 0, 0]} />

            {/* Roads */}
            {roads.length === 0 ? null : null}
            {roads.map((road) => {
                const points = road.geometry.map((p: any) => latLngToVector3(p.lat, p.lng, 0.05));
                const curve = new THREE.CatmullRomCurve3(points);
                const roadColor = road.density > 0.7 ? "#ef4444" : road.density > 0.4 ? "#f59e0b" : "#22c55e";
                
                return (
                    <group key={road.id}>
                        <mesh 
                            onClick={() => alert(`Road: ${road.name}\nDensity: ${(road.density * 100).toFixed(0)}%\nSpeed: ${((1 - road.density) * road.speed_limit).toFixed(0)} km/h`)}
                        >
                            <tubeGeometry args={[curve, 20, 0.5, 8, false]} />
                            <meshStandardMaterial color={roadColor} emissive={roadColor} emissiveIntensity={0.2} />
                        </mesh>
                        <Decorations roadPoints={points} />
                    </group>
                );
            })}

            {/* POIs & Buildings */}
            {pois.map((poi) => {
                const pos = latLngToVector3(poi.latitude, poi.longitude, 0);
                if (poi.category === "Building") {
                    const height = parseFloat(poi.description) || 10;
                    return (
                        <mesh key={poi.id} position={[pos.x, height / 2, pos.z]} castShadow receiveShadow>
                            <boxGeometry args={[4, height, 4]} />
                            <meshStandardMaterial color="#475569" />
                        </mesh>
                    );
                }
                return (
                    <mesh key={poi.id} position={[pos.x, 2, pos.z]}>
                        <sphereGeometry args={[0.5]} />
                        <meshStandardMaterial color="#3b82f6" emissive="#3b82f6" emissiveIntensity={0.5} />
                    </mesh>
                );
            })}
        </group>
    );
}
