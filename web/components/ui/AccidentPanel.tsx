"use client";

import { useState } from "react";
import { X, Phone, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { AccidentEvent } from "../simulation/accidentTypes";

interface AccidentPanelProps {
    accidents: AccidentEvent[];
    onDismiss: (id: string) => void;
}

const EMERGENCY_NUMBER = "117"; // Madagascar police/emergency

export default function AccidentPanel({ accidents, onDismiss }: AccidentPanelProps) {
    if (!accidents.length) return null;

    return (
        <div className="fixed bottom-28 left-5 z-50 flex flex-col gap-3 pointer-events-auto max-h-[60vh] overflow-y-auto pr-1">
            <AnimatePresence>
                {accidents.map((acc) => (
                    <AccidentCard key={acc.id} accident={acc} onDismiss={onDismiss} />
                ))}
            </AnimatePresence>
        </div>
    );
}

function AccidentCard({ accident, onDismiss }: { accident: AccidentEvent; onDismiss: (id: string) => void }) {
    const [expanded, setExpanded] = useState(true);
    const [called, setCalled] = useState(false);
    const time = new Date(accident.timestamp).toLocaleTimeString("fr-MG", { hour: "2-digit", minute: "2-digit" });

    const handleCall = () => {
        // In a real system this would trigger a VOIP call / API request.
        // Here we simulate the action.
        setCalled(true);
    };

    const borderColor = accident.bodily ? "border-red-500" : "border-orange-400";
    const headerBg = accident.bodily ? "bg-red-500/20" : "bg-orange-400/20";
    const icon = accident.bodily ? "🚨" : "⚠️";
    const title = accident.bodily ? "ACCIDENT CORPOREL" : "ACCIDENT MATÉRIEL";

    return (
        <motion.div
            initial={{ x: -320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -320, opacity: 0 }}
            className={`w-80 bg-slate-950/95 backdrop-blur-lg border ${borderColor} rounded-2xl shadow-2xl overflow-hidden`}
        >
            {/* Header */}
            <div className={`flex items-center gap-2 px-4 py-2 ${headerBg}`}>
                <span className="text-lg">{icon}</span>
                <span className="text-white font-bold text-sm flex-1">{title}</span>
                <span className="text-slate-400 text-xs">{time}</span>
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="text-slate-400 hover:text-white ml-1"
                    aria-label="Expand"
                >
                    {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                <button
                    onClick={() => onDismiss(accident.id)}
                    className="text-slate-400 hover:text-red-400 ml-1"
                    aria-label="Dismiss"
                >
                    <X size={16} />
                </button>
            </div>

            {expanded && (
                <div className="px-4 py-3 space-y-3">
                    {/* Plates */}
                    <div>
                        <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Plaques impliquées</p>
                        <div className="flex flex-wrap gap-2">
                            {accident.plates.map((plate) => (
                                <span
                                    key={plate}
                                    className="font-mono font-bold bg-slate-800 border border-slate-600 text-white text-sm px-3 py-1 rounded-lg tracking-widest"
                                >
                                    {plate}
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Bodily warning */}
                    {accident.bodily && (
                        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                            <AlertTriangle size={15} className="text-red-400 shrink-0" />
                            <p className="text-red-300 text-xs">Des blessures corporelles ont été signalées. Appelez les urgences.</p>
                        </div>
                    )}

                    {/* Emergency call button */}
                    {accident.bodily && (
                        <button
                            onClick={handleCall}
                            disabled={called}
                            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-all
                                ${called
                                    ? "bg-green-700/40 text-green-300 border border-green-700 cursor-default"
                                    : "bg-red-600 hover:bg-red-500 active:scale-95 text-white"
                                }`}
                        >
                            <Phone size={16} />
                            {called ? `✓ Urgences appelées (${EMERGENCY_NUMBER})` : `Appeler le ${EMERGENCY_NUMBER}`}
                        </button>
                    )}
                </div>
            )}
        </motion.div>
    );
}
