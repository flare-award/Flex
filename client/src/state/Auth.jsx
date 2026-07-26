import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from '../api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = getToken();
    if (!t) { setLoading(false); return; }
    api.me().then(setUser).catch(() => setToken(null)).finally(() => setLoading(false));
  }, []);

  async function login(emailOrUsername, password) {
    const { token, user } = await api.login({ emailOrUsername, password });
    setToken(token); setUser(user); return user;
  }
  async function register(email, username, password, displayName) {
    const { token, user } = await api.register({ email, username, password, displayName });
    setToken(token); setUser(user); return user;
  }
  function logout() { setToken(null); setUser(null); }
  function updateUser(u) { setUser(u); }

  return (
    <AuthCtx.Provider value={{ user, loading, login, register, logout, updateUser }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
