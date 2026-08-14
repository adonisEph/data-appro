import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { User } from '../types';
import { authApi } from '../lib/api';
import { useInactivityLogout, SAVED_EMAIL_KEY, AUTO_LOGOUT_KEY } from './useInactivityLogout';

interface AuthContextType {
  user: User | null; token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void; isLoading: boolean;
  isSuperAdmin: boolean; isViewer: boolean;
  isAssistantAppro: boolean; canProvision: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]     = useState<User | null>(null);
  const [token, setToken]   = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem('appro_token');
    const u = localStorage.getItem('appro_user');
    if (t && u) { try { setToken(t); setUser(JSON.parse(u)); } catch { /* ignore */ } }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    localStorage.setItem('appro_token', res.token);
    localStorage.setItem('appro_user', JSON.stringify(res.user));
    localStorage.removeItem(AUTO_LOGOUT_KEY);
    setToken(res.token); setUser(res.user);
  };

  const logout = useCallback(() => {
    localStorage.removeItem('appro_token'); localStorage.removeItem('appro_user');
    setToken(null); setUser(null);
  }, []);

  // Auto-déconnexion après inactivité — sauvegarde l'email pour pré-remplir la page de connexion
  const handleInactivityTimeout = useCallback(() => {
    const savedUser = localStorage.getItem('appro_user');
    if (savedUser) {
      try {
        const u: User = JSON.parse(savedUser);
        if (u.email) localStorage.setItem(SAVED_EMAIL_KEY, u.email);
      } catch { /* ignore */ }
    }
    localStorage.setItem(AUTO_LOGOUT_KEY, '1');
    logout();
  }, [logout]);

  useInactivityLogout(Boolean(user), handleInactivityTimeout);

  return (
    <AuthContext.Provider value={{
      user, token, login, logout, isLoading,
      isSuperAdmin: Boolean(user?.is_super_admin),
      isViewer: Boolean(user?.is_viewer),
      isAssistantAppro: !Boolean(user?.is_super_admin) && !Boolean(user?.is_viewer) && Boolean(user?.droits?.can_provision),
      canProvision: Boolean(user?.is_super_admin) || Boolean(user?.droits?.can_launch_campagne) || Boolean(user?.droits?.can_provision),
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être dans AuthProvider');
  return ctx;
}
