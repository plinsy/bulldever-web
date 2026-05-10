"use client";

import { Navigation, MessageSquare, Loader2, User } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";

interface HUDProps {
    hour: number;
    setHour: (h: number) => void;
    toggleChat: () => void;
    isLoading?: boolean;
    retryAttempt?: number;
}

export default function HUD({ toggleChat, isLoading, retryAttempt = 0 }: HUDProps) {
    const { user } = useAuth();

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

                <div className="flex items-center gap-2 pointer-events-auto">
                    {/* Auth / Dashboard Link */}
                    <Link
                        href={user ? "/dashboard" : "/auth"}
                        className="btn btn-ghost bg-base-300/80 backdrop-blur-md border-white/10 rounded-full shadow-lg hover:scale-105 transition-transform flex items-center gap-2 px-4"
                        title={user ? `Espace ${user.role_display}` : "Connexion"}
                    >
                        <User size={18} className="text-slate-300" />
                        {user && (
                            <span className="text-xs font-bold text-white max-w-[80px] truncate hidden sm:block">
                                {user.username}
                            </span>
                        )}
                    </Link>

                    {/* Chat Toggle */}
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
