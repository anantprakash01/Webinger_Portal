import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { homePath, useAuth } from './AuthContext';

/**
 * Keeps people inside their own portal area.
 * This is a convenience for the UI only. Real protection is the backend
 * refusing the API call (403); hiding a page in React secures nothing.
 */
export function RequireArea({ area }) {
  const { user, area: mine } = useAuth();
  const location = useLocation();
  if (!user || !mine) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (mine !== area) return <Navigate to={homePath(mine)} replace />;
  return <Outlet />;
}
