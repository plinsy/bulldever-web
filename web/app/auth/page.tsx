"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Navigation, Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import type { UserProfile } from "@/lib/api";

type Mode = "login" | "register";

const ROLE_OPTIONS: { value: UserProfile["role"]; label: string }[] = [
    { value: "usager", label: "Usager" },
    { value: "pompier", label: "Pompier" },
    { value: "urgence", label: "Urgences" },
    { value: "agent", label: "Agent de circulation" },
];

export default function AuthPage() {
    const router = useRouter();
    const { login, register, user, isLoading } = useAuth();

    // Already authenticated → go to dashboard
    useEffect(() => {
        if (!isLoading && user) {
            router.replace("/dashboard");
        }
    }, [isLoading, user, router]);

    const [mode, setMode] = useState<Mode>("login");
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [role, setRole] = useState<UserProfile["role"]>("usager");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            if (mode === "login") {
                await login(username, password);
            } else {
                await register(username, email, password, role);
            }
            router.push("/dashboard");
        } catch (err: unknown) {
            const msg =
                (err as { response?: { data?: { error?: string; username?: string[]; email?: string[] } } })
                    ?.response?.data?.error ??
                (err as { response?: { data?: { username?: string[] } } })?.response?.data?.username?.[0] ??
                (err as { response?: { data?: { email?: string[] } } })?.response?.data?.email?.[0] ??
                "Une erreur est survenue.";
            setError(msg);
        } finally {
            setLoading(false);
        }
    }

    return (
        <main className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Header */}
                <div className="flex items-center gap-3 mb-8">
                    <Navigation size={24} className="text-blue-400" />
                    <div>
                        <h1 className="text-white font-bold text-lg leading-tight">
                            Jumeau Numérique · Antananarivo
                        </h1>
                        <p className="text-slate-400 text-xs">Gestion du trafic routier</p>
                    </div>
                </div>

                <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl">
                    {/* Mode toggle */}
                    <div className="flex gap-1 mb-6 bg-slate-800 rounded-xl p-1">
                        {(["login", "register"] as Mode[]).map((m) => (
                            <button
                                key={m}
                                onClick={() => { setMode(m); setError(null); }}
                                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                                    mode === m
                                        ? "bg-blue-600 text-white shadow"
                                        : "text-slate-400 hover:text-white"
                                }`}
                            >
                                {m === "login" ? "Connexion" : "Inscription"}
                            </button>
                        ))}
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-slate-300 text-sm mb-1">
                                Identifiant
                            </label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                                className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                                placeholder="votre_identifiant"
                            />
                        </div>

                        {mode === "register" && (
                            <div>
                                <label className="block text-slate-300 text-sm mb-1">
                                    Email
                                </label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                                    placeholder="vous@exemple.mg"
                                />
                            </div>
                        )}

                        <div>
                            <label className="block text-slate-300 text-sm mb-1">
                                Mot de passe
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength={8}
                                className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                                placeholder="••••••••"
                            />
                        </div>

                        {mode === "register" && (
                            <div>
                                <label className="block text-slate-300 text-sm mb-1">
                                    Rôle
                                </label>
                                <select
                                    value={role}
                                    onChange={(e) => setRole(e.target.value as UserProfile["role"])}
                                    className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                                >
                                    {ROLE_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {error && (
                            <div className="flex items-center gap-2 bg-red-950/50 border border-red-700 text-red-300 rounded-lg px-3 py-2 text-sm">
                                <AlertCircle size={14} className="shrink-0" />
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
                        >
                            {loading && <Loader2 size={14} className="animate-spin" />}
                            {mode === "login" ? "Se connecter" : "Créer un compte"}
                        </button>
                    </form>
                </div>

                <p className="text-center text-slate-500 text-xs mt-4">
                    <button onClick={() => router.push("/")} className="text-blue-400 hover:underline">
                        ← Retour à la simulation
                    </button>
                </p>
            </div>
        </main>
    );
}
