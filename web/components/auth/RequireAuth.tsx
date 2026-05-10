"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import type { UserProfile } from "@/lib/api";

interface RequireAuthProps {
    /** If provided, the user must have one of these roles. Otherwise any authenticated user is allowed. */
    allowedRoles?: UserProfile["role"][];
    children: React.ReactNode;
}

/**
 * Wraps a page or section that requires authentication and optionally a specific role.
 * - Unauthenticated users → redirected to /auth
 * - Wrong role → redirected to /unauthorized
 */
export default function RequireAuth({ allowedRoles, children }: RequireAuthProps) {
    const { user, isLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (isLoading) return;
        if (!user) {
            router.replace("/auth");
            return;
        }
        if (allowedRoles && !allowedRoles.includes(user.role)) {
            router.replace("/unauthorized");
        }
    }, [isLoading, user, allowedRoles, router]);

    if (isLoading) {
        return (
            <main className="min-h-screen bg-slate-950 flex items-center justify-center">
                <Loader2 size={32} className="animate-spin text-blue-400" />
            </main>
        );
    }

    if (!user) return null;
    if (allowedRoles && !allowedRoles.includes(user.role)) return null;

    return <>{children}</>;
}
