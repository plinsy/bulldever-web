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
            // Enforce at most 1 corporel + 1 matériel on the map at any time:
            // drop any existing accident of the same type before adding the new one.
            const withoutSameType = prev.filter((a) => a.bodily !== event.bodily);
            return [event, ...withoutSameType];
        });
    }, []);

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
                            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
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

                        <HUD
                            hour={hour}
                            setHour={setHour}
                            toggleChat={() => setIsChatOpen(!isChatOpen)}
                            isLoading={isLoading}
                        />

                        {/* Real-time traffic stats panel — top-right responsive */}
                        <div className="fixed top-20 right-4 md:top-24 md:right-6 z-40 pointer-events-none">
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
