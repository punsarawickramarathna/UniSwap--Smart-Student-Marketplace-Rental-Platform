import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  getCurrentUser,
  login as requestLogin,
  logout as requestLogout,
  refreshSession as requestRefreshSession,
  resetPassword as requestResetPassword,
} from "../services/auth";
import {
  clearLocalAuthSession,
  setAccessToken,
  setAuthInvalidatedHandler,
} from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authNotice, setAuthNotice] = useState(null);
  const authStateGeneration = useRef(0);

  const clearAuthState = useCallback(() => {
    authStateGeneration.current += 1;
    clearLocalAuthSession();
    setUser(null);
  }, []);

  useEffect(() => {
    let active = true;
    const initializationGeneration = authStateGeneration.current;

    const removeInvalidatedHandler = setAuthInvalidatedHandler(() => {
      if (active) {
        clearAuthState();
      }
    });

    getCurrentUser()
      .then((currentUser) => {
        if (
          active &&
          initializationGeneration === authStateGeneration.current
        ) {
          setUser(currentUser);
        }
      })
      .catch(() => {
        if (active) {
          clearAuthState();
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
      removeInvalidatedHandler();
    };
  }, [clearAuthState]);

  const login = useCallback(async (credentials) => {
    setAuthNotice(null);
    const session = await requestLogin(credentials);
    setAccessToken(session.access_token);
    setUser(session.user);
    return session.user;
  }, []);

  const logout = useCallback(async () => {
    let serverRevoked = true;
    setAuthNotice(null);

    try {
      await requestLogout();
    } catch {
      serverRevoked = false;
      setAuthNotice({
        type: "warning",
        message:
          "Signed out locally, but the server session could not be confirmed as revoked. Please try again when the service is available.",
      });
    } finally {
      // Local logout must always win, even when the API is unavailable.
      clearAuthState();
    }

    return { serverRevoked };
  }, [clearAuthState]);

  const refresh = useCallback(async () => {
    const session = await requestRefreshSession();
    setAccessToken(session.access_token);
    const currentUser = await getCurrentUser();
    setUser(currentUser);
    return currentUser;
  }, []);

  const resetPassword = useCallback(
    async ({ token, newPassword }) => {
      setAuthNotice(null);
      const result = await requestResetPassword({ token, newPassword });
      // The server revokes all long-lived refresh sessions on success. Clear
      // the current in-memory access token too so this browser cannot keep
      // presenting an access JWT that remains valid until its normal expiry.
      clearAuthState();
      setAuthNotice({ type: "success", message: result.message });
      return result;
    },
    [clearAuthState],
  );

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      loading,
      // Compatibility with the previous ticket's context shape.
      isRestoring: loading,
      login,
      logout,
      refresh,
      resetPassword,
      authNotice,
    }),
    [authNotice, loading, login, logout, refresh, resetPassword, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
