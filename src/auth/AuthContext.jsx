import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getSession, onSessionEvent } from '@/api/client';
import { queryClient } from '@/api/queries';
import { AREA_BY_ROLE } from '@/types';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getSession()?.user ?? null);

  // The API layer tells us when the server ended the session (forced logout,
  // suspension, password reset elsewhere) or when the user's grants changed.
  useEffect(
    () =>
      onSessionEvent((e) => {
        if (e.type === 'signedOut') {
          queryClient.clear();
          setUser(null);
        } else {
          setUser(e.user);
        }
      }),
    [],
  );

  const start = useCallback((session) => {
    // Cached data belongs to the previous user (e.g. after "View as"); never show it to the next one.
    queryClient.clear();
    setUser(session.user);
    return session.user;
  }, []);

  /** Resolves to { user } when signed in, or { mfa } when a two-step code is needed. */
  const login = useCallback(
    async (email, password) => {
      const r = await api.auth.login(email, password);
      if ('mfaRequired' in r) return { mfa: r };
      return { user: start(r) };
    },
    [start],
  );

  const verifyMfa = useCallback(async (token, code) => start(await api.auth.verifyMfa(token, code)), [start]);
  const acceptInvite = useCallback(async (token, password) => start(await api.auth.acceptInvite(token, password)), [start]);
  /** Week 7: influencer self sign-up confirms the email and signs in. */
  const verifyEmail = useCallback(async (token) => start(await api.influencers.verifyEmail(token)), [start]);

  const logout = useCallback(async () => {
    await api.auth.logout();
    queryClient.clear();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, area: user ? AREA_BY_ROLE[user.role] : null, login, verifyMfa, acceptInvite, verifyEmail, logout }),
    [user, login, verifyMfa, acceptInvite, verifyEmail, logout],
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

/** Role checks plus extra grants (e.g. a client rep allowed to see billing). */
export const can = (user, item) =>
  !!user && (!item.roles || item.roles.includes(user.role)) && (!item.permission || !!user.permissions?.includes(item.permission));
