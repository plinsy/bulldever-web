"use client";

import { useState, useEffect } from "react";
import { Car, StopCircle, GitFork, Gauge } from "lucide-react";
import type { TrafficMetrics } from "@/components/simulation/CarSystem";

const API_BASE = "http://localhost:8000/api";

interface TrafficStatsPanelProps {
    metrics: TrafficMetrics | null;
}

interface StatRowProps {
    icon: React.ReactNode;
    label: string;
    value: string | number;
    sub?: string;
    accent?: string;
}

function StatRow({ icon, label, value, sub, accent = "text-blue-400" }: StatRowProps) {
    return (
        <div className="flex items-center gap-3 py-1.5">
            <span className={`shrink-0 ${accent}`}>{icon}</span>
            <span className="text-slate-400 text-xs flex-1">{label}</span>
            <span className="text-white font-mono text-sm font-semibold">{value}</span>
            {sub && <span className="text-slate-500 text-xs">{sub}</span>}
        </div>
    );
}

function zoneStatusDot(stoppedPct: number): { dot: string; label: string; bar: string } {
    if (stoppedPct > 40) return { dot: "bg-red-500",    label: "Saturé",  bar: "bg-red-500" };
    if (stoppedPct > 20) return { dot: "bg-orange-400", label: "Ralenti", bar: "bg-orange-400" };
    return                       { dot: "bg-green-500", label: "Fluide",  bar: "bg-green-500" };
}

const STATIC_ZONES = [
    { id: "analakely",   label: "Analakely" },
    { id: "anosizato",   label: "Anosizato" },
    { id: "isotry",      label: "Isotry" },
    { id: "67ha",        label: "67 Ha" },
    { id: "ambohijatovo",label: "Ambohijatovo" },
    { id: "tsaralalana", label: "Tsaralalana" },
    { id: "ankorondrano",label: "Ankorondrano" },
    { id: "behoririka",  label: "Behoririka" },
];

export default function TrafficStatsPanel({ metrics }: TrafficStatsPanelProps) {
    const [alerts, setAlerts] = useState<any[]>([]);

    useEffect(() => {
        const fetchPredictions = async () => {
            try {
                const res = await fetch(`${API_BASE}/predict-congestion/`);
                if (!res.ok) {
                    console.warn(`Prediction API returned status ${res.status}`);
                    return;
                }
                const contentType = res.headers.get("content-type");
                if (!contentType || !contentType.includes("application/json")) {
                    console.warn("Prediction API did not return JSON");
                    return;
                }
                const data = await res.json();
                if (data.status === "ok") {
                    setAlerts(data.alerts || []);
                }
            } catch (err) {
                console.error("Failed to fetch predictions", err);
            }
        };

        const interval = setInterval(fetchPredictions, 10000); // 10s
        fetchPredictions();
        return () => clearInterval(interval);
    }, []);

    if (!metrics) return null;

    const stoppedPct =
        metrics.totalCars > 0
            ? Math.round((metrics.stoppedCars / metrics.totalCars) * 100)
            : 0;

    const congestionColor =
        stoppedPct > 40 ? "text-red-400" : stoppedPct > 20 ? "text-orange-400" : "text-green-400";

    const zoneRows = STATIC_ZONES.map((zone) => {
        const stat = metrics.zoneStats[zone.id] ?? { total: 0, stopped: 0 };
        const pct = stat.total > 0 ? Math.round((stat.stopped / stat.total) * 100) : 0;
        const status = zoneStatusDot(pct);
        return { zone, stat, pct, status };
    }).filter(row => row.stat.total > 0); // Only show zones with active traffic in current tile

    zoneRows.sort((a, b) => b.pct - a.pct || b.stat.total - a.stat.total);

    const topIntersections = Object.entries(metrics.intersectionCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3);

    return (
        <div className="bg-slate-950/85 backdrop-blur-lg border border-slate-700/60 rounded-2xl shadow-2xl p-4 w-[260px] max-h-[85vh] overflow-y-auto">
            <p className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">
                Métriques temps réel
            </p>

            <StatRow icon={<Car size={15} />}        label="Véhicules actifs" value={metrics.totalCars} />
            <StatRow
                icon={<StopCircle size={15} />}
                label="À l'arrêt"
                value={`${metrics.stoppedCars} (${stoppedPct}%)`}
                accent={congestionColor}
            />
            <StatRow icon={<GitFork size={15} />}    label="En intersection"  value={metrics.carsInIntersections} accent="text-yellow-400" />
            <StatRow icon={<Gauge size={15} />}      label="Vitesse moy."     value={metrics.avgSpeedKmh} sub="km/h" accent="text-purple-400" />

            {/* Alerts section */}
            {alerts.length > 0 && (
                <>
                    <p className="text-red-400 text-xs mt-3 mb-2 uppercase tracking-wider font-bold animate-pulse">
                        ⚠️ Alertes & Prévisions
                    </p>
                    <div className="space-y-1.5 mb-3">
                        {alerts.map((alert, idx) => (
                            <div key={idx} className={`text-[10px] p-2 rounded border ${
                                alert.level === 'danger' ? 'bg-red-500/20 border-red-500/40 text-red-200' : 'bg-orange-500/20 border-orange-500/40 text-orange-200'
                            }`}>
                                {alert.message}
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* Per-zone breakdown */}
            {zoneRows.length > 0 && (
                <>
                    <p className="text-slate-500 text-xs mt-3 mb-2 uppercase tracking-wider">
                        État par zone
                    </p>
                    <div className="space-y-1.5">
                        {zoneRows.map(({ zone, stat, pct, status }) => (
                            <div key={zone.id} className="rounded-lg bg-slate-900/60 border border-slate-700/40 px-3 py-2">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={`w-2 h-2 rounded-full shrink-0 ${status.dot}`} />
                                    <span className="text-white text-xs font-medium flex-1">{zone.label}</span>
                                    <span className={`text-xs font-semibold ${
                                        pct > 40 ? "text-red-400" : pct > 20 ? "text-orange-400" : "text-green-400"
                                    }`}>
                                        {status.label}
                                    </span>
                                </div>
                                <div className="flex gap-3 text-xs text-slate-400 pl-4">
                                    <span><span className="text-white font-mono">{stat.total}</span> véh.</span>
                                    <span><span className="text-red-400 font-mono">{stat.stopped}</span> arrêtés</span>
                                    {stat.total > 0 && (
                                        <span className="ml-auto text-slate-500">{pct}%</span>
                                    )}
                                </div>
                                {/* Congestion bar */}
                                <div className="mt-1.5 pl-4">
                                    <div className="h-1 w-full bg-slate-700 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all duration-500 ${status.bar}`}
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {topIntersections.length > 0 && (
                <>
                    <p className="text-slate-500 text-xs mt-3 mb-1 uppercase tracking-wider">
                        Intersections saturées
                    </p>
                    {topIntersections.map(([id, count]) => (
                        <div key={id} className="flex justify-between text-xs py-0.5">
                            <span className="text-slate-400">Intersection #{id}</span>
                            <span className="text-white font-mono">{count} véh.</span>
                        </div>
                    ))}
                </>
            )}
        </div>
    );
}
