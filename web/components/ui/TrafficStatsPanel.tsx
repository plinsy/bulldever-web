"use client";

import { useState, useEffect } from "react";
import { Car, StopCircle, GitFork, Gauge, AlertTriangle } from "lucide-react";
import type { TrafficMetrics } from "@/components/simulation/CarSystem";

const API_BASE = "http://127.0.0.1:8000/api";

interface TrafficStatsPanelProps {
    metrics: TrafficMetrics | null;
}

function zoneStatusClass(stoppedPct: number): string {
    if (stoppedPct > 40) return "badge-error";
    if (stoppedPct > 20) return "badge-warning";
    return "badge-success";
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
                if (!res.ok) return;
                const data = await res.json();
                if (data.status === "ok") setAlerts(data.alerts || []);
            } catch {}
        };
        const interval = setInterval(fetchPredictions, 10000);
        fetchPredictions();
        return () => clearInterval(interval);
    }, []);

    if (!metrics) return null;

    const stoppedPct = metrics.totalCars > 0 ? Math.round((metrics.stoppedCars / metrics.totalCars) * 100) : 0;
    const congestionStatus = stoppedPct > 40 ? "text-error" : stoppedPct > 20 ? "text-warning" : "text-success";

    const zoneRows = STATIC_ZONES.map((zone) => {
        const stat = metrics.zoneStats[zone.id] ?? { total: 0, stopped: 0 };
        const pct = stat.total > 0 ? Math.round((stat.stopped / stat.total) * 100) : 0;
        return { zone, stat, pct };
    }).filter(row => row.stat.total > 0).sort((a, b) => b.pct - a.pct);

    return (
        <div className="flex flex-col gap-4 max-w-[320px] pointer-events-auto">
            {/* Main Stats Grid */}
            <div className="stats stats-vertical bg-base-300/80 backdrop-blur-md border border-white/10 shadow-2xl overflow-hidden rounded-2xl">
                <div className="stat py-3">
                    <div className="stat-figure text-primary">
                        <Car size={24} />
                    </div>
                    <div className="stat-title text-[10px] uppercase font-bold tracking-widest opacity-60">Actifs</div>
                    <div className="stat-value text-2xl text-white">{metrics.totalCars}</div>
                </div>

                <div className="stat py-3">
                    <div className="stat-figure text-secondary">
                        <StopCircle size={24} className={congestionStatus} />
                    </div>
                    <div className="stat-title text-[10px] uppercase font-bold tracking-widest opacity-60">À l'arrêt</div>
                    <div className="stat-value text-2xl text-white">
                        {metrics.stoppedCars}
                        <span className={`text-xs ml-2 font-bold ${congestionStatus}`}>{stoppedPct}%</span>
                    </div>
                </div>

                <div className="stat py-3">
                    <div className="stat-figure text-accent">
                        <Gauge size={24} />
                    </div>
                    <div className="stat-title text-[10px] uppercase font-bold tracking-widest opacity-60">Vitesse Moy.</div>
                    <div className="stat-value text-2xl text-white">{metrics.avgSpeedKmh} <span className="text-xs opacity-50">km/h</span></div>
                </div>
            </div>

            {/* AI Alerts */}
            {alerts.length > 0 && (
                <div className="flex flex-col gap-2">
                    {alerts.map((alert, idx) => (
                        <div key={idx} className={`alert shadow-lg py-2 text-xs border-0 ${
                            alert.level === 'danger' ? 'alert-error bg-error/20' : 'alert-warning bg-warning/20'
                        }`}>
                            <AlertTriangle size={14} />
                            <span>{alert.message}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Zone Breakdown */}
            {zoneRows.length > 0 && (
                <div className="collapse bg-base-200/60 backdrop-blur-sm border border-white/5 rounded-2xl shadow-lg">
                    <input type="checkbox" className="peer" defaultChecked /> 
                    <div className="collapse-title text-[10px] uppercase font-bold tracking-widest opacity-60 flex items-center justify-between">
                        Détails par Zone
                        <span className="badge badge-outline badge-xs">{zoneRows.length} zones</span>
                    </div>
                    <div className="collapse-content px-4 pb-4">
                        <div className="space-y-3">
                            {zoneRows.map(({ zone, stat, pct }) => (
                                <div key={zone.id} className="flex flex-col gap-1">
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="font-semibold text-white/90">{zone.label}</span>
                                        <span className={`badge badge-xs font-bold ${zoneStatusClass(pct)}`}>
                                            {pct}%
                                        </span>
                                    </div>
                                    <progress 
                                        className={`progress w-full h-1.5 ${pct > 40 ? "progress-error" : pct > 20 ? "progress-warning" : "progress-success"}`} 
                                        value={pct} 
                                        max="100" 
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
