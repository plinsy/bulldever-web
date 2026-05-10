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
import { 
  ChevronUp, 
  ChevronDown, 
  ChevronLeft, 
  ChevronRight,
  Navigation
} from "lucide-react";
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
  LatLng,
  INITIAL_CENTER
} from "./geo";
import axios from "axios";

const API_BASE = "http://127.0.0.1:8000/api";

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

const BUILDING_COLORS = [
  "#c9a882", "#d4a96a", "#c8b89a", "#b5835a",
  "#e8d5b0", "#c4a882", "#d9c5a0", "#b8926a",
];

function BuildingMesh({ b, color }: { b: OsmBuilding; color: string }) {
  const geo = useMemo(() => {
    try {
      if (b.points.length < 3) return new THREE.BufferGeometry();
      let cleanPts = b.points.filter((p, i, arr) => {
        if (i === 0) return true;
        const prev = arr[i - 1];
        return (Math.abs(p.x - prev.x) > 0.001 || Math.abs(p.z - prev.z) > 0.001);
      });
      if (cleanPts.length > 1) {
        const first = cleanPts[0], last = cleanPts[cleanPts.length - 1];
        if (Math.abs(first.x - last.x) < 0.001 && Math.abs(first.z - last.z) < 0.001) cleanPts.pop();
      }
      if (cleanPts.length < 3) return new THREE.BufferGeometry();
      const vec2s = cleanPts.map(p => new THREE.Vector2(p.x, -p.z));
      if (THREE.ShapeUtils.isClockWise(vec2s)) cleanPts.reverse();
      const shape = new THREE.Shape();
      shape.moveTo(cleanPts[0].x, -cleanPts[0].z);
      for (let i = 1; i < cleanPts.length; i++) shape.lineTo(cleanPts[i].x, -cleanPts[i].z);
      const height = (b.levels || CONFIG.DEFAULT_LEVELS) * CONFIG.METERS_PER_LEVEL * METER;
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
      geometry.rotateX(-Math.PI / 2);
      geometry.computeVertexNormals();
      return geometry;
    } catch (err) {
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
        <BuildingMesh key={b.id} b={b} color={BUILDING_COLORS[i % BUILDING_COLORS.length]} />
      ))}
    </group>
  );
}

/**
 * Visualise un chemin (ligne verte) sur la carte
 */
function PathVisualizer({ path }: { path: {lat: number, lng: number}[] }) {
  const points = useMemo(() => {
    return path.map(p => {
      const x = (p.lng - INITIAL_CENTER.lng) * METER;
      const z = (p.lat - INITIAL_CENTER.lat) * METER;
      return new THREE.Vector3(x, 0.15, z); // Slightly above ground
    });
  }, [path]);

  if (points.length < 2) return null;

  return (
    <line>
      <bufferGeometry attach="geometry" setFromPoints={points} />
      <lineBasicMaterial attach="material" color="#4ade80" linewidth={8} transparent opacity={0.9} />
    </line>
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

interface WorldContentProps extends SceneProps {
    center: LatLng;
    activePath: {lat: number, lng: number}[];
}

function WorldContent({ hour, onRoadInfo, onLoadingChange, onMetrics, onAccident, accidents = [], center, activePath }: WorldContentProps) {
  const { roads, loading: roadsLoading } = useOsmRoads(center);
  const { buildings, loading: bldgLoading } = useOsmBuildings(center);
  const [trafficData, setTrafficData] = useState<Record<number, number>>({});
  const [jammedRoads, setJammedRoads] = useState<Record<string, { fwd: boolean, bwd: boolean }>>({});
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

  useEffect(() => {
    axios
      .get(`${API_BASE}/traffic-data/?hour=${hour}`)
      .then((res) => {
        const map: Record<number, number> = {};
        res.data.forEach((r: any) => { map[r.id] = r.density; });
        setTrafficData(map);
      })
      .catch(() => {});
  }, [hour]);

  const handleRoadClick = useCallback(
    (road: OsmRoad, density: number) => {
      const speed = Math.round((1 - density) * 60);
      onRoadInfo(`📍 ${road.name || road.highway}\n🚗 Vitesse: ~${speed} km/h\n🔴 Densité: ${Math.round(density * 100)}%`);
    },
    [onRoadInfo],
  );

  const handleMetrics = useCallback((m: TrafficMetrics) => {
    setJammedRoads(m.jammedRoads || {});
    onMetrics?.(m);
  }, [onMetrics]);

  const sunAngle = ((hour - 6) / 12) * Math.PI;
  const sunPos = [Math.cos(sunAngle) * 100, Math.sin(sunAngle) * 100, 50];

  return (
    <Suspense fallback={null}>
      <Sky sunPosition={sunPos as any} turbidity={0.1} rayleigh={0.5} />
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      <ambientLight intensity={hour < 6 || hour > 18 ? 0.4 : 0.8} />
      <directionalLight position={sunPos as any} intensity={hour < 6 || hour > 18 ? 0.2 : 1.5} castShadow shadow-mapSize={[2048, 2048]} />
      <hemisphereLight intensity={0.4} groundColor="#222222" />

      <Ground />
      <OsmBuildings buildings={buildings} />
      <PathVisualizer path={activePath} />
      
      {!roadsLoading && (
        <RoadNetwork 
          roads={roads} 
          trafficData={trafficData} 
          onRoadClick={handleRoadClick} 
          jammedRoads={jammedRoads}
          center={center}
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
          <TrafficLightSystem roads={roads} center={center} signalMapRef={signalMapRef} />
          <CarSystem
            roads={roads}
            hour={hour}
            onMetrics={handleMetrics}
            center={center}
            onAccident={onAccident}
            signalMapRef={signalMapRef}
            hotspots={hotspots}
          />
        </>
      )}

      {/* Accident visual markers */}
      <AccidentMarkers accidents={accidents} hotspots={hotspots} />
      <OrbitControls makeDefault />
      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <GizmoViewport axisColors={["#ef4444", "#22c55e", "#3b82f6"]} labelColor="white" />
      </GizmoHelper>
    </Suspense>
  );
}

export default function Scene(props: SceneProps) {
  const [center, setCenter] = useState<LatLng>(INITIAL_CENTER);
  const [activePath, setActivePath] = useState<{lat: number, lng: number}[]>([]);

  const move = (latD: number, lngD: number) => {
    setCenter(prev => ({ lat: prev.lat + latD, lng: prev.lng + lngD }));
  };

  // Écouter les actions de l'IA (depuis ChatbotUI)
  useEffect(() => {
    const handleMapAction = (e: any) => {
      const action = e.detail;
      console.log("Scene received AI action:", action);

      if (action.type === 'SET_PATH') {
        setActivePath(action.payload);
        // On centre sur le début du chemin
        if (action.payload.length > 0) {
          setCenter({ lat: action.payload[0].lat, lng: action.payload[0].lng });
        }
      } else if (action.type === 'MOVE_CAMERA') {
        setCenter({ lat: action.payload.lat, lng: action.payload.lng });
      }
    };

    window.addEventListener('MAP_ACTION', handleMapAction);
    return () => window.removeEventListener('MAP_ACTION', handleMapAction);
  }, []);

  return (
    <div className="relative w-full h-screen">
      <Canvas shadows camera={{ position: [20, 20, 20], fov: 45 }}>
        <WorldContent {...props} center={center} activePath={activePath} />
      </Canvas>

      {/* Navigation UI Overlay */}
      <div className="absolute inset-0 pointer-events-none z-10">
        {/* Navigation Arrows */}
        <div className="absolute inset-0 flex items-center justify-center p-8">
            {/* North */}
            <button 
                onClick={() => move(CONFIG.ROAD_FETCH_RADIUS * 1.5, 0)}
                className="absolute top-12 pointer-events-auto bg-slate-900/80 backdrop-blur-md p-3 rounded-2xl border border-slate-700/50 text-white shadow-2xl hover:bg-slate-800 hover:scale-110 transition-all active:scale-95 group"
                title="Vers le Nord"
            >
                <ChevronUp className="group-hover:animate-bounce" size={28} />
            </button>
            {/* South */}
            <button 
                onClick={() => move(-CONFIG.ROAD_FETCH_RADIUS * 1.5, 0)}
                className="absolute bottom-12 pointer-events-auto bg-slate-900/80 backdrop-blur-md p-3 rounded-2xl border border-slate-700/50 text-white shadow-2xl hover:bg-slate-800 hover:scale-110 transition-all active:scale-95 group"
                title="Vers le Sud"
            >
                <ChevronDown className="group-hover:animate-bounce" size={28} />
            </button>
            {/* West */}
            <button 
                onClick={() => move(0, -CONFIG.ROAD_FETCH_RADIUS * 1.5)}
                className="absolute left-12 pointer-events-auto bg-slate-900/80 backdrop-blur-md p-3 rounded-2xl border border-slate-700/50 text-white shadow-2xl hover:bg-slate-800 hover:scale-110 transition-all active:scale-95 group"
                title="Vers l'Ouest"
            >
                <ChevronLeft className="group-hover:animate-bounce" size={28} />
            </button>
            {/* East */}
            <button 
                onClick={() => move(0, CONFIG.ROAD_FETCH_RADIUS * 1.5)}
                className="absolute right-12 pointer-events-auto bg-slate-900/80 backdrop-blur-md p-3 rounded-2xl border border-slate-700/50 text-white shadow-2xl hover:bg-slate-800 hover:scale-110 transition-all active:scale-95 group"
                title="Vers l'Est"
            >
                <ChevronRight className="group-hover:animate-bounce" size={28} />
            </button>
        </div>

        {/* Current Location Badge */}
        <div className="absolute top-8 left-1/2 -translate-x-1/2 pointer-events-auto bg-slate-950/90 backdrop-blur-xl border border-slate-800 px-4 py-2 rounded-full shadow-2xl flex items-center gap-3">
            <div className="bg-blue-500/20 p-1.5 rounded-full">
                <Navigation size={14} className="text-blue-400 rotate-45" />
            </div>
            <div className="flex flex-col">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Zone Actuelle</span>
                <span className="text-xs font-mono text-white">
                    {center.lat.toFixed(4)}, {center.lng.toFixed(4)}
                </span>
            </div>
        </div>
      </div>
    </div>
  );
}
