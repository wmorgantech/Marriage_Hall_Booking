import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getSessionUser, getToken, setSessionUser, setToken } from '../api/client';
import type { SessionUser } from '../api/types';

type AuthContextValue = {
  user: SessionUser | null;
  loading: boolean;
  login: (token: string, user: SessionUser) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [token, sessionUser] = await Promise.all([getToken(), getSessionUser()]);
      if (token && sessionUser) setUser(sessionUser);
      setLoading(false);
    })();
  }, []);

  async function login(token: string, sessionUser: SessionUser) {
    await Promise.all([setToken(token), setSessionUser(sessionUser)]);
    setUser(sessionUser);
  }

  async function logout() {
    await Promise.all([setToken(null), setSessionUser(null)]);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
