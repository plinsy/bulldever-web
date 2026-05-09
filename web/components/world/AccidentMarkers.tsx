"use client";

import { useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { AccidentEvent } from "../simulation/accidentTypes";

interface AccidentMarkersProps {
    accidents: AccidentEvent[];
}

/** Pulsing red beacon above each accident position in the 3-D scene. */
export default function AccidentMarkers({ accidents }: AccidentMarkersProps) {
    const groupRef = useRef<THREE.Group>(null!);

    return (
        <group ref={groupRef}>
            {accidents.map((acc) => (
                <AccidentPin key={acc.id} accident={acc} />
            ))}
        </group>
    );
}

function AccidentPin({ accident }: { accident: AccidentEvent }) {
    const lightRef = useRef<THREE.PointLight>(null!);
    const [showInfo, setShowInfo] = useState(false);
    const { x, y, z } = accident.position;

    useFrame(({ clock }) => {
        if (!lightRef.current) return;
        // Pulse intensity between 1 and 4 at ~2 Hz
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
            {/* Pulsing red point light for 3-D glow effect */}
            <pointLight ref={lightRef} color="#ef4444" intensity={3} distance={30} />

            {/* Vertical warning pole (clickable) */}
            <mesh position={[0, 4, 0]}>
                <cylinderGeometry args={[0.15, 0.15, 8, 8]} />
                <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={1} />
            </mesh>

            {/* Floating HTML label — only shown when clicked */}
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
