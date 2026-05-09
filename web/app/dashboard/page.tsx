"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
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
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
    fetchBlockedRoads,
    fetchBestPath,
    fetchDeparturePrediction,
    type BlockedRoad,
    type PathResult,
    type DeparturePrediction,
} from "@/lib/api";

type Tab = "blocked" | "path" | "departure";

const TAB_ITEMS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "blocked", label: "Routes bloquées", icon: <AlertTriangle size={16} /> },
    { id: "path", label: "Meilleur chemin", icon: <Route size={16} /> },
    { id: "departure", label: "Heure de sortie", icon: <Clock size={16} /> },
];

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

// --- Sub-components (SRP: each renders one concern) ---

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
                    {count > 0 ? `${count} route(s) congestionnée(s) en ce moment` : "Aucune route bloquée"}
                </p>
                <button
                    onClick={load}
                    disabled={loading}
                    className="text-blue-400 hover:text-blue-300 disabled:opacity-50 transition-colors"
                    title="Actualiser"
                >
                    <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                </button>
            </div>

            {error && (
                <p className="text-red-400 text-sm bg-red-950/30 border border-red-800 rounded-lg px-3 py-2 mb-3">
                    {error}
                </p>
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
                        <li
                            key={road.id}
                            className={`flex items-center justify-between border rounded-lg px-3 py-2.5 text-sm ${CONGESTION_COLORS[road.congestion_level]}`}
                        >
                            <span className="font-medium truncate mr-2">{road.name}</span>
                            <span className="shrink-0 text-xs uppercase tracking-wide font-semibold">
                                {road.congestion_level}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function BestPathTab() {
    const [startLat, setStartLat] = useState("-18.914");
    const [startLng, setStartLng] = useState("47.536");
    const [endLat, setEndLat] = useState("-18.893");
    const [endLng, setEndLng] = useState("47.532");
    const [result, setResult] = useState<PathResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const res = await fetchBestPath(
                parseFloat(startLat),
                parseFloat(startLng),
                parseFloat(endLat),
                parseFloat(endLng)
            );
            setResult(res);
        } catch {
            setError("Impossible de calculer l'itinéraire. Vérifiez les coordonnées.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div>
            <p className="text-slate-400 text-sm mb-4">
                Entrez les coordonnées GPS de votre départ et de votre destination.
            </p>
            <form onSubmit={handleSubmit} className="space-y-3">
                <fieldset>
                    <legend className="text-slate-300 text-xs font-semibold uppercase tracking-wide mb-2">
                        Point de départ
                    </legend>
                    <div className="grid grid-cols-2 gap-2">
                        <input
                            type="number"
                            step="any"
                            value={startLat}
                            onChange={(e) => setStartLat(e.target.value)}
                            required
                            placeholder="Latitude"
                            className="bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                        />
                        <input
                            type="number"
                            step="any"
                            value={startLng}
                            onChange={(e) => setStartLng(e.target.value)}
                            required
                            placeholder="Longitude"
                            className="bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                        />
                    </div>
                </fieldset>

                <fieldset>
                    <legend className="text-slate-300 text-xs font-semibold uppercase tracking-wide mb-2">
                        Destination
                    </legend>
                    <div className="grid grid-cols-2 gap-2">
                        <input
                            type="number"
                            step="any"
                            value={endLat}
                            onChange={(e) => setEndLat(e.target.value)}
                            required
                            placeholder="Latitude"
                            className="bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                        />
                        <input
                            type="number"
                            step="any"
                            value={endLng}
                            onChange={(e) => setEndLng(e.target.value)}
                            required
                            placeholder="Longitude"
                            className="bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                        />
                    </div>
                </fieldset>

                {error && (
                    <p className="text-red-400 text-sm bg-red-950/30 border border-red-800 rounded-lg px-3 py-2">
                        {error}
                    </p>
                )}

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
                >
                    {loading ? (
                        <Loader2 size={14} className="animate-spin" />
                    ) : (
                        <ChevronRight size={14} />
                    )}
                    Calculer le meilleur chemin
                </button>
            </form>

            {result && (
                <div className="mt-4 bg-green-950/30 border border-green-700 rounded-lg px-4 py-3 space-y-1">
                    <p className="text-green-300 font-semibold text-sm">Itinéraire trouvé</p>
                    <p className="text-slate-300 text-sm">
                        Distance : <span className="text-white font-medium">{result.distance_km?.toFixed(1) ?? "—"} km</span>
                    </p>
                    <p className="text-slate-300 text-sm">
                        Durée estimée : <span className="text-white font-medium">{result.duration_minutes ?? "—"} min</span>
                    </p>
                </div>
            )}
        </div>
    );
}

function DeparturePredictionTab() {
    const [originLat, setOriginLat] = useState("-18.914");
    const [originLng, setOriginLng] = useState("47.536");
    const [destLat, setDestLat] = useState("-18.893");
    const [destLng, setDestLng] = useState("47.532");
    const [arrivalTime, setArrivalTime] = useState("08:00");
    const [result, setResult] = useState<DeparturePrediction | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const res = await fetchDeparturePrediction(
                parseFloat(originLat),
                parseFloat(originLng),
                parseFloat(destLat),
                parseFloat(destLng),
                arrivalTime
            );
            setResult(res);
        } catch {
            setError("Impossible de calculer la prédiction. Vérifiez les données.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div>
            <p className="text-slate-400 text-sm mb-4">
                Indiquez votre trajet et l&apos;heure d&apos;arrivée souhaitée pour connaître
                la meilleure heure de départ.
            </p>
            <form onSubmit={handleSubmit} className="space-y-3">
                <fieldset>
                    <legend className="text-slate-300 text-xs font-semibold uppercase tracking-wide mb-2">
                        Départ
                    </legend>
                    <div className="grid grid-cols-2 gap-2">
                        <input
                            type="number"
                            step="any"
                            value={originLat}
                            onChange={(e) => setOriginLat(e.target.value)}
                            required
                            placeholder="Latitude"
                            className="bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                        />
                        <input
                            type="number"
                            step="any"
                            value={originLng}
                            onChange={(e) => setOriginLng(e.target.value)}
                            required
                            placeholder="Longitude"
                            className="bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                        />
                    </div>
                </fieldset>

                <fieldset>
                    <legend className="text-slate-300 text-xs font-semibold uppercase tracking-wide mb-2">
                        Destination
                    </legend>
                    <div className="grid grid-cols-2 gap-2">
                        <input
                            type="number"
                            step="any"
                            value={destLat}
                            onChange={(e) => setDestLat(e.target.value)}
                            required
                            placeholder="Latitude"
                            className="bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                        />
                        <input
                            type="number"
                            step="any"
                            value={destLng}
                            onChange={(e) => setDestLng(e.target.value)}
                            required
                            placeholder="Longitude"
                            className="bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                        />
                    </div>
                </fieldset>

                <div>
                    <label className="block text-slate-300 text-xs font-semibold uppercase tracking-wide mb-2">
                        Heure d&apos;arrivée souhaitée
                    </label>
                    <input
                        type="time"
                        value={arrivalTime}
                        onChange={(e) => setArrivalTime(e.target.value)}
                        required
                        className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    />
                </div>

                {error && (
                    <p className="text-red-400 text-sm bg-red-950/30 border border-red-800 rounded-lg px-3 py-2">
                        {error}
                    </p>
                )}

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
                >
                    {loading ? (
                        <Loader2 size={14} className="animate-spin" />
                    ) : (
                        <ChevronRight size={14} />
                    )}
                    Calculer l&apos;heure de sortie idéale
                </button>
            </form>

            {result && (
                <div className="mt-4 bg-blue-950/30 border border-blue-700 rounded-lg px-4 py-3 space-y-2">
                    <p className="text-blue-300 font-semibold text-sm">Recommandation</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="bg-slate-800/60 rounded-lg p-2 text-center">
                            <p className="text-slate-400 text-xs">Départ recommandé</p>
                            <p className="text-white font-bold text-base mt-0.5">
                                {result.recommended_departure}
                            </p>
                        </div>
                        <div className="bg-slate-800/60 rounded-lg p-2 text-center">
                            <p className="text-slate-400 text-xs">Durée estimée</p>
                            <p className="text-white font-bold text-base mt-0.5">
                                {result.duration_minutes} min
                            </p>
                        </div>
                    </div>
                    <p className="text-slate-400 text-xs">
                        Trafic :{" "}
                        <span className="text-slate-200">
                            {PEAK_LABELS[result.peak_label] ?? result.peak_label}
                        </span>
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
        </div>
    );
}

// --- Main Dashboard ---

export default function DashboardPage() {
    const { user, logout, isLoading } = useAuth();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<Tab>("blocked");

    useEffect(() => {
        if (!isLoading && !user) {
            router.replace("/auth");
        }
    }, [isLoading, user, router]);

    if (isLoading || !user) {
        return (
            <main className="min-h-screen bg-slate-950 flex items-center justify-center">
                <Loader2 size={32} className="animate-spin text-blue-400" />
            </main>
        );
    }

    async function handleLogout() {
        await logout();
        router.push("/");
    }

    return (
        <main className="min-h-screen bg-slate-950 p-4">
            <div className="max-w-lg mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <Navigation size={20} className="text-blue-400" />
                        <div>
                            <h1 className="text-white font-bold text-base leading-tight">
                                Espace {user.role_display}
                            </h1>
                            <p className="text-slate-400 text-xs">{user.username}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => router.push("/")}
                            className="text-slate-400 hover:text-white text-xs transition-colors"
                        >
                            Simulation →
                        </button>
                        <button
                            onClick={handleLogout}
                            className="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white p-2 rounded-lg transition-colors"
                            title="Déconnexion"
                        >
                            <LogOut size={16} />
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 bg-slate-900 border border-slate-700 rounded-xl p-1 mb-4">
                    {TAB_ITEMS.map(({ id, label, icon }) => (
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
                        {TAB_ITEMS.find((t) => t.id === activeTab)?.icon}
                        {TAB_ITEMS.find((t) => t.id === activeTab)?.label}
                    </h2>
                    {activeTab === "blocked" && <BlockedRoadsTab />}
                    {activeTab === "path" && <BestPathTab />}
                    {activeTab === "departure" && <DeparturePredictionTab />}
                </div>
            </div>
        </main>
    );
}
