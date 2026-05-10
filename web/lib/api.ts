import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export const apiClient = axios.create({ baseURL: API_BASE });

// Inject token on every request when present
apiClient.interceptors.request.use((config) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
    if (token) {
        config.headers.Authorization = `Token ${token}`;
    }
    return config;
});

// --- Auth ---

export interface UserProfile {
    username: string;
    email: string;
    role: "usager" | "pompier" | "urgence" | "agent";
    role_display: string;
}

export interface AuthResponse {
    token: string;
    user: UserProfile;
}

export async function register(
    username: string,
    email: string,
    password: string,
    role: UserProfile["role"]
): Promise<AuthResponse> {
    const { data } = await apiClient.post<AuthResponse>("/users/register/", {
        username,
        email,
        password,
        role,
    });
    return data;
}

export async function login(username: string, password: string): Promise<AuthResponse> {
    const { data } = await apiClient.post<AuthResponse>("/users/login/", { username, password });
    return data;
}

export async function logout(): Promise<void> {
    await apiClient.post("/users/logout/");
}

export async function fetchMe(): Promise<UserProfile> {
    const { data } = await apiClient.get<UserProfile>("/users/me/");
    return data;
}

// --- User features ---

export interface BlockedRoad {
    id: number;
    name: string;
    density: number;
    congestion_level: "modere" | "fort" | "critique";
    geometry: unknown;
}

export interface BlockedRoadsResponse {
    count: number;
    roads: BlockedRoad[];
}

export async function fetchBlockedRoads(hour?: number): Promise<BlockedRoadsResponse> {
    const params = hour !== undefined ? { hour } : {};
    const { data } = await apiClient.get<BlockedRoadsResponse>("/users/blocked-roads/", { params });
    return data;
}

export interface TrafficManagementRoad {
    id: number;
    name: string;
    density: number;
    congestion_level: "modere" | "fort" | "critique";
}

export interface TrafficManagementResponse {
    hour: number;
    total: number;
    roads: TrafficManagementRoad[];
}

export async function fetchTrafficManagement(hour?: number): Promise<TrafficManagementResponse> {
    const params = hour !== undefined ? { hour } : {};
    const { data } = await apiClient.get<TrafficManagementResponse>("/users/traffic-management/", { params });
    return data;
}

export interface PathResult {
    distance_km: number;
    duration_minutes: number;
    path: [number, number][];
    node_count?: number;
    start_snapped?: { lat: number; lng: number };
    end_snapped?: { lat: number; lng: number };
}

export async function fetchBestPath(
    startLat: number,
    startLng: number,
    endLat: number,
    endLng: number
): Promise<PathResult> {
    const { data } = await apiClient.get<PathResult>("/shortest-path/", {
        params: { start_lat: startLat, start_lng: startLng, end_lat: endLat, end_lng: endLng },
    });
    return data;
}

export interface DeparturePrediction {
    recommended_departure: string;
    arrival_time: string;
    duration_minutes: number;
    peak_label: string;
    distance_km: number;
    windows: { departure: string; duration_minutes: number; peak_label: string }[];
}

export async function fetchDeparturePrediction(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
    arrivalTime: string
): Promise<DeparturePrediction> {
    const { data } = await apiClient.post<DeparturePrediction>("/depart/calculate/", {
        origin_lat: originLat,
        origin_lng: originLng,
        dest_lat: destLat,
        dest_lng: destLng,
        arrival_time: arrivalTime,
        congestion_points: [],
    });
    return data;
}
