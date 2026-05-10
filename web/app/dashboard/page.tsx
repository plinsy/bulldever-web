"use client";

import { useEffect, useState, useCallback, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
    Navigation,
    LogOut,
    AlertTriangle,
    Route,
    Clock,
    Map,
    Loader2,
    ChevronRight,
    RefreshCw,
    Shield,
    Siren,
    LayoutDashboard,
    ExternalLink,
    MapPin,
} from "lucide-react";

const MapPickerModal = dynamic(
    () => import("@/components/ui/MapPickerModal"),
    { ssr: false }
);

type PickedPoints = { origin: [number, number] | null; destination: [number, number] | null };
import { useAuth } from "@/contexts/AuthContext";
import RequireAuth from "@/components/auth/RequireAuth";
import {
    fetchBlockedRoads,
    fetchBestPath,
    fetchDeparturePrediction,
    fetchTrafficManagement,
    type BlockedRoad,
    type PathResult,
    type DeparturePrediction,
    type TrafficManagementRoad,
} from "@/lib/api";
import type { UserProfile } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "blocked" | "path" | "departure" | "management";

interface TabDefinition {
    id: Tab;
    label: string;
    icon: React.ReactNode;
    /** Roles that can see this tab. Undefined = all authenticated roles. */
    allowedRoles?: UserProfile["role"][];
}

// ─── Tab registry ─────────────────────────────────────────────────────────────

const ALL_TABS: TabDefinition[] = [
    { id: "blocked", label: "Routes bloquées", icon: <AlertTriangle size={16} /> },
    { id: "path", label: "Meilleur chemin", icon: <Route size={16} /> },
    { id: "departure", label: "Heure de sortie", icon: <Clock size={16} /> },
    { id: "management", label: "Gestion trafic", icon: <Shield size={16} />, allowedRoles: ["agent"] },
];

function getTabsForRole(role: UserProfile["role"]): TabDefinition[] {
    return ALL_TABS.filter((t) => !t.allowedRoles || t.allowedRoles.includes(role));
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CONGESTION_COLORS: Record<string, string> = {
    critique: "text-red-400 bg-red-950/40 border-red-700",
    fort: "text-orange-400 bg-orange-950/40 border-orange-700",
    modere: "text-yellow-400 bg-yellow-950/40 border-yellow-700",
};

const PEAK_LABELS: Record<string, string> = {
    peak: "Heure de pointe",
    mid: "Circulation modérée",
    off: "Circulation fluide",
};

const ROLE_BADGE: Record<UserProfile["role"], { color: string; icon: React.ReactNode }> = {
    usager: { color: "bg-blue-900/40 border-blue-700 text-blue-300", icon: <Navigation size={12} /> },
    pompier: { color: "bg-red-900/40 border-red-700 text-red-300", icon: <Siren size={12} /> },
    urgence: { color: "bg-orange-900/40 border-orange-700 text-orange-300", icon: <Siren size={12} /> },
    agent: { color: "bg-purple-900/40 border-purple-700 text-purple-300", icon: <Shield size={12} /> },
};

// ─── Sub-components (SRP) ─────────────────────────────────────────────────────

function BlockedRoadsTab() {
    const [roads, setRoads] = useState<BlockedRoad[]>([]);
    const [count, setCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetchBlockedRoads(new Date().getHours());
            setRoads(res.roads);
            setCount(res.count);
        } catch {
            setError("Impossible de charger les routes bloquées.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <p className="text-slate-400 text-sm">
                    {count > 0 ? `${count} route(s) congestionnée(s)` : "Aucune route bloquée"}
                </p>
                <button onClick={load} disabled={loading} className="text-blue-400 hover:text-blue-300 disabled:opacity-50 transition-colors" title="Actualiser">
                    <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                </button>
            </div>

            {error && (
                <p className="text-red-400 text-sm bg-red-950/30 border border-red-800 rounded-lg px-3 py-2 mb-3">{error}</p>
            )}

            {loading && !roads.length ? (
                <div className="flex justify-center py-8">
                    <Loader2 size={24} className="animate-spin text-blue-400" />
                </div>
            ) : roads.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                    <Map size={32} className="mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Toutes les routes sont fluides.</p>
                </div>
            ) : (
                <ul className="space-y-2">
                    {roads.map((road) => (
                        <li key={road.id} className={`flex items-center justify-between border rounded-lg px-3 py-2.5 text-sm ${CONGESTION_COLORS[road.congestion_level]}`}>
                            <span className="font-medium truncate mr-2">{road.name}</span>
                            <span className="shrink-0 text-xs uppercase tracking-wide font-semibold">{road.congestion_level}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function BestPathTab() {
    const [points, setPoints] = useState<PickedPoints>({ origin: null, destination: null });
    const [mapOpen, setMapOpen] = useState(false);
    const [pickingStep, setPickingStep] = useState<"origin" | "destination">("origin");
    const [result, setResult] = useState<PathResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleMapClick = useCallback((lat: number, lng: number) => {
        setPoints((prev) => {
            if (pickingStep === "origin") return { ...prev, origin: [lat, lng] };
            return { ...prev, destination: [lat, lng] };
        });
        setPickingStep((s) => (s === "origin" ? "destination" : "destination"));
    }, [pickingStep]);

    const handleConfirm = useCallback(() => {
        setMapOpen(false);
        setPickingStep("origin");
    }, []);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        if (!points.origin || !points.destination) return;
        setError(null);
        setLoading(true);
        try {
            const res = await fetchBestPath(points.origin[0], points.origin[1], points.destination[0], points.destination[1]);
            setResult(res);
        } catch {
            setError("Impossible de calculer l'itinéraire. Vérifiez les points sélectionnés.");
        } finally {
            setLoading(false);
        }
    }

    const fmt = (p: [number, number] | null) =>
        p ? `${p[0].toFixed(4)}, ${p[1].toFixed(4)}` : "Non sélectionné";

    return (
        <div>
            <p className="text-slate-400 text-sm mb-4">
                Sélectionnez votre point de départ et votre destination sur la carte.
            </p>

            <button
                type="button"
                onClick={() => { setPickingStep("origin"); setMapOpen(true); }}
                className="w-full mb-4 flex items-center justify-center gap-2 border-2 border-dashed border-blue-600/50 hover:border-blue-500 bg-blue-950/20 hover:bg-blue-950/40 text-blue-400 hover:text-blue-300 rounded-xl py-3 text-sm font-medium transition-colors"
            >
                <MapPin size={16} />
                {points.origin && points.destination ? "Modifier la sélection sur la carte" : "Sélectionner sur la carte"}
            </button>

            {/* Summary of selected points */}
            <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="bg-slate-800/60 rounded-lg px-3 py-2 text-xs">
                    <p className="text-slate-500 mb-0.5 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                        Départ
                    </p>
                    <p className={`font-medium ${points.origin ? "text-green-300" : "text-slate-600 italic"}`}>
                        {fmt(points.origin)}
                    </p>
                </div>
                <div className="bg-slate-800/60 rounded-lg px-3 py-2 text-xs">
                    <p className="text-slate-500 mb-0.5 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                        Destination
                    </p>
                    <p className={`font-medium ${points.destination ? "text-red-300" : "text-slate-600 italic"}`}>
                        {fmt(points.destination)}
                    </p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
                {error && <p className="text-red-400 text-sm bg-red-950/30 border border-red-800 rounded-lg px-3 py-2">{error}</p>}

                <button
                    type="submit"
                    disabled={loading || !points.origin || !points.destination}
                    className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
                >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />}
                    Calculer le meilleur chemin
                </button>
            </form>

            {result && (
                <div className="mt-4 bg-green-950/30 border border-green-700 rounded-lg px-4 py-3 space-y-1">
                    <p className="text-green-300 font-semibold text-sm">Itinéraire trouvé</p>
                    <p className="text-slate-300 text-sm">Distance : <span className="text-white font-medium">{result.distance_km?.toFixed(1) ?? "—"} km</span></p>
                    <p className="text-slate-300 text-sm">Durée estimée : <span className="text-white font-medium">{result.duration_minutes ?? "—"} min</span></p>
                </div>
            )}

            <MapPickerModal
                open={mapOpen}
                points={points}
                pickingStep={pickingStep}
                onMapClick={handleMapClick}
                onConfirm={handleConfirm}
                onClose={() => setMapOpen(false)}
                onStepChange={setPickingStep}
            />
        </div>
    );
}

function DeparturePredictionTab() {
    const [points, setPoints] = useState<PickedPoints>({ origin: null, destination: null });
    const [mapOpen, setMapOpen] = useState(false);
    const [pickingStep, setPickingStep] = useState<"origin" | "destination">("origin");
    const [arrivalTime, setArrivalTime] = useState("08:00");
    const [result, setResult] = useState<DeparturePrediction | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleMapClick = useCallback((lat: number, lng: number) => {
        setPoints((prev) => {
            if (pickingStep === "origin") return { ...prev, origin: [lat, lng] };
            return { ...prev, destination: [lat, lng] };
        });
        setPickingStep((s) => (s === "origin" ? "destination" : "destination"));
    }, [pickingStep]);

    const handleConfirm = useCallback(() => {
        setMapOpen(false);
        setPickingStep("origin");
    }, []);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        if (!points.origin || !points.destination) return;
        setError(null);
        setLoading(true);
        try {
            const res = await fetchDeparturePrediction(
                points.origin[0], points.origin[1],
                points.destination[0], points.destination[1],
                arrivalTime
            );
            setResult(res);
        } catch {
            setError("Impossible de calculer la prédiction. Vérifiez les données.");
        } finally {
            setLoading(false);
        }
    }

    const fmt = (p: [number, number] | null) =>
        p ? `${p[0].toFixed(4)}, ${p[1].toFixed(4)}` : "Non sélectionné";

    return (
        <div>
            <p className="text-slate-400 text-sm mb-4">
                Sélectionnez votre trajet sur la carte et indiquez l&apos;heure d&apos;arrivée souhaitée.
            </p>

            <button
                type="button"
                onClick={() => { setPickingStep("origin"); setMapOpen(true); }}
                className="w-full mb-4 flex items-center justify-center gap-2 border-2 border-dashed border-blue-600/50 hover:border-blue-500 bg-blue-950/20 hover:bg-blue-950/40 text-blue-400 hover:text-blue-300 rounded-xl py-3 text-sm font-medium transition-colors"
            >
                <MapPin size={16} />
                {points.origin && points.destination ? "Modifier la sélection sur la carte" : "Sélectionner sur la carte"}
            </button>

            {/* Summary of selected points */}
            <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="bg-slate-800/60 rounded-lg px-3 py-2 text-xs">
                    <p className="text-slate-500 mb-0.5 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                        Départ
                    </p>
                    <p className={`font-medium ${points.origin ? "text-green-300" : "text-slate-600 italic"}`}>
                        {fmt(points.origin)}
                    </p>
                </div>
                <div className="bg-slate-800/60 rounded-lg px-3 py-2 text-xs">
                    <p className="text-slate-500 mb-0.5 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                        Destination
                    </p>
                    <p className={`font-medium ${points.destination ? "text-red-300" : "text-slate-600 italic"}`}>
                        {fmt(points.destination)}
                    </p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                    <label className="block text-slate-300 text-xs font-semibold uppercase tracking-wide mb-2">Heure d&apos;arrivée souhaitée</label>
                    <input type="time" value={arrivalTime} onChange={(e) => setArrivalTime(e.target.value)} required className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                </div>

                {error && <p className="text-red-400 text-sm bg-red-950/30 border border-red-800 rounded-lg px-3 py-2">{error}</p>}

                <button
                    type="submit"
                    disabled={loading || !points.origin || !points.destination}
                    className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
                >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />}
                    Calculer l&apos;heure de sortie idéale
                </button>
            </form>

            {result && (
                <div className="mt-4 bg-blue-950/30 border border-blue-700 rounded-lg px-4 py-3 space-y-2">
                    <p className="text-blue-300 font-semibold text-sm">Recommandation</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="bg-slate-800/60 rounded-lg p-2 text-center">
                            <p className="text-slate-400 text-xs">Départ recommandé</p>
                            <p className="text-white font-bold text-base mt-0.5">{result.recommended_departure}</p>
                        </div>
                        <div className="bg-slate-800/60 rounded-lg p-2 text-center">
                            <p className="text-slate-400 text-xs">Durée estimée</p>
                            <p className="text-white font-bold text-base mt-0.5">{result.duration_minutes} min</p>
                        </div>
                    </div>
                    <p className="text-slate-400 text-xs">
                        Trafic : <span className="text-slate-200">{PEAK_LABELS[result.peak_label] ?? result.peak_label}</span>
                    </p>
                    {result.windows && result.windows.length > 1 && (
                        <div>
                            <p className="text-slate-400 text-xs mb-1">Autres créneaux favorables :</p>
                            <ul className="space-y-1">
                                {result.windows.slice(0, 3).map((w, i) => (
                                    <li key={i} className="flex justify-between text-xs text-slate-300">
                                        <span>{w.departure}</span>
                                        <span className="text-slate-500">{w.duration_minutes} min</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            <MapPickerModal
                open={mapOpen}
                points={points}
                pickingStep={pickingStep}
                onMapClick={handleMapClick}
                onConfirm={handleConfirm}
                onClose={() => setMapOpen(false)}
                onStepChange={setPickingStep}
            />
        </div>
    );
}

/** Agent-only: full traffic overview + admin shortcuts */
function TrafficManagementTab() {
    const [roads, setRoads] = useState<TrafficManagementRoad[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetchTrafficManagement(new Date().getHours());
            setRoads(res.roads);
            setTotal(res.total);
        } catch {
            setError("Impossible de charger les données de trafic.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    return (
        <div>
            <div className="flex gap-2 mb-5">
                <a href="/" className="flex-1 flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-600 rounded-lg px-3 py-2 text-xs font-medium transition-colors">
                    <LayoutDashboard size={13} />
                    Simulation
                    <ExternalLink size={11} className="opacity-60" />
                </a>
                <a href="http://localhost:8000/admin/" target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-600 rounded-lg px-3 py-2 text-xs font-medium transition-colors">
                    <Shield size={13} />
                    Admin Django
                    <ExternalLink size={11} className="opacity-60" />
                </a>
            </div>

            <div className="flex items-center justify-between mb-3">
                <p className="text-slate-400 text-sm">{total} segments de route</p>
                <button onClick={load} disabled={loading} className="text-blue-400 hover:text-blue-300 disabled:opacity-50 transition-colors" title="Actualiser">
                    <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                </button>
            </div>

            {error && <p className="text-red-400 text-sm bg-red-950/30 border border-red-800 rounded-lg px-3 py-2 mb-3">{error}</p>}

            {loading && !roads.length ? (
                <div className="flex justify-center py-8">
                    <Loader2 size={24} className="animate-spin text-blue-400" />
                </div>
            ) : (
                <ul className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                    {roads.map((road) => (
                        <li key={road.id} className={`flex items-center justify-between border rounded-lg px-3 py-2 text-sm ${CONGESTION_COLORS[road.congestion_level]}`}>
                            <span className="font-medium truncate mr-2">{road.name}</span>
                            <div className="flex items-center gap-2 shrink-0">
                                <span className="text-xs opacity-70">{Math.round(road.density * 100)}%</span>
                                <span className="text-xs uppercase tracking-wide font-semibold">{road.congestion_level}</span>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────

function DashboardContent() {
    const { user, logout } = useAuth();
    const router = useRouter();

    const visibleTabs = getTabsForRole(user!.role);
    const [activeTab, setActiveTab] = useState<Tab>(visibleTabs[0].id);

    async function handleLogout() {
        await logout();
        router.push("/");
    }

    const badge = ROLE_BADGE[user!.role];
    const activeTabDef = visibleTabs.find((t) => t.id === activeTab) ?? visibleTabs[0];

    return (
        <main className="min-h-screen bg-slate-950 p-4">
            <div className="max-w-lg mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <Navigation size={20} className="text-blue-400" />
                        <div>
                            <h1 className="text-white font-bold text-base leading-tight">
                                Espace {user!.role_display}
                            </h1>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <span className={`inline-flex items-center gap-1 border text-xs px-2 py-0.5 rounded-full ${badge.color}`}>
                                    {badge.icon}
                                    {user!.role_display}
                                </span>
                                <span className="text-slate-500 text-xs">{user!.username}</span>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white p-2 rounded-lg transition-colors"
                        title="Déconnexion"
                    >
                        <LogOut size={16} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 bg-slate-900 border border-slate-700 rounded-xl p-1 mb-4">
                    {visibleTabs.map(({ id, label, icon }) => (
                        <button
                            key={id}
                            onClick={() => setActiveTab(id)}
                            className={`flex-1 flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-xs font-medium transition-all ${
                                activeTab === id
                                    ? "bg-blue-600 text-white shadow"
                                    : "text-slate-400 hover:text-white"
                            }`}
                        >
                            {icon}
                            <span className="hidden sm:block">{label}</span>
                        </button>
                    ))}
                </div>

                {/* Panel */}
                <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 shadow-xl">
                    <h2 className="text-white font-semibold text-sm mb-4 flex items-center gap-2">
                        {activeTabDef.icon}
                        {activeTabDef.label}
                    </h2>
                    {activeTab === "blocked" && <BlockedRoadsTab />}
                    {activeTab === "path" && <BestPathTab />}
                    {activeTab === "departure" && <DeparturePredictionTab />}
                    {activeTab === "management" && <TrafficManagementTab />}
                </div>
            </div>
        </main>
    );
}

export default function DashboardPage() {
    return (
        <RequireAuth>
            <DashboardContent />
        </RequireAuth>
    );
}
