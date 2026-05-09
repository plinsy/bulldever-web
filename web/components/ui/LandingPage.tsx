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
        className="card bg-base-300/40 backdrop-blur-xl border border-white/10 hover:border-primary/50 transition-all group"
    >
        <div className="card-body">
            <div className="bg-primary/20 w-12 h-12 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Icon className="text-primary" size={24} />
            </div>
            <h3 className="card-title text-white">{title}</h3>
            <p className="text-slate-400 text-sm leading-relaxed">{description}</p>
        </div>
    </motion.div>
);

export default function LandingPage({ onEnter }: LandingPageProps) {
    return (
        <div data-theme="night" className="relative w-screen h-screen overflow-hidden bg-base-100 flex flex-col items-center justify-center">
            {/* Background Image with Overlay */}
            <div className="absolute inset-0 z-0">
                <img 
                    src="/landing_bg.png" 
                    alt="City Background" 
                    className="w-full h-full object-cover animate-pulse-slow"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-base-100/90 via-base-100/40 to-base-100" />
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
                    <div className="badge badge-primary badge-outline gap-2 px-4 py-3 mb-8">
                        <Activity size={14} className="animate-pulse" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Digital Twin v2.0 Live</span>
                    </div>
                    
                    <h1 className="text-7xl md:text-8xl font-black text-white tracking-tighter mb-4 bg-clip-text text-transparent bg-gradient-to-r from-white via-primary to-blue-900">
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
                        className="btn btn-primary btn-lg rounded-2xl px-10 group shadow-lg shadow-primary/20"
                    >
                        Lancer la Simulation
                        <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                    
                    <button className="btn btn-ghost btn-lg border-slate-700 rounded-2xl px-10">
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
                <div className="opacity-40">
                    <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold">
                        Propulsé par Google Gemini & OpenStreetMap
                    </p>
                </div>
            </motion.footer>
        </div>
    );
}
