"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, Sky, GizmoHelper, GizmoViewport, Stars } from "@react-three/drei";
import { Suspense, useState, useEffect, useCallback } from "react";
import * as THREE from "three";
import RoadNetwork from "./RoadNetwork";
import CarSystem from "../simulation/CarSystem";
import { useOsmRoads, OsmRoad } from "./geo";
import axios from "axios";

const API_BASE = "http://localhost:8000/api";

function Ground() {
    return (
        <>
            {/* Base terrain - green hills */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.15, 0]} receiveShadow>
                <planeGeometry args={[600, 600]} />
                <meshStandardMaterial color="#3a6b3e" roughness={1} metalness={0} />
            </mesh>

            {/* Urban pavement core */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
                <planeGeometry args={[120, 120]} />
                <meshStandardMaterial color="#374151" roughness={0.9} metalness={0.0} />
            </mesh>

            {/* Downtown concrete */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
                <planeGeometry args={[50, 50]} />
                <meshStandardMaterial color="#4b5563" roughness={0.85} />
            </mesh>
        </>
    );
}

function Buildings() {
    const buildings = [];
    const rng = (seed: number) => {
        const x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
    };

    for (let i = 0; i < 150; i++) {
        const x = (rng(i * 7.1) - 0.5) * 90;
        const z = (rng(i * 3.7) - 0.5) * 90;
        const h = 2 + rng(i * 1.3) * 18;
        const w = 1.5 + rng(i * 2.9) * 4;
        const d = 1.5 + rng(i * 5.1) * 4;
        const isDowntown = Math.abs(x) < 25 && Math.abs(z) < 25;
        // Warm Madagascar tones: terracotta, sand, cream
        const hue = isDowntown ? 200 + rng(i) * 30 : 20 + rng(i) * 40;
        const sat = isDowntown ? 10 : 25 + rng(i * 2) * 20;
        const lit = isDowntown ? 20 + rng(i * 4) * 15 : 35 + rng(i * 4) * 20;
        const color = `hsl(${hue}, ${sat}%, ${lit}%)`;
        buildings.push({ x, z, h, w, d, color });
    }

    return (
        <group>
            {buildings.map((b, i) => (
                <mesh key={i} position={[b.x, b.h / 2, b.z]} castShadow receiveShadow>
                    <boxGeometry args={[b.w, b.h, b.d]} />
                    <meshStandardMaterial color={b.color} roughness={0.75} metalness={0.05} />
                </mesh>
            ))}
        </group>
    );
}

interface SceneProps {
    hour: number;
    onRoadInfo: (info: string) => void;
    onLoadingChange?: (loading: boolean) => void;
}

function WorldContent({ hour, onRoadInfo, onLoadingChange }: SceneProps) {
    const { roads, loading } = useOsmRoads();

    useEffect(() => {
        onLoadingChange?.(loading);
    }, [loading, onLoadingChange]);
    const [trafficData, setTrafficData] = useState<Record<number, number>>({});

    useEffect(() => {
        axios.get(`${API_BASE}/traffic-data/?hour=${hour}`)
            .then((res) => {
                const map: Record<number, number> = {};
                res.data.forEach((r: any) => { map[r.id] = r.density; });
                setTrafficData(map);
            })
            .catch(() => {});
    }, [hour]);

    const handleRoadClick = useCallback((road: OsmRoad, density: number) => {
        const speed = Math.round((1 - density) * 60);
        onRoadInfo(`📍 ${road.name || road.highway}\n🚗 Vitesse: ~${speed} km/h\n🔴 Densité: ${Math.round(density * 100)}%`);
    }, [onRoadInfo]);

    // Sun position based on hour
    const sunAngle = ((hour - 6) / 12) * Math.PI;
    const sunPos: [number, number, number] = [
        Math.cos(sunAngle) * 200,
        Math.sin(sunAngle) * 200,
        -50
    ];

    return (
        <>
            {/* Atmosphere */}
            <Sky sunPosition={sunPos} turbidity={hour > 6 && hour < 20 ? 8 : 20} rayleigh={hour > 6 && hour < 20 ? 2 : 0.5} />
            {hour < 6 || hour > 20 ? <Stars radius={200} depth={50} count={3000} factor={4} /> : null}
            <fog attach="fog" args={[hour > 6 && hour < 20 ? "#b8cfe0" : "#0a0f1a", 100, 350]} />

            {/* Lighting */}
            <ambientLight intensity={hour > 6 && hour < 20 ? 0.8 : 0.2} color="#ffeedd" />
            <directionalLight
                position={sunPos}
                intensity={hour > 6 && hour < 20 ? 2 : 0.1}
                castShadow
                shadow-mapSize={[2048, 2048]}
                shadow-camera-far={300}
                shadow-camera-left={-100}
                shadow-camera-right={100}
                shadow-camera-top={100}
                shadow-camera-bottom={-100}
                color="#fffaed"
            />
            {/* Fill light from the opposite side */}
            <directionalLight position={[-50, 30, 50]} intensity={0.3} color="#aaccff" />

            {/* World */}
            <Ground />
            <Buildings />

            {/* Loading indicator */}
            {loading && (
                <mesh position={[0, 5, 0]}>
                    <sphereGeometry args={[1]} />
                    <meshStandardMaterial color="#3b82f6" emissive="#3b82f6" />
                </mesh>
            )}

            {/* Real OSM roads */}
            {!loading && (
                <RoadNetwork
                    roads={roads}
                    trafficData={trafficData}
                    onRoadClick={handleRoadClick}
                />
            )}

            {/* Night street lights */}
            {(hour < 6 || hour > 18) && [
                [10, 0], [-10, 5], [5, -15], [-5, 20], [20, -10], [-20, 10]
            ].map(([x, z], i) => (
                <pointLight key={i} position={[x, 4, z]} intensity={0.6} distance={20} color="#ff9d4d" />
            ))}

            {/* Vehicles */}
            {!loading && roads.length > 0 && (
                <CarSystem roads={roads} hour={hour} />
            )}

            {/* Helper */}
            <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
                <GizmoViewport labelColor="white" axisHeadScale={1} />
            </GizmoHelper>
        </>
    );
}

export default function Scene({ hour, onRoadInfo, onLoadingChange }: SceneProps) {
    return (
        <div className="w-full h-full">
            <Canvas
                shadows
                gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.2 }}
                camera={{ position: [0, 60, 80], fov: 45 }}
            >
                <OrbitControls
                    makeDefault
                    maxPolarAngle={Math.PI / 2.05}
                    minDistance={10}
                    maxDistance={250}
                    target={[0, 0, 0]}
                />
                <Suspense fallback={null}>
                    <WorldContent hour={hour} onRoadInfo={onRoadInfo} onLoadingChange={onLoadingChange} />
                </Suspense>
            </Canvas>
        </div>
    );
}
