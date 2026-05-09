"use client";

import { useState, useCallback } from "react";
import Scene from "@/components/world/Scene";
import HUD from "@/components/ui/HUD";
import ChatbotUI from "@/components/ui/ChatbotUI";
import TrafficStatsPanel from "@/components/ui/TrafficStatsPanel";
import AccidentPanel from "@/components/ui/AccidentPanel";
import LandingPage from "@/components/ui/LandingPage";
import { AnimatePresence, motion } from "framer-motion";
import type { TrafficMetrics } from "@/components/simulation/CarSystem";
import type { AccidentEvent } from "@/components/simulation/accidentTypes";

export default function Home() {
    const [showSimulation, setShowSimulation] = useState(false);
    const [hour, setHour] = useState(8);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [roadInfo, setRoadInfo] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [metrics, setMetrics] = useState<TrafficMetrics | null>(null);
    const [accidents, setAccidents] = useState<AccidentEvent[]>([]);

    const handleLoadingChange = useCallback((loading: boolean) => {
        setIsLoading(loading);
    }, []);

    const handleAccident = useCallback((event: AccidentEvent) => {
        setAccidents((prev) => {
            if (prev.some((a) => a.id === event.id)) return prev;
            return [event, ...prev];
        });
    }, []);

    const handleDismiss = useCallback((id: string) => {
        setAccidents((prev) => prev.filter((a) => a.id !== id));
    }, []);

    return (
        <main className="relative w-screen h-screen overflow-hidden bg-slate-950">
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
                        className="relative w-full h-full"
                    >
                        <Scene
                            hour={hour}
                            onRoadInfo={setRoadInfo}
                            onLoadingChange={handleLoadingChange}
                            onMetrics={setMetrics}
                            onAccident={handleAccident}
                            accidents={accidents}
                        />

                        {/* Road info popup */}
                        {roadInfo && (
                            <div
                                className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 
                                           bg-slate-950/95 backdrop-blur-lg border border-slate-600 
                                           text-white p-5 rounded-2xl shadow-2xl z-50 whitespace-pre-line 
                                           text-sm min-w-[220px]"
                            >
                                {roadInfo}
                                <button
                                    onClick={() => setRoadInfo(null)}
                                    className="block mt-4 text-xs text-blue-400 hover:text-white underline"
                                >
                                    Fermer ✕
                                </button>
                            </div>
                        )}

                        <HUD
                            hour={hour}
                            setHour={setHour}
                            toggleChat={() => setIsChatOpen(!isChatOpen)}
                            isLoading={isLoading}
                        />

                        {/* Real-time traffic stats panel — top-right */}
                        <div className="fixed top-5 right-16 z-40 pointer-events-none">
                            <TrafficStatsPanel metrics={metrics} />
                        </div>

                        <ChatbotUI
                            isOpen={isChatOpen}
                            onClose={() => setIsChatOpen(false)}
                        />

                        <AccidentPanel accidents={accidents} onDismiss={handleDismiss} />
                    </motion.div>
                )}
            </AnimatePresence>
        </main>
    );
}
