"use client";

import { motion } from "framer-motion";
import { Navigation, ShieldAlert, Cpu, Activity, ArrowRight } from "lucide-react";

interface LandingPageProps {
    onEnter: () => void;
}

const FeatureCard = ({ icon: Icon, title, description, delay }: any) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay }}
        className="bg-slate-900/40 backdrop-blur-xl border border-slate-700/50 p-6 rounded-3xl hover:border-blue-500/50 transition-all group"
    >
        <div className="bg-blue-500/20 w-12 h-12 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Icon className="text-blue-400" size={24} />
        </div>
        <h3 className="text-white font-bold text-lg mb-2">{title}</h3>
        <p className="text-slate-400 text-sm leading-relaxed">{description}</p>
    </motion.div>
);

export default function LandingPage({ onEnter }: LandingPageProps) {
    return (
        <div className="relative w-screen h-screen overflow-hidden bg-slate-950 flex flex-col items-center justify-center">
            {/* Background Image with Overlay */}
            <div className="absolute inset-0 z-0">
                <img 
                    src="/landing_bg.png" 
                    alt="City Background" 
                    className="w-full h-full object-cover animate-pulse-slow"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-slate-950/80 via-slate-950/40 to-slate-950" />
            </div>

            {/* Animated Grid Lines */}
            <div className="absolute inset-0 z-0 opacity-10 pointer-events-none" 
                 style={{ backgroundImage: 'linear-gradient(#475569 1px, transparent 1px), linear-gradient(90deg, #475569 1px, transparent 1px)', backgroundSize: '40px 40px' }} 
            />

            <main className="relative z-10 container mx-auto px-6 flex flex-col items-center text-center">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 1 }}
                    className="mb-6"
                >
                    <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 px-4 py-2 rounded-full mb-8">
                        <Activity size={14} className="text-blue-400 animate-pulse" />
                        <span className="text-blue-400 text-[10px] font-bold uppercase tracking-widest">Digital Twin v2.0 Live</span>
                    </div>
                    
                    <h1 className="text-7xl md:text-8xl font-black text-white tracking-tighter mb-4 bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-slate-500">
                        AlaminoAI
                    </h1>
                    <p className="text-xl md:text-2xl text-slate-400 max-w-2xl mx-auto font-light leading-relaxed">
                        L'intelligence urbaine réinventée. Simulez, analysez et optimisez 
                        le trafic d'Antananarivo en temps réel.
                    </p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 1, delay: 0.5 }}
                    className="flex flex-col sm:flex-row gap-4 mt-10"
                >
                    <button
                        onClick={onEnter}
                        className="group relative bg-blue-600 hover:bg-blue-500 text-white px-10 py-5 rounded-2xl font-bold text-lg shadow-2xl shadow-blue-500/20 transition-all hover:scale-105 active:scale-95 flex items-center gap-3 overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-shimmer" />
                        Lancer la Simulation
                        <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                    
                    <button className="bg-slate-900/50 backdrop-blur-md border border-slate-700 text-slate-300 px-10 py-5 rounded-2xl font-bold text-lg hover:bg-slate-800 transition-all">
                        En savoir plus
                    </button>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20 max-w-5xl">
                    <FeatureCard 
                        icon={Navigation}
                        delay={0.6}
                        title="Navigation Dynamique"
                        description="Explorez la ville grâce à un système de navigation par tuiles performant et fluide."
                    />
                    <FeatureCard 
                        icon={ShieldAlert}
                        delay={0.8}
                        title="Détection d'Accidents"
                        description="Système avancé de gestion des collisions et interventions d'urgence simulées."
                    />
                    <FeatureCard 
                        icon={Cpu}
                        delay={1.0}
                        title="Intelligence Artificielle"
                        description="Analysez les flux de trafic et obtenez des prédictions intelligentes grâce à l'IA."
                    />
                </div>
            </main>

            {/* Footer */}
            <motion.footer 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1, delay: 1.5 }}
                className="absolute bottom-10 left-0 right-0 text-center pointer-events-none"
            >
                <p className="text-slate-600 text-[10px] uppercase tracking-widest font-bold">
                    Propulsé par Google Gemini & OpenStreetMap
                </p>
            </motion.footer>
        </div>
    );
}
