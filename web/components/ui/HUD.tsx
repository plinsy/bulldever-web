"use client";

import { Clock, Navigation, MessageSquare, Loader2 } from "lucide-react";

interface HUDProps {
    hour: number;
    setHour: (h: number) => void;
    toggleChat: () => void;
    isLoading?: boolean;
    retryAttempt?: number;
}

export default function HUD({ hour, setHour, toggleChat, isLoading, retryAttempt = 0 }: HUDProps) {
    const timeLabel = `${hour.toString().padStart(2, '0')}:00`;
    const peakLabel =
        (hour >= 7 && hour <= 9) ? "🔴 Heure de pointe (matin)"
        : (hour >= 16 && hour <= 19) ? "🔴 Heure de pointe (soir)"
        : (hour >= 10 && hour <= 15) ? "🟡 Trafic modéré"
        : "🟢 Trafic fluide";

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

            {/* Bottom Controls */}
            <div className="bg-slate-950/85 backdrop-blur-lg border border-slate-700/60 p-5 rounded-2xl shadow-2xl pointer-events-auto w-full max-w-lg mx-auto">
                <div className="flex items-center gap-4 mb-3">
                    <Clock size={18} className="text-blue-400 shrink-0" />
                    <span className="text-white font-mono text-lg w-16">{timeLabel}</span>
                    <input
                        type="range"
                        min="0"
                        max="23"
                        value={hour}
                        onChange={(e) => setHour(parseInt(e.target.value))}
                        className="flex-1 h-2 appearance-none bg-slate-700 rounded-full outline-none cursor-pointer accent-blue-500"
                    />
                </div>
                <p className="text-center text-sm text-slate-300">{peakLabel}</p>

                <div className="grid grid-cols-3 gap-2 text-center text-xs mt-3">
                    <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/40 text-green-400 font-medium">● Fluide</div>
                    <div className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/40 text-orange-400 font-medium">● Ralenti</div>
                    <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/40 text-red-400 font-medium">● Bouchon</div>
                </div>
            </div>
        </div>
    );
}
