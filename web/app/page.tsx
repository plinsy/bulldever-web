"use client";

import { useState, useCallback, useEffect } from "react";
import Scene from "@/components/world/Scene";
import HUD from "@/components/ui/HUD";
import ChatbotUI from "@/components/ui/ChatbotUI";
import TrafficStatsPanel from "@/components/ui/TrafficStatsPanel";
import AccidentPanel from "@/components/ui/AccidentPanel";
import LandingPage from "@/components/ui/LandingPage";
import ManualRoutingPanel from "@/components/ui/ManualRoutingPanel";
import { AnimatePresence, motion } from "framer-motion";
import type { TrafficMetrics } from "@/components/simulation/CarSystem";
import type { AccidentEvent } from "@/components/simulation/accidentTypes";
import { INITIAL_CENTER, LatLng } from "@/components/world/geo";
import { useTrafficSocket } from "@/hooks/useTrafficSocket";
import { AlertTriangle, X, Maximize, Minimize } from "lucide-react";

export default function Home() {
    const [showSimulation, setShowSimulation] = useState(false);
    const [hour, setHour] = useState(8);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [roadInfo, setRoadInfo] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [metrics, setMetrics] = useState<TrafficMetrics | null>(null);
    const [accidents, setAccidents] = useState<AccidentEvent[]>([]);
    const [userLocation, setUserLocation] = useState<LatLng>(INITIAL_CENTER);
    const [isFullscreen, setIsFullscreen] = useState(true);

    const { isConnected, sendSnapshot, sendAccident, alerts, clearAlerts } = useTrafficSocket();

    // Send traffic snapshot to WebSocket whenever metrics update
    useEffect(() => {
        if (metrics) {
            sendSnapshot(metrics);
        }
    }, [metrics, sendSnapshot]);

    const handleLoadingChange = useCallback((loading: boolean) => {
        setIsLoading(loading);
    }, []);

    const handleAccident = useCallback((event: AccidentEvent) => {
        setAccidents((prev) => {
            if (prev.some((a) => a.id === event.id)) return prev;
            // Send accident to WebSocket
            sendAccident(event);
            // Enforce at most 1 corporel + 1 matériel on the map at any time:
            // drop any existing accident of the same type before adding the new one.
            const withoutSameType = prev.filter((a) => a.bodily !== event.bodily);
            return [event, ...withoutSameType];
        });
    }, [sendAccident]);

    const handleDismiss = useCallback((id: string) => {
        setAccidents((prev) => prev.filter((a) => a.id !== id));
    }, []);

    return (
        <main data-theme="night" className="relative w-screen h-screen overflow-hidden bg-base-100">
            <AnimatePresence mode="wait">
                {!showSimulation ? (
                    <motion.div
                        key="landing"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, scale: 1.1 }}
                        transition={{ duration: 0.8 }}
                        className="absolute inset-0 z-[100]"
                    >
                        <LandingPage onEnter={() => setShowSimulation(true)} />
                    </motion.div>
                ) : (
                    <motion.div
                        key="simulation"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 1 }}
                        className="relative w-full h-full flex flex-col bg-slate-950"
                    >
                        {/* Map Container */}
                        <div className={`relative transition-all duration-700 ease-in-out ${isFullscreen ? 'flex-1' : 'h-[45vh] mx-4 mt-4 rounded-[2rem] overflow-hidden shadow-2xl border border-slate-700/50 shrink-0'}`}>
                            
                            <Scene
                                hour={hour}
                                onRoadInfo={setRoadInfo}
                                onLoadingChange={handleLoadingChange}
                                onMetrics={setMetrics}
                                onAccident={handleAccident}
                                accidents={accidents}
                                onUserLocation={setUserLocation}
                            />

                            {/* Congestion Alerts Overlay */}
                            {alerts.length > 0 && (
                                <div className="absolute top-24 left-1/2 -translate-x-1/2 flex flex-col gap-2 z-50 pointer-events-none w-full max-w-md">
                                    {alerts.map((alert, i) => (
                                        <motion.div
                                            key={i}
                                            initial={{ opacity: 0, y: -20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl shadow-2xl backdrop-blur-md border ${
                                                alert.level === 'danger' ? 'bg-red-500/20 border-red-500/50 text-red-100' : 'bg-orange-500/20 border-orange-500/50 text-orange-100'
                                            }`}
                                        >
                                            <AlertTriangle className={alert.level === 'danger' ? 'text-red-400' : 'text-orange-400'} size={24} />
                                            <div className="flex-1">
                                                <h4 className="font-bold">{alert.level === 'danger' ? 'Congestion Sévère' : 'Congestion Modérée'}</h4>
                                                <p className="text-sm opacity-90">{alert.message}</p>
                                            </div>
                                        </motion.div>
                                    ))}
                                    <button onClick={clearAlerts} className="pointer-events-auto self-center mt-2 btn btn-xs btn-ghost text-white/50 hover:text-white">
                                        <X size={14} className="mr-1"/> Fermer
                                    </button>
                                </div>
                            )}

                            {/* Road info popup */}
                            {roadInfo && (
                                <div className="absolute inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
                                    <motion.div 
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="card bg-base-300/95 backdrop-blur-xl border border-white/10 shadow-2xl p-6 max-w-sm w-full pointer-events-auto"
                                    >
                                        <div className="flex flex-col gap-4">
                                            <div className="text-white whitespace-pre-line text-sm leading-relaxed">
                                                {roadInfo}
                                            </div>
                                            <button
                                                onClick={() => setRoadInfo(null)}
                                                className="btn btn-primary btn-sm rounded-xl"
                                            >
                                                Fermer
                                            </button>
                                        </div>
                                    </motion.div>
                                </div>
                            )}

                            {/* Floating Stats Panel (only if fullscreen) */}
                            {isFullscreen && (
                                <div className="absolute top-20 right-4 md:top-24 md:right-6 z-40 pointer-events-none">
                                    <TrafficStatsPanel metrics={metrics} />
                                </div>
                            )}
                        </div>

                        {/* Bottom Dashboard Pane (only if NOT fullscreen) */}
                        {!isFullscreen && (
                            <motion.div 
                                initial={{ opacity: 0, y: 50 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: 0.2 }}
                                className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col md:flex-row gap-8 items-start justify-center"
                            >
                                <ManualRoutingPanel userLocation={userLocation} />
                                
                                <div className="w-full max-w-md">
                                    <TrafficStatsPanel metrics={metrics} />
                                </div>
                            </motion.div>
                        )}

                        <HUD
                            hour={hour}
                            setHour={setHour}
                            toggleChat={() => setIsChatOpen(!isChatOpen)}
                            isLoading={isLoading}
                            isFullscreen={isFullscreen}
                            toggleFullscreen={() => setIsFullscreen(!isFullscreen)}
                        />

                        <ChatbotUI
                            isOpen={isChatOpen}
                            onClose={() => setIsChatOpen(false)}
                            center={userLocation}
                        />

                        <AccidentPanel accidents={accidents} onDismiss={handleDismiss} />
                    </motion.div>
                )}
            </AnimatePresence>
        </main>
    );
}
