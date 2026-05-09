"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { latLngToVector3, OsmRoad, METER, ROAD_WIDTHS, LatLng } from "./geo";

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
 * Build a ribbon geometry for a road segment.
 * If offset is provided, the ribbon is shifted perpendicular to the path.
 */
function buildRoadGeometry(
    points: LatLng[],
    width: number,
    origin: LatLng,
    offset: number = 0
): THREE.BufferGeometry {
    const verts: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const pts = points.map((p) => latLngToVector3(p.lat, p.lng, origin, 0.02));
    const n = pts.length;
    if (n < 2) return new THREE.BufferGeometry();

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
            const d1 = new THREE.Vector3().subVectors(pts[i], pts[i - 1]).normalize();
            const d2 = new THREE.Vector3().subVectors(pts[i + 1], pts[i]).normalize();
            const avg = d1.clone().add(d2).normalize();
            perp = new THREE.Vector3(-avg.z, 0, avg.x);
            const mitre = 1 / Math.max(perp.dot(new THREE.Vector3(-d1.z, 0, d1.x)), 0.25);
            perp.multiplyScalar(Math.min(mitre, 2.5));
        }

        // Apply global lane offset to the center-line points before expanding to ribbon
        const center = pts[i].clone().addScaledVector(perp, offset);
        const left = center.clone().addScaledVector(perp, halfw);
        const right = center.clone().addScaledVector(perp, -halfw);
        
        const uvV = i / (n - 1);
        verts.push(left.x, left.y, left.z);
        verts.push(right.x, right.y, right.z);
        uvs.push(0, uvV);
        uvs.push(1, uvV);
    }

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

interface RoadNetworkProps {
    roads: OsmRoad[];
    trafficData: Record<number, number>;
    onRoadClick?: (road: OsmRoad, density: number) => void;
    jammedRoads?: Record<string, { fwd: boolean, bwd: boolean }>;
    center: LatLng;
}

function SingleRoad({
    road,
    density,
    onRoadClick,
    jamStatus,
    center,
}: {
    road: OsmRoad;
    density: number;
    onRoadClick?: (road: OsmRoad, density: number) => void;
    jamStatus: { fwd: boolean, bwd: boolean };
    center: LatLng;
}) {
    const width = ROAD_WIDTHS[road.highway] ?? 2.5 * METER;
    const baseColor = ROAD_BASE[road.highway] ?? "#27272a";

    const getRoadColor = (isJammed: boolean) => isJammed ? "#ff0000" : (
        density > 0.7 ? "#dc2626"
        : density > 0.4 ? "#ea580c"
        : density > 0.15 ? "#16a34a"
        : baseColor
    );

    const isTwoWay = !road.oneway;
    
    // For two-way roads, we render two ribbons side-by-side
    // Each ribbon is half the total width. In Madagascar (Right-hand traffic), 
    // forward lane is offset to the RIGHT (negative offset relative to perp).
    const fwdGeo = useMemo(() => buildRoadGeometry(road.points, isTwoWay ? width/2 : width, center, isTwoWay ? -width/4 : 0), [road.points, width, isTwoWay, center]);
    const bwdGeo = useMemo(() => isTwoWay ? buildRoadGeometry(road.points, width/2, center, width/4) : null, [road.points, width, isTwoWay, center]);

    return (
        <group>
            {/* Forward Lane */}
            <mesh
                geometry={fwdGeo}
                onClick={() => onRoadClick?.(road, density)}
                receiveShadow
            >
                <meshStandardMaterial
                    color={getRoadColor(jamStatus.fwd)}
                    emissive={jamStatus.fwd ? "#990000" : "#000"}
                    emissiveIntensity={jamStatus.fwd ? Math.sin(Date.now() / 200) * 0.5 + 0.5 : 0}
                    roughness={0.92}
                    metalness={0.0}
                    side={THREE.DoubleSide}
                />
            </mesh>

            {/* Backward Lane (if applicable) */}
            {isTwoWay && bwdGeo && (
                <mesh
                    geometry={bwdGeo}
                    onClick={() => onRoadClick?.(road, density)}
                    receiveShadow
                >
                    <meshStandardMaterial
                        color={getRoadColor(jamStatus.bwd)}
                        emissive={jamStatus.bwd ? "#990000" : "#000"}
                        emissiveIntensity={jamStatus.bwd ? Math.sin(Date.now() / 200) * 0.5 + 0.5 : 0}
                        roughness={0.92}
                        metalness={0.0}
                        side={THREE.DoubleSide}
                    />
                </mesh>
            )}
        </group>
    );
}

export default function RoadNetwork({ roads, trafficData, onRoadClick, jammedRoads = {}, center }: RoadNetworkProps) {
    return (
        <group>
            {roads.map((road) => (
                <SingleRoad
                    key={road.id}
                    road={road}
                    density={trafficData[road.id] ?? 0}
                    onRoadClick={onRoadClick}
                    jamStatus={jammedRoads[String(road.id)] || { fwd: false, bwd: false }}
                    center={center}
                />
            ))}
        </group>
    );
}
