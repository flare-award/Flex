import React, { useState } from 'react';
import { useAuth } from '../state/Auth.jsx';
import { useApp } from '../state/AppState.jsx';
import StatusPicker from './StatusPicker.jsx';

export default function UserPanel() {
  const { user, logout } = useAuth();
  const { setModal, voice, connected } = useApp();
  const [openStatus, setOpenStatus] = useState(false);
  if (!user) return null;
  return (
    <div className="h-[52px] bg-[#232428] px-2 flex items-center gap-2 flex-shrink-0 relative">
      <button onClick={() => setOpenStatus(s => !s)} className="flex items-center gap-2 flex-1 min-w-0 rounded hover:bg-flex-hover/60 p-1">
        <div className="avatar w-8 h-8 bg-flex-accent flex items-center justify-center font-semibold relative">
          {user.avatar ? <img src={user.avatar} className="w-full h-full object-cover" /> : user.displayName[0]?.toUpperCase()}
          <span className={`status-dot ${statusColor(user.status)}`} />
        </div>
        <div className="flex-1 text-left min-w-0">
          <div className="text-white text-sm font-medium truncate leading-tight">{user.displayName}</div>
          <div className="text-flex-muted text-xs truncate leading-tight">{user.customStatus || 'Online'}</div>
        </div>
      </button>
      <div className="flex items-center text-flex-muted">
        <span title={connected ? 'Подключено' : 'Переподключение…'} className={`w-2 h-2 rounded-full mr-1 ${connected ? 'bg-flex-green' : 'bg-flex-red animate-pulse'}`} />
        <IconBtn title="Настройки" onClick={() => setModal({ type: 'settings' })}>⚙️</IconBtn>
      </div>
      {openStatus && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpenStatus(false)} />
          <div className="absolute bottom-[60px] left-2 z-40">
            <StatusPicker onClose={() => setOpenStatus(false)} />
          </div>
        </>
      )}
    </div>
  );
}
function IconBtn({ children, title, onClick }) {
  return <button title={title} onClick={onClick} className="w-8 h-8 rounded hover:bg-flex-hover flex items-center justify-center">{children}</button>;
}
function statusColor(s) {
  if (s === 'online') return 'bg-flex-green';
  if (s === 'idle') return 'bg-flex-yellow';
  if (s === 'dnd') return 'bg-flex-red';
  return 'bg-gray-500';
}
