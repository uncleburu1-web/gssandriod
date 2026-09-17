import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function RequireRepairs({ children }) {
  const { loading, repairsEnabled } = useAuth();

  if (loading) return <div className="empty" style={{ padding: 40 }}>Loading…</div>;
  if (!repairsEnabled) return <Navigate to="/" replace />;
  return children;
}
