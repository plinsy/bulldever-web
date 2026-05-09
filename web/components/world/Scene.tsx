"use client";

import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  Sky,
  GizmoHelper,
  GizmoViewport,
  Stars,
} from "@react-three/drei";
import {
  Suspense,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import * as THREE from "three";
import RoadNetwork from "./RoadNetwork";
import CarSystem, { TrafficMetrics } from "../simulation/CarSystem";
import TrafficLightSystem from "./TrafficLightSystem";
import type { AccidentEvent, AccidentHotspot } from "../simulation/accidentTypes";
import type { TrafficSignalMap } from "../simulation/trafficLightTypes";
import AccidentMarkers from "./AccidentMarkers";
import * as CONFIG from "../simulation/config";
import {
  useOsmRoads,
  useOsmBuildings,
  OsmRoad,
  OsmBuilding,
  METER,
} from "./geo";
import axios from "axios";

const API_BASE = "http://localhost:8000/api";

function Ground() {
  return (
    <>
      {/* Base terrain - green hills */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.15, 0]}
        receiveShadow
      >
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial color="#3a6b3e" roughness={1} metalness={0} />
      </mesh>

      {/* Urban pavement core */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.05, 0]}
        receiveShadow
      >
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

// Madagascar-style building palette: terracotta, sand, ochre, whitewash
const BUILDING_COLORS = [
  "#c9a882",
  "#d4a96a",
  "#c8b89a",
  "#b5835a",
  "#e8d5b0",
  "#c4a882",
  "#d9c5a0",
  "#b8926a",
];

function BuildingMesh({ b, color }: { b: OsmBuilding; color: string }) {
  const geo = useMemo(() => {
    try {
      if (b.points.length < 3) return new THREE.BufferGeometry();

      // Remove consecutive duplicate points which can crash the Extrude/Earcut algorithm
      let cleanPts = b.points.filter((p, i, arr) => {
        if (i === 0) return true;
        const prev = arr[i - 1];
        return (
          Math.abs(p.x - prev.x) > 0.001 || Math.abs(p.z - prev.z) > 0.001
        );
      });
      
      // Remove last point if it's the same as the first (OSM ways are often closed)
      if (cleanPts.length > 1) {
        const first = cleanPts[0];
        const last = cleanPts[cleanPts.length - 1];
        if (Math.abs(first.x - last.x) < 0.001 && Math.abs(first.z - last.z) < 0.001) {
          cleanPts.pop();
        }
      }

      if (cleanPts.length < 3) return new THREE.BufferGeometry();

      // Ensure counter-clockwise winding order so normals point OUTWARD.
      const vec2s = cleanPts.map(p => new THREE.Vector2(p.x, -p.z));
      if (THREE.ShapeUtils.isClockWise(vec2s)) {
        cleanPts.reverse();
      }

      const shape = new THREE.Shape();
      shape.moveTo(cleanPts[0].x, -cleanPts[0].z);
      for (let i = 1; i < cleanPts.length; i++) {
        shape.lineTo(cleanPts[i].x, -cleanPts[i].z);
      }

      const height = (b.levels || CONFIG.DEFAULT_LEVELS) * CONFIG.METERS_PER_LEVEL * METER; // 3m per level properly scaled to scene units
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: height,
        bevelEnabled: false,
      });

      geometry.rotateX(-Math.PI / 2);
      geometry.computeVertexNormals();
      return geometry;
    } catch (err) {
      console.warn("Failed to generate geometry for building", b.id);
      return new THREE.BufferGeometry();
    }
  }, [b]);

  return (
    <mesh geometry={geo} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.85} metalness={0.02} />
    </mesh>
  );
}

function OsmBuildings({ buildings }: { buildings: OsmBuilding[] }) {
  if (!buildings.length) return null;
  return (
    <group>
      {buildings.map((b, i) => (
        <BuildingMesh
          key={b.id}
          b={b}
          color={BUILDING_COLORS[i % BUILDING_COLORS.length]}
        />
      ))}
    </group>
  );
}

interface SceneProps {
  hour: number;
  onRoadInfo: (info: string) => void;
  onLoadingChange?: (loading: boolean) => void;
  onMetrics?: (metrics: TrafficMetrics) => void;
  onAccident?: (event: AccidentEvent) => void;
  accidents?: AccidentEvent[];
}

function WorldContent({ hour, onRoadInfo, onLoadingChange, onMetrics, onAccident, accidents = [] }: SceneProps) {
  const { roads, loading: roadsLoading } = useOsmRoads();
  const { buildings, loading: bldgLoading } = useOsmBuildings();
  const loading = roadsLoading && bldgLoading;

  const signalMapRef = useRef<TrafficSignalMap>(new Map());
  const [hotspots, setHotspots] = useState<AccidentHotspot[]>([]);

  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);

  // Fetch hotspots on mount then refresh every 30 s so the map stays current.
  useEffect(() => {
    const fetchHotspots = () => {
      axios
        .get(`${API_BASE}/accidents/`)
        .then((res) => setHotspots(res.data))
        .catch(() => {});
    };
    fetchHotspots();
    const id = setInterval(fetchHotspots, 30_000);
    return () => clearInterval(id);
  }, []);
  const [trafficData, setTrafficData] = useState<Record<number, number>>({});

  useEffect(() => {
    axios
      .get(`${API_BASE}/traffic-data/?hour=${hour}`)
      .then((res) => {
        const map: Record<number, number> = {};
        res.data.forEach((r: any) => {
          map[r.id] = r.density;
        });
        setTrafficData(map);
      })
      .catch(() => {});
  }, [hour]);

  const handleRoadClick = useCallback(
    (road: OsmRoad, density: number) => {
      const speed = Math.round((1 - density) * 60);
      onRoadInfo(
        `📍 ${road.name || road.highway}\n🚗 Vitesse: ~${speed} km/h\n🔴 Densité: ${Math.round(density * 100)}%`,
      );
    },
    [onRoadInfo],
  );

  // Sun position based on hour
  const sunAngle = ((hour - 6) / 12) * Math.PI;
  const sunPos: [number, number, number] = [
    Math.cos(sunAngle) * 200,
    Math.sin(sunAngle) * 200,
    -50,
  ];

  return (
    <>
      {/* Atmosphere */}
      <Sky
        sunPosition={sunPos}
        turbidity={hour > 6 && hour < 20 ? 8 : 20}
        rayleigh={hour > 6 && hour < 20 ? 2 : 0.5}
      />
      {hour < 6 || hour > 20 ? (
        <Stars radius={200} depth={50} count={3000} factor={4} />
      ) : null}
      <fog
        attach="fog"
        args={[hour > 6 && hour < 20 ? "#b8cfe0" : "#0a0f1a", 100, 350]}
      />

      {/* Lighting */}
      <ambientLight
        intensity={hour > 6 && hour < 20 ? 0.8 : 0.2}
        color="#ffeedd"
      />
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
        shadow-bias={-0.001}
        color="#fffaed"
      />
      {/* Fill light from the opposite side */}
      <directionalLight
        position={[-50, 30, 50]}
        intensity={0.3}
        color="#aaccff"
      />

      {/* World */}
      <Ground />
      <OsmBuildings buildings={buildings} />

      {/* Loading indicator: spinning sphere when waiting for OSM data */}
      {loading && (
        <mesh position={[0, 5, 0]}>
          <sphereGeometry args={[1]} />
          <meshStandardMaterial
            color="#3b82f6"
            emissive="#3b82f6"
            emissiveIntensity={1}
          />
        </mesh>
      )}

      {/* Real OSM roads — show as soon as roads data arrives */}
      {!roadsLoading && (
        <RoadNetwork
          roads={roads}
          trafficData={trafficData}
          onRoadClick={handleRoadClick}
        />
      )}

      {/* Night street lights */}
      {(hour < 6 || hour > 18) &&
        [
          [10, 0],
          [-10, 5],
          [5, -15],
          [-5, 20],
          [20, -10],
          [-20, 10],
        ].map(([x, z], i) => (
          <pointLight
            key={i}
            position={[x, 4, z]}
            intensity={0.6}
            distance={20}
            color="#ff9d4d"
          />
        ))}

      {/* Traffic lights + vehicles — only once roads are ready.
          TrafficLightSystem must render before CarSystem so its useFrame
          runs first and advances phase timers before CarSystem reads them. */}
      {!roadsLoading && roads.length > 0 && (
        <>
          <TrafficLightSystem roads={roads} signalMapRef={signalMapRef} />
          <CarSystem
            roads={roads}
            hour={hour}
            onMetrics={onMetrics}
            onAccident={onAccident}
            signalMapRef={signalMapRef}
            hotspots={hotspots}
          />
        </>
      )}

      {/* Accident visual markers */}
      <AccidentMarkers accidents={accidents} hotspots={hotspots} />

      {/* Helper */}
      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <GizmoViewport labelColor="white" axisHeadScale={1} />
      </GizmoHelper>
    </>
  );
}

export default function Scene({
  hour,
  onRoadInfo,
  onLoadingChange,
  onMetrics,
  onAccident,
  accidents,
}: SceneProps) {
  return (
    <div className="w-full h-full">
      <Canvas
        shadows
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.2,
        }}
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
          <WorldContent
            hour={hour}
            onRoadInfo={onRoadInfo}
            onLoadingChange={onLoadingChange}
            onMetrics={onMetrics}
            onAccident={onAccident}
            accidents={accidents}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
