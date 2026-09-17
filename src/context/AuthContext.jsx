import { createContext, useContext, useEffect, useState } from 'react';
import { auth } from '../api/endpoints';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      setLoading(false);
      return;
    }
    auth
      .me()
      .then(({ data }) => setUser(data))
      .catch(() => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(username, password) {
    const { data } = await auth.login(username, password);
    localStorage.setItem('access_token', data.access);
    localStorage.setItem('refresh_token', data.refresh);
    const me = await auth.me();
    setUser(me.data);
  }

  async function register(payload) {
    const { data } = await auth.register(payload);
    localStorage.setItem('access_token', data.access);
    localStorage.setItem('refresh_token', data.refresh);
    const me = await auth.me();
    setUser(me.data);
  }

  function logout() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('current_branch_id');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{
      user, loading, login, register, logout,
      isOwner: !!user?.is_owner,
      isCeo: !!user?.is_ceo,
      shopId: user?.shop_id || null,
      shopName: user?.shop_name || 'My Shop',
      shopLogoUrl: user?.shop_logo_url || '',
      repairsEnabled: !!user?.repairs_enabled,
      refreshUser: async () => { const me = await auth.me(); setUser(me.data); },
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
