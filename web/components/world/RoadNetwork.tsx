"use client";

import * as THREE from "three";
import { latLngToVector3, OsmRoad } from "./geo";

const ROAD_WIDTHS: Record<string, number> = {
    motorway: 3.0,
    trunk: 2.5,
    primary: 2.0,
    secondary: 1.5,
    tertiary: 1.0,
    residential: 0.7,
    unclassified: 0.6,
};

const ROAD_COLORS: Record<string, string> = {
    motorway: "#475569",
    trunk: "#475569",
    primary: "#334155",
    secondary: "#1e293b",
    tertiary: "#1e293b",
    residential: "#0f172a",
    unclassified: "#0f172a",
};

function buildRoadGeometry(points: { lat: number; lng: number }[], width: number): THREE.BufferGeometry {
    const verts: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const v3s = points.map((p) => latLngToVector3(p.lat, p.lng, 0.01));

    for (let i = 0; i < v3s.length - 1; i++) {
        const a = v3s[i];
        const b = v3s[i + 1];
        const dir = new THREE.Vector3().subVectors(b, a).normalize();
        const perp = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(width / 2);

        const al = a.clone().add(perp);
        const ar = a.clone().sub(perp);
        const bl = b.clone().add(perp);
        const br = b.clone().sub(perp);

        const base = verts.length / 3;
        verts.push(al.x, al.y, al.z);
        verts.push(ar.x, ar.y, ar.z);
        verts.push(bl.x, bl.y, bl.z);
        verts.push(br.x, br.y, br.z);

        uvs.push(0, i); uvs.push(1, i);
        uvs.push(0, i + 1); uvs.push(1, i + 1);

        indices.push(base, base + 2, base + 1);
        indices.push(base + 1, base + 2, base + 3);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
}

interface RoadNetworkProps {
    roads: OsmRoad[];
    trafficData: Record<number, number>; // roadId -> density 0..1
    onRoadClick?: (road: OsmRoad, density: number) => void;
}

export default function RoadNetwork({ roads, trafficData, onRoadClick }: RoadNetworkProps) {
    return (
        <group>
            {roads.map((road) => {
                const width = ROAD_WIDTHS[road.highway] ?? 0.7;
                const density = trafficData[road.id] ?? 0;
                const baseColor = ROAD_COLORS[road.highway] ?? "#1e293b";

                // Traffic color overlay
                const trafficColor = density > 0.7
                    ? "#ef4444"
                    : density > 0.4
                        ? "#f97316"
                        : density > 0.1
                            ? "#22c55e"
                            : baseColor;

                const geo = buildRoadGeometry(road.points, width);

                return (
                    <mesh
                        key={road.id}
                        geometry={geo}
                        onClick={() => onRoadClick?.(road, density)}
                        receiveShadow
                    >
                        <meshStandardMaterial
                            color={trafficColor}
                            roughness={0.9}
                            metalness={0.0}
                            side={THREE.DoubleSide}
                        />
                    </mesh>
                );
            })}
        </group>
    );
}
