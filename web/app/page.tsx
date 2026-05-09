"use client";

import { useState, useCallback } from "react";
import Scene from "@/components/world/Scene";
import HUD from "@/components/ui/HUD";
import ChatbotUI from "@/components/ui/ChatbotUI";

export default function Home() {
    const [hour, setHour] = useState(8);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [roadInfo, setRoadInfo] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const handleLoadingChange = useCallback((loading: boolean) => {
        setIsLoading(loading);
    }, []);

    return (
        <main className="relative w-screen h-screen overflow-hidden bg-slate-900">
            <Scene
                hour={hour}
                onRoadInfo={setRoadInfo}
                onLoadingChange={handleLoadingChange}
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
            <ChatbotUI
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
            />
        </main>
    );
}
