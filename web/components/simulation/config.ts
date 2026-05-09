import * as THREE from "three";

// 1. Scene & Units
export const SCALE = 8000;
export const METER = SCALE / 111320; // 1 scene unit = ~13.9 meters

// 2. World & Architecture
export const METERS_PER_LEVEL = 3.0; // Height of each building level in meters
export const DEFAULT_LEVELS = 1;     // Default levels if OSM data is missing
export const ROAD_FETCH_RADIUS = 0.03;      // Latitude radius in degrees (~3.3km)
export const BUILDING_FETCH_RADIUS = 0.005;  // Latitude radius in degrees (~1.1km)

// 3. Traffic Volume
export const MAX_CARS = 60;

// 4. Speeds (Physical Units per frame)
export const TRAFFIC_SPEED_MIN = 0.005;
export const TRAFFIC_SPEED_MAX = 0.015;
export const TURN_SPEED_MULTIPLIER = 3.0; // How fast cars move during intersection transitions

// 4. Collision & Radar (in Meters)
export const RADAR_DISTANCE = 20.0; // Max distance radar can see
export const SAFE_GAP = 6.0;        // Distance to stop completely
export const SLOW_GAP = 15.0;       // Distance to start slowing down
export const RADAR_CONE_DOT = 0.85;  // Focus of the radar (0.85 = ~30 degrees)

// 5. Intersection Logic
export const INTERSECTION_THRESH = 0.00012; // Connectivity threshold (higher = more connections)
export const INTERSECTION_TOLERANCE = 0.06; // Progress tolerance to trigger a turn

// 6. Lane Positioning
export const LANE_OFFSET = 1.6;      // Distance from center line in meters
export const NARROW_ROAD_LIMIT = 4.5; // Road width (m) below which cars drive in center

// 7. Behavioral Probabilities
export const UTURN_CHANCE_AT_DEAD_END = 0.2; // Chance to turn back if no connections exist
export const INTERSECTION_SWITCH_CHANCE = 0.9; // 90% chance to turn, 10% to U-turn if connections exist

// 8. Animation & Smoothing (Lerp factors)
export const LERP_LOOKAT = 0.2;         // Smoothness of car rotation
export const LERP_LANE_OFFSET = 0.1;    // Smoothness of lane changing
export const SMOKE_ANIM_SPEED = 0.04;   // Speed of rising smoke
export const SMOKE_RISE_HEIGHT = 8.0;   // How high smoke rises (meters)
export const SMOKE_SIZE = 0.35;         // Base size of particles
export const SMOKE_LIFETIME = 2.5;      // Seconds a particle stays visible
export const INTERPOLATION_TIME = 0.15; // General smoothing factor

// 9. Peak Hour Intensity
export const PEAK_HOUR_MIN_SPEED_FACTOR = 0.2; // Traffic speed at midnight
export const PEAK_HOUR_MAX_SPEED_FACTOR = 1.0; // Traffic speed at rush hour

// 10. Aesthetics
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

// 11. Road Widths (in Meters)
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

