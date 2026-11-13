import { useCallback, useEffect, useState } from 'react';
import { authApi } from '../api/endpoints';
import { AuthContext } from '../hooks/useAuth';

/**
 * Reads ?googleConnected=true / ?googleAuthError=... left in the URL by
 * the backend's OAuth callback redirect, then strips them so a refresh
 * doesn't re-show the banner. Returns whichever one was present, if any.
 */
function consumeOAuthRedirectParams() {
  const params = new URLSearchParams(window.location.search);
  const connected = params.get('googleConnected');
  const error = params.get('googleAuthError');

  if (connected || error) {
    params.delete('googleConnected');
    params.delete('googleAuthError');
    const rest = params.toString();
    const newUrl = `${window.location.pathname}${rest ? `?${rest}` : ''}`;
    window.history.replaceState({}, '', newUrl);
  }

  return { connected: Boolean(connected), error };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [oauthNotice, setOauthNotice] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('googleAuthError')) return { type: 'error', message: 'Google sign-in failed: ' + params.get('googleAuthError') };
    if (params.get('googleConnected')) return { type: 'success', message: 'Google account connected successfully.' };
    return null;
  });

  const refreshUser = useCallback(async () => {
    try {
      const res = await authApi.me();
      setUser(res.data);
      return res.data;
    } catch (err) {
      setUser(null);
      if (err.status !== 401) setOauthNotice({ type: 'error', message: 'Cannot reach the API. Check that the backend is running.' });
      return null;
    }
  }, []);

  useEffect(() => {
    consumeOAuthRedirectParams();

    // This effect synchronizes the server session through an HTTP request.
    // oxlint-disable-next-line react/set-state-in-effect
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
  }, []);


  const updateUserLocal = useCallback((patch) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, oauthNotice, clearOauthNotice: () => setOauthNotice(null), refreshUser, logout, updateUserLocal }}
    >
      {children}
    </AuthContext.Provider>
  );
}
