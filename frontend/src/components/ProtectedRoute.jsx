import { useEffect } from "react";

import { useAuth } from "../context/AuthContext";
import { navigate } from "../navigation";

export default function ProtectedRoute({ children, loadingFallback = null, unauthenticatedFallback = null }) {
  const { isAuthenticated, loading } = useAuth();

  useEffect(() => {
    if (loading || isAuthenticated || window.location.pathname === "/login") return;
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    navigate(`/login?returnTo=${encodeURIComponent(currentPath)}`, { replace: true });
  }, [isAuthenticated, loading]);

  if (loading) return loadingFallback;
  if (!isAuthenticated) return unauthenticatedFallback;
  return children;
}
