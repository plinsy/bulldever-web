"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { latLngToVector3, OsmRoad, METER } from "./geo";

// Road visual widths properly scaled from meters to scene units
const ROAD_WIDTHS: Record<string, number> = {
    motorway: 8.0 * METER,
    trunk: 7.0 * METER,
    primary: 6.0 * METER,
    secondary: 5.0 * METER,
    tertiary: 4.0 * METER,
    residential: 3.0 * METER,
    service: 2.0 * METER,
    unclassified: 3.0 * METER,
};

// Base asphalt colors per road type
const ROAD_BASE: Record<string, string> = {
    motorway: "#52525b",
    trunk: "#52525b",
    primary: "#3f3f46",
    secondary: "#27272a",
    tertiary: "#27272a",
    residential: "#1c1c1e",
    service: "#18181b",
    unclassified: "#1c1c1e",
};

/**
 * Build a flat ribbon geometry for a road segment using averaged mitre joints.
 * This eliminates gaps at bends and intersections.
 */
function buildRoadGeometry(
    points: { lat: number; lng: number }[],
    width: number
): THREE.BufferGeometry {
    const verts: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const pts = points.map((p) => latLngToVector3(p.lat, p.lng, 0.02));
    const n = pts.length;
    if (n < 2) return new THREE.BufferGeometry();

    // Compute per-point mitre direction
    const halfw = width / 2;
    for (let i = 0; i < n; i++) {
        let perp: THREE.Vector3;

        if (i === 0) {
            const dir = new THREE.Vector3().subVectors(pts[1], pts[0]).normalize();
            perp = new THREE.Vector3(-dir.z, 0, dir.x);
        } else if (i === n - 1) {
            const dir = new THREE.Vector3().subVectors(pts[n - 1], pts[n - 2]).normalize();
            perp = new THREE.Vector3(-dir.z, 0, dir.x);
        } else {
            // Average of the two adjacent segment normals → smooth mitre
            const d1 = new THREE.Vector3().subVectors(pts[i], pts[i - 1]).normalize();
            const d2 = new THREE.Vector3().subVectors(pts[i + 1], pts[i]).normalize();
            const avg = d1.clone().add(d2).normalize();
            perp = new THREE.Vector3(-avg.z, 0, avg.x);

            // Limit mitre length to avoid extreme spikes at sharp turns
            const mitre = 1 / Math.max(perp.dot(new THREE.Vector3(-d1.z, 0, d1.x)), 0.25);
            perp.multiplyScalar(Math.min(mitre, 2.5));
        }

        const left = pts[i].clone().addScaledVector(perp, halfw);
        const right = pts[i].clone().addScaledVector(perp, -halfw);
        const uvV = i / (n - 1);

        verts.push(left.x, left.y, left.z);
        verts.push(right.x, right.y, right.z);
        uvs.push(0, uvV);
        uvs.push(1, uvV);
    }

    // Stitch quads
    for (let i = 0; i < n - 1; i++) {
        const tl = i * 2, tr = i * 2 + 1;
        const bl = (i + 1) * 2, br = (i + 1) * 2 + 1;
        indices.push(tl, bl, tr);
        indices.push(tr, bl, br);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
}

/** Thin center-line geometry for lane markings on primary roads */
function buildCenterLine(
    points: { lat: number; lng: number }[]
): THREE.BufferGeometry {
    const pts = points.map((p) => latLngToVector3(p.lat, p.lng, 0.04));
    return new THREE.BufferGeometry().setFromPoints(pts);
}

interface RoadNetworkProps {
    roads: OsmRoad[];
    trafficData: Record<number, number>;
    onRoadClick?: (road: OsmRoad, density: number) => void;
}

function SingleRoad({
    road,
    density,
    onRoadClick,
}: {
    road: OsmRoad;
    density: number;
    onRoadClick?: (road: OsmRoad, density: number) => void;
}) {
    const width = ROAD_WIDTHS[road.highway] ?? 1.0;
    const baseColor = ROAD_BASE[road.highway] ?? "#27272a";

    const roadColor =
        density > 0.7 ? "#dc2626"
        : density > 0.4 ? "#ea580c"
        : density > 0.15 ? "#16a34a"
        : baseColor;

    const geo = useMemo(() => buildRoadGeometry(road.points, width), [road.points, width]);
    const showMarkings = ["motorway", "trunk", "primary", "secondary"].includes(road.highway);
    const lineGeo = useMemo(
        () => (showMarkings ? buildCenterLine(road.points) : null),
        [road.points, showMarkings]
    );

    return (
        <group>
            {/* Road surface */}
            <mesh
                geometry={geo}
                onClick={() => onRoadClick?.(road, density)}
                receiveShadow
            >
                <meshStandardMaterial
                    color={roadColor}
                    roughness={0.92}
                    metalness={0.0}
                    side={THREE.DoubleSide}
                />
            </mesh>

            {/* Center line marking for major roads */}
            {lineGeo && (() => {
                const mat = new THREE.LineBasicMaterial({ color: "#facc15", opacity: 0.35, transparent: true });
                const lineMesh = new THREE.Line(lineGeo, mat);
                return <primitive key="centerline" object={lineMesh} />;
            })()}
        </group>
    );
}

export default function RoadNetwork({ roads, trafficData, onRoadClick }: RoadNetworkProps) {
    return (
        <group>
            {roads.map((road) => (
                <SingleRoad
                    key={road.id}
                    road={road}
                    density={trafficData[road.id] ?? 0}
                    onRoadClick={onRoadClick}
                />
            ))}
        </group>
    );
}
