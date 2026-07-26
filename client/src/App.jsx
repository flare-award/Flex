import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useParams, useLocation } from 'react-router-dom';
import { useAuth } from './state/Auth.jsx';
import { useApp } from './state/AppState.jsx';
import LoginPage from './pages/Login.jsx';
import MainApp from './pages/MainApp.jsx';

function InviteRoute() {
  const { code } = useParams();
  const { user } = useAuth();
  const { setModal, refreshAll, selectGuild, guilds } = useApp();
  const navigate = useNavigate();
  useEffect(() => {
    if (!user) {
      navigate('/login?invite=' + encodeURIComponent(code), { replace: true });
      return;
    }
    // Auto-open join modal
    setModal({ type: 'joinGuild', code });
    navigate('/channels/@me', { replace: true });
  }, [code, user]);
  return <div className="h-full flex items-center justify-center text-flex-muted">Joining {code}…</div>;
}

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="h-full flex items-center justify-center text-flex-muted">Загрузка Flex…</div>;
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/channels/@me" replace /> : <LoginPage />} />
      <Route path="/invite/:code" element={<InviteRoute />} />
      <Route path="/channels/*" element={user ? <MainApp /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to={user ? '/channels/@me' : '/login'} replace />} />
    </Routes>
  );
}
