import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useParams, useLocation } from 'react-router-dom';
import { useAuth } from './state/Auth.jsx';
import { useApp } from './state/AppState.jsx';
import LoginPage from './pages/Login.jsx';
import MainApp from './pages/MainApp.jsx';

function InviteRoute() {
  const { code } = useParams();
  const { user } = useAuth();
  const { setModal } = useApp();
  const navigate = useNavigate();
  useEffect(() => {
    if (!user) {
      navigate('/login?invite=' + encodeURIComponent(code), { replace: true });
      return;
    }
    setModal({ type: 'joinGuild', code });
    navigate('/channels/@me', { replace: true });
  }, [code, user]);
  return <div className="h-full flex items-center justify-center text-flex-muted">Joining {code}…</div>;
}

function HashInviteHandler() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { setModal } = useApp();

  useEffect(() => {
    // support hash routing #/invite/CODE
    if (location.hash.startsWith('#/invite/')) {
      const code = location.hash.replace('#/invite/', '').split('?')[0].split('/')[0];
      if (code) {
        if (!user) {
          navigate('/login?invite=' + encodeURIComponent(code), { replace: true });
        } else {
          setModal({ type: 'joinGuild', code });
          navigate('/channels/@me', { replace: true });
        }
      }
    }
  }, [location.hash, user]);

  return null;
}

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="h-full flex items-center justify-center text-flex-muted">Загрузка Flex P2P…</div>;
  return (
    <>
      <HashInviteHandler />
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/channels/@me" replace /> : <LoginPage />} />
        <Route path="/invite/:code" element={<InviteRoute />} />
        <Route path="/channels/*" element={user ? <MainApp /> : <Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to={user ? '/channels/@me' : '/login'} replace />} />
      </Routes>
    </>
  );
}
