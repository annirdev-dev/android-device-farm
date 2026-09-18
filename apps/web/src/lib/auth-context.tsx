"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "./api-client";
import type { Organization, User } from "./types";

interface AuthContextValue {
  user: User | null;
  organizations: Organization[];
  currentOrg: Organization | null;
  setCurrentOrgId: (id: string) => void;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { email: string; password: string; name: string; organizationName?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);
const CURRENT_ORG_KEY = "devicefarm.currentOrgId";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [organizations, setOrganizations] = React.useState<Organization[]>([]);
  const [currentOrgId, setCurrentOrgIdState] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const router = useRouter();

  const refresh = React.useCallback(async () => {
    try {
      const res = await api.get<{ user: User; organizations: Organization[] }>("/api/auth/me");
      setUser(res.user);
      setOrganizations(res.organizations);
      const stored = typeof window !== "undefined" ? window.localStorage.getItem(CURRENT_ORG_KEY) : null;
      const valid = res.organizations.find((o) => o.id === stored);
      setCurrentOrgIdState(valid?.id ?? res.organizations[0]?.id ?? null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
        setOrganizations([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const setCurrentOrgId = (id: string) => {
    setCurrentOrgIdState(id);
    window.localStorage.setItem(CURRENT_ORG_KEY, id);
  };

  const login = async (email: string, password: string) => {
    await api.post("/api/auth/login", { email, password });
    await refresh();
  };

  const register = async (input: { email: string; password: string; name: string; organizationName?: string }) => {
    await api.post("/api/auth/register", input);
    await refresh();
  };

  const logout = async () => {
    await api.post("/api/auth/logout");
    setUser(null);
    setOrganizations([]);
    router.push("/login");
  };

  const currentOrg = organizations.find((o) => o.id === currentOrgId) ?? null;

  return (
    <AuthContext.Provider value={{ user, organizations, currentOrg, setCurrentOrgId, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
