"use client";

import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Wrench, X, History } from "lucide-react";
import type { AccidentEvent } from "../simulation/accidentTypes";

interface AccidentPanelProps {
    accidents: AccidentEvent[];
    onDismiss: (id: string) => void;
}

export default function AccidentPanel({ accidents, onDismiss }: AccidentPanelProps) {
    if (accidents.length === 0) return null;

    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-md px-4 pointer-events-none">
            <div className="flex flex-col gap-3">
                <AnimatePresence mode="popLayout">
                    {accidents.map((acc) => (
                        <motion.div
                            key={acc.id}
                            layout
                            initial={{ opacity: 0, y: 50, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
                            className="pointer-events-auto shadow-2xl"
                        >
                            <div className="alert bg-base-300/95 backdrop-blur-xl border border-error/20 flex flex-row items-center gap-4 py-3 rounded-2xl shadow-error/10">
                                <div className="bg-error/20 p-2 rounded-xl">
                                    <AlertCircle className="text-error" size={24} />
                                </div>
                                
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-white font-bold text-sm tracking-tight truncate">
                                            Collision Détectée
                                        </h3>
                                        <span className="text-[10px] font-mono text-slate-500 bg-black/30 px-1.5 py-0.5 rounded uppercase">
                                            {acc.id.split('-')[0]}
                                        </span>
                                    </div>
                                    <p className="text-slate-400 text-xs mt-0.5 flex items-center gap-1.5">
                                        <History size={10} /> {new Date(acc.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                    </p>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => onDismiss(acc.id)}
                                        className="btn btn-error btn-sm btn-square rounded-lg group"
                                        title="Réparer"
                                    >
                                        <Wrench size={16} className="group-hover:rotate-45 transition-transform" />
                                    </button>
                                    <button
                                        onClick={() => onDismiss(acc.id)}
                                        className="btn btn-ghost btn-sm btn-square rounded-lg text-slate-500 hover:text-white"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </div>
    );
}
