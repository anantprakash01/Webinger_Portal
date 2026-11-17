import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { api, getSession } from '@/api/client';
import { queryClient } from '@/api/queries';
import { AREA_BY_ROLE } from '@/types';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getSession()?.user ?? null);

  const login = useCallback(async (email, password) => {
    const s = await api.auth.login(email, password);
    // Cached data belongs to the previous user (e.g. after "View as"); never show it to the next one.
    queryClient.clear();
    setUser(s.user);
    return s.user;
  }, []);

  const logout = useCallback(async () => {
    await api.auth.logout();
    queryClient.clear();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, area: user ? AREA_BY_ROLE[user.role] : null, login, logout }),
    [user, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Where each area's home page lives. */
export const homePath = (area) => `/${area}`;
