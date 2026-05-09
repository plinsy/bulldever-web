"use client";

import { Navigation, MessageSquare, Loader2 } from "lucide-react";

interface HUDProps {
    hour: number;
    setHour: (h: number) => void;
    toggleChat: () => void;
    isLoading?: boolean;
    retryAttempt?: number;
}

export default function HUD({ toggleChat, isLoading, retryAttempt = 0 }: HUDProps) {
    return (
        <div className="fixed inset-0 pointer-events-none p-5 flex flex-col justify-between">
            {/* Top Bar */}
            <div className="flex justify-between items-start pointer-events-auto">
                <div className="bg-slate-950/85 backdrop-blur-lg border border-slate-700/60 px-5 py-3 rounded-2xl shadow-2xl">
                    <div className="flex items-center gap-3">
                        <Navigation size={18} className="text-blue-400" />
                        <div>
                            <h1 className="text-white font-bold text-base leading-tight tracking-tight">
                                Jumeau Numérique · Antananarivo
                            </h1>
                            <p className="text-slate-400 text-xs">Données routières temps réel — OpenStreetMap</p>
                        </div>
                    </div>
                    {isLoading && (
                        <div className="flex items-center gap-2 mt-2 text-blue-400 text-xs">
                            <Loader2 size={12} className="animate-spin" />
                            {retryAttempt > 1
                                ? `Nouvelle tentative ${retryAttempt}…`
                                : "Chargement du réseau routier…"}
                        </div>
                    )}
                </div>

                <button
                    onClick={toggleChat}
                    className="bg-blue-600 hover:bg-blue-500 active:scale-95 text-white p-3 rounded-full shadow-2xl transition-all"
                >
                    <MessageSquare size={22} />
                </button>
            </div>
        </div>
    );
}
