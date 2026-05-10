import * as THREE from "three";

// 1. Scene & Units
export const SCALE = 8000;
export const METER = SCALE / 111320; // 1 scene unit = ~13.9 meters

// 2. World & Architecture
export const METERS_PER_LEVEL = 3.0;
export const DEFAULT_LEVELS = 1;
export const ROAD_FETCH_RADIUS = 0.03;
export const BUILDING_FETCH_RADIUS = 0.005;

// 3. Traffic Volume
export const MAX_CARS = 60;

// 4. Speeds (Physical Units per frame)
export const TRAFFIC_SPEED_MIN = 0.020;
export const TRAFFIC_SPEED_MAX = 0.038;
export const TURN_SPEED_MULTIPLIER = 2.5;

// 5. Collision & Radar (in Meters)
export const RADAR_DISTANCE = 28.0;       // Max distance radar can see
export const SAFE_GAP = 10.0;             // Distance to stop completely (was 6)
export const SLOW_GAP = 22.0;             // Distance to start slowing down (was 15)
export const RADAR_CONE_DOT = 0.55;       // Wider cone: ~57° (was 0.85 = ~30°)
export const COLLISION_DISTANCE = 2.0;    // Tighter to reduce phantom collisions (was 3.5)
export const ACCIDENT_GRACE_FRAMES = 180; // More grace time on spawn

// Cross-traffic / intersection awareness (in Meters)
export const CROSS_RADAR_DISTANCE = 18.0;  // How far to watch for crossing vehicles
export const CROSS_RADAR_DOT = -0.1;       // Detect anything not behind us (±95°)
export const INTERSECTION_APPROACH = 20.0; // Start slowing down this far from an intersection
export const INTERSECTION_STOP = 9.0;      // Hard-slow at this distance
export const INTERSECTION_YIELD_GAP = 14.0; // If another car is this close in intersection, yield

// 6. Congestion & Detection
export const JAM_CAR_COUNT = 4;
export const PREDICTION_INTERVAL_MS = 10000;

// 7. Intersection Logic
export const INTERSECTION_THRESH = 0.00012;
export const INTERSECTION_TOLERANCE = 0.06;

// 8. Lane Positioning
export const LANE_OFFSET = 1.6;
export const NARROW_ROAD_LIMIT = 4.5;

// 9. Behavioral Probabilities
export const UTURN_CHANCE_AT_DEAD_END = 0.2;
export const INTERSECTION_SWITCH_CHANCE = 0.9;

// 10. Animation & Smoothing
export const LERP_LOOKAT = 0.12;           // Smoother rotation (was 0.2)
export const LERP_LANE_OFFSET = 0.08;
export const SMOKE_ANIM_SPEED = 0.04;
export const SMOKE_RISE_HEIGHT = 8.0;
export const SMOKE_SIZE = 0.35;
export const SMOKE_LIFETIME = 2.5;
export const INTERPOLATION_TIME = 0.15;

// 11. Peak Hour Intensity
export const PEAK_HOUR_MIN_SPEED_FACTOR = 0.2;
export const PEAK_HOUR_MAX_SPEED_FACTOR = 1.0;

// 12. Aesthetics
export const CAR_COLORS = [
    "#60a5fa", // blue
    "#f87171", // red
    "#fbbf24", // yellow
    "#a3e635", // lime
    "#e2e8f0", // white
    "#94a3b8", // silver
    "#f97316", // orange
    "#ec4899", // pink
];

// 13. Road Widths (in Meters)
export const ROAD_WIDTH_METERS: Record<string, number> = {
    motorway: 10.0,
    trunk: 9.0,
    primary: 8.0,
    secondary: 7.0,
    tertiary: 5.0,
    residential: 4.5,
    service: 3.5,
    unclassified: 4.5,
};

// 14. Traffic Lights (in Meters)
export const TRAFFIC_LIGHT_APPROACH = 30.0;
export const TRAFFIC_LIGHT_STOP = 8.0;
export const TRAFFIC_LIGHT_INNER = 4.0;
export const TRAFFIC_LIGHT_QUEUE_ZONE = 25.0;

// 15. Accident Hotspot Prevention
export const HOTSPOT_INFLUENCE_RADIUS = 40.0;
export const HOTSPOT_SPEED_PENALTY = 0.45;

// 16. Signal timing (seconds)
export const SIGNAL_BASE_GREEN = 15;
export const SIGNAL_MIN_GREEN = 8;
export const SIGNAL_MAX_GREEN = 40;
export const SIGNAL_YELLOW_DUR = 2.5;
export const SIGNAL_QUEUE_WEIGHT = 1.5;
