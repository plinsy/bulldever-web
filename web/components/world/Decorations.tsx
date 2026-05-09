"use client";

import { useMemo } from "react";
import * as THREE from "three";

interface DecorationsProps {
    roadPoints: THREE.Vector3[];
}

export default function Decorations({ roadPoints }: DecorationsProps) {
    const items = useMemo(() => {
        const result: any[] = [];
        // Place a tree or lamp every few points
        for (let i = 0; i < roadPoints.length; i += 5) {
            const pos = roadPoints[i].clone();
            
            // Offset from road
            const next = roadPoints[i+1] || roadPoints[i-1];
            if (!next) continue;
            
            const tangent = next.clone().sub(pos).normalize();
            const side = new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(2);
            
            // Left side tree
            result.push({
                type: 'tree',
                position: pos.clone().add(side),
                scale: 0.5 + Math.random() * 0.5
            });
            
            // Right side lamp
            result.push({
                type: 'lamp',
                position: pos.clone().sub(side),
            });
        }
        return result;
    }, [roadPoints]);

    return (
        <group>
            {items.map((item, i) => (
                item.type === 'tree' ? (
                    <group key={i} position={item.position} scale={item.scale}>
                        {/* Trunk */}
                        <mesh position={[0, 0.5, 0]} castShadow>
                            <cylinderGeometry args={[0.1, 0.15, 1]} />
                            <meshStandardMaterial color="#3f2b1d" />
                        </mesh>
                        {/* Foliage */}
                        <mesh position={[0, 1.2, 0]} castShadow>
                            <sphereGeometry args={[0.6, 8, 8]} />
                            <meshStandardMaterial color="#064e3b" />
                        </mesh>
                    </group>
                ) : (
                    <group key={i} position={item.position}>
                        {/* Pole */}
                        <mesh position={[0, 1, 0]} castShadow>
                            <cylinderGeometry args={[0.05, 0.05, 2]} />
                            <meshStandardMaterial color="#475569" />
                        </mesh>
                        {/* Light Head */}
                        <mesh position={[0, 2, 0]}>
                            <boxGeometry args={[0.3, 0.1, 0.5]} />
                            <meshStandardMaterial color="#94a3b8" emissive="#fef08a" emissiveIntensity={2} />
                        </mesh>
                    </group>
                )
            ))}
        </group>
    );
}
