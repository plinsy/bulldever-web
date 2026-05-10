"use client";

import { useRouter } from "next/navigation";
import { ShieldOff } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function UnauthorizedPage() {
    const router = useRouter();
    const { user } = useAuth();

    return (
        <main className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
            <div className="text-center max-w-sm">
                <ShieldOff size={48} className="text-red-400 mx-auto mb-4" />
                <h1 className="text-white font-bold text-xl mb-2">Accès non autorisé</h1>
                <p className="text-slate-400 text-sm mb-6">
                    Vous n&apos;avez pas les permissions nécessaires pour accéder à cette page.
                    {user && (
                        <span className="block mt-1">
                            Votre rôle actuel : <span className="text-white">{user.role_display}</span>
                        </span>
                    )}
                </p>
                <div className="flex gap-3 justify-center">
                    <button
                        onClick={() => router.push("/dashboard")}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm transition-colors"
                    >
                        Mon espace
                    </button>
                    <button
                        onClick={() => router.push("/")}
                        className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm transition-colors"
                    >
                        Accueil
                    </button>
                </div>
            </div>
        </main>
    );
}
