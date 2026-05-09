"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from "react";
import {
    login as apiLogin,
    logout as apiLogout,
    register as apiRegister,
    fetchMe,
    type UserProfile,
} from "@/lib/api";

interface AuthState {
    user: UserProfile | null;
    token: string | null;
    isLoading: boolean;
}

interface AuthContextValue extends AuthState {
    login: (username: string, password: string) => Promise<void>;
    register: (
        username: string,
        email: string,
        password: string,
        role: UserProfile["role"]
    ) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<AuthState>({
        user: null,
        token: null,
        isLoading: true,
    });

    // Restore session from localStorage on mount
    useEffect(() => {
        const stored = localStorage.getItem("auth_token");
        if (!stored) {
            setState((s) => ({ ...s, isLoading: false }));
            return;
        }
        fetchMe()
            .then((user) => setState({ user, token: stored, isLoading: false }))
            .catch(() => {
                localStorage.removeItem("auth_token");
                setState({ user: null, token: null, isLoading: false });
            });
    }, []);

    const login = useCallback(async (username: string, password: string) => {
        const { token, user } = await apiLogin(username, password);
        localStorage.setItem("auth_token", token);
        setState({ user, token, isLoading: false });
    }, []);

    const register = useCallback(
        async (username: string, email: string, password: string, role: UserProfile["role"]) => {
            const { token, user } = await apiRegister(username, email, password, role);
            localStorage.setItem("auth_token", token);
            setState({ user, token, isLoading: false });
        },
        []
    );

    const logout = useCallback(async () => {
        try {
            await apiLogout();
        } finally {
            localStorage.removeItem("auth_token");
            setState({ user: null, token: null, isLoading: false });
        }
    }, []);

    return (
        <AuthContext.Provider value={{ ...state, login, register, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
    return ctx;
}
