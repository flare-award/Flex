import React, { useState } from 'react';
import { useAuth } from '../state/Auth.jsx';
import { useApp } from '../state/AppState.jsx';
import { updateProfile } from '../lib/db.js';

export default function StatusPicker({ onClose }) {
  const { user, updateUser } = useAuth();
  const { showToast } = useApp();
  const [custom, setCustom] = useState(user?.customStatus || '');
  const statuses = [
    { id: 'online', label: 'Online', color: 'bg-flex-green' },
    { id: 'idle', label: 'Away', color: 'bg-flex-yellow' },
    { id: 'dnd', label: 'Do Not Disturb', color: 'bg-flex-red' },
    { id: 'offline', label: 'Invisible', color: 'bg-gray-500' },
  ];
  async function setStatus(s) {
    try {
      await updateProfile(user.id, { status: s, customStatus: custom });
      updateUser({ status: s, customStatus: custom });
      onClose();
    } catch (e) { showToast(e.message, 'error'); }
  }
  return (
    <div className="bg-[#111214] rounded-md shadow-2xl w-60 p-2 border border-black/30">
      <div className="px-2 pb-2">
        <input className="input text-sm" placeholder="Set a custom status" value={custom} onChange={e=>setCustom(e.target.value.slice(0,64))} />
      </div>
      {statuses.map(s => (
        <button key={s.id} onClick={() => setStatus(s.id)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-flex-hover/60 text-left text-sm">
          <span className={`w-3 h-3 rounded-full ${s.color}`} />
          <span className="text-white">{s.label}</span>
        </button>
      ))}
    </div>
  );
}
