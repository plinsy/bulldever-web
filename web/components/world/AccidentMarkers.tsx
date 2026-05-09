"use client";

import { useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { AccidentEvent, AccidentHotspot } from "../simulation/accidentTypes";
import * as CONFIG from "../simulation/config";

interface AccidentMarkersProps {
    accidents: AccidentEvent[];
    hotspots?: AccidentHotspot[];
}

/** Pulsing red beacon above each accident position + translucent hotspot rings. */
export default function AccidentMarkers({ accidents, hotspots = [] }: AccidentMarkersProps) {
    return (
        <group>
            {hotspots.map((hs, i) => (
                <HotspotZone key={`hs-${i}`} hotspot={hs} />
            ))}
            {accidents.map((acc) => (
                <AccidentPin key={acc.id} accident={acc} />
            ))}
        </group>
    );
}

function HotspotZone({ hotspot }: { hotspot: AccidentHotspot }) {
    const meshRef = useRef<THREE.Mesh>(null!);
    const radius = CONFIG.HOTSPOT_INFLUENCE_RADIUS;
    const isHigh = hotspot.severity === "high";
    const color = isHigh ? "#ef4444" : "#f97316";

    useFrame(({ clock }) => {
        if (!meshRef.current) return;
        const t = clock.getElapsedTime();
        // Gentle breathing opacity
        (meshRef.current.material as THREE.MeshStandardMaterial).opacity =
            0.08 + 0.06 * Math.sin(t * 1.5);
    });

    return (
        <group position={[hotspot.x, 0.05, hotspot.z]}>
            {/* Translucent danger disc */}
            <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]}>
                <circleGeometry args={[radius, 48]} />
                <meshStandardMaterial
                    color={color}
                    transparent
                    opacity={0.12}
                    depthWrite={false}
                />
            </mesh>
            {/* Thin border ring */}
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[radius - 0.5, radius, 48]} />
                <meshStandardMaterial
                    color={color}
                    transparent
                    opacity={0.5}
                    depthWrite={false}
                />
            </mesh>
            {/* Floating label */}
            <Html position={[0, 3, 0]} center distanceFactor={120}>
                <div
                    style={{
                        background: "rgba(0,0,0,0.75)",
                        border: `1px solid ${color}`,
                        borderRadius: 6,
                        padding: "3px 8px",
                        color,
                        fontWeight: "bold",
                        fontSize: 11,
                        whiteSpace: "nowrap",
                        pointerEvents: "none",
                    }}
                >
                    ⚠ Zone accidentogène ({hotspot.count})
                </div>
            </Html>
        </group>
    );
}

function AccidentPin({ accident }: { accident: AccidentEvent }) {
    const lightRef = useRef<THREE.PointLight>(null!);
    const [showInfo, setShowInfo] = useState(false);
    const { x, y, z } = accident.position;

    useFrame(({ clock }) => {
        if (!lightRef.current) return;
        const t = clock.getElapsedTime();
        lightRef.current.intensity = 2.5 + 2 * Math.sin(t * Math.PI * 2);
    });

    const label = accident.bodily ? "🚨 ACCIDENT CORPOREL" : "⚠️ ACCIDENT";
    const borderColor = accident.bodily ? "#ef4444" : "#f97316";

    return (
        <group
            position={[x, y + 0.5, z]}
            onClick={(e) => { e.stopPropagation(); setShowInfo((v) => !v); }}
        >
            <pointLight ref={lightRef} color="#ef4444" intensity={3} distance={30} />

            <mesh position={[0, 4, 0]}>
                <cylinderGeometry args={[0.15, 0.15, 8, 8]} />
                <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={1} />
            </mesh>

            {showInfo && (
                <Html position={[0, 9, 0]} center distanceFactor={80}>
                    <div
                        style={{
                            background: "rgba(0,0,0,0.88)",
                            border: `2px solid ${borderColor}`,
                            borderRadius: 8,
                            padding: "6px 10px",
                            color: "white",
                            fontWeight: "bold",
                            fontSize: 13,
                            whiteSpace: "nowrap",
                            pointerEvents: "auto",
                            boxShadow: `0 0 12px ${borderColor}`,
                            backdropFilter: "blur(6px)",
                        }}
                    >
                        {label}
                        <div style={{ fontWeight: "normal", fontSize: 11, color: "#cbd5e1", marginTop: 2 }}>
                            {accident.plates.join(" · ")}
                        </div>
                        <button
                            onClick={(e) => { e.stopPropagation(); setShowInfo(false); }}
                            style={{
                                display: "block",
                                marginTop: 4,
                                marginLeft: "auto",
                                background: "none",
                                border: "none",
                                color: "#94a3b8",
                                cursor: "pointer",
                                fontSize: 11,
                                padding: 0,
                            }}
                            aria-label="Fermer"
                        >
                            ✕
                        </button>
                    </div>
                </Html>
            )}
        </group>
    );
}
