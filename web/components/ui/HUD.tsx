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
        <div className="fixed inset-x-0 top-0 pointer-events-none p-4 z-50">
            <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                {/* Brand & Loading */}
                <div className="pointer-events-auto bg-base-300/80 backdrop-blur-md border border-white/10 p-4 rounded-2xl shadow-xl min-w-[200px]">
                    <div className="flex items-center gap-3">
                        <div className="bg-primary/20 p-2 rounded-xl">
                            <Navigation size={20} className="text-primary" />
                        </div>
                        <div>
                            <h1 className="text-white font-bold text-lg leading-none tracking-tight">
                                AlaminoAI
                            </h1>
                            {isLoading && (
                                <div className="flex items-center gap-2 mt-1 text-primary text-[10px] font-medium uppercase tracking-wider">
                                    <Loader2 size={10} className="animate-spin" />
                                    {retryAttempt > 1
                                        ? `Retry ${retryAttempt}…`
                                        : "Syncing OSM…"}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Mobile FAB Chat - Only on small screens it might need different placement, 
                    but let's keep it top right for consistency with existing code unless asked. */}
                <div className="flex flex-col gap-2 pointer-events-auto items-end">
                    <button
                        onClick={toggleChat}
                        className="btn btn-primary btn-circle shadow-lg hover:scale-110 transition-transform"
                    >
                        <MessageSquare size={20} />
                    </button>
                </div>
            </div>
        </div>
    );
}
