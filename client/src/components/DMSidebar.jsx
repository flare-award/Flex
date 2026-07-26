import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useApp } from '../state/AppState.jsx';
import UserPanel from './UserPanel.jsx';

export default function DMSidebar() {
  const { dms, user, notifications } = useApp();
  const navigate = useNavigate();
  return (
    <div className="w-60 bg-flex-sidebar flex flex-col flex-shrink-0">
      <div className="h-12 px-3 flex items-center">
        <input className="input text-sm py-1" placeholder="Find or start a conversation" onFocus={() => navigate('/channels/@me')} />
      </div>
      <div className="px-2 text-sm">
        <NavLink to="/channels/@me" className={({isActive}) => `sidebar-item ${isActive ? 'active' : ''}`}>
          <span className="w-7 h-7 rounded-full bg-flex-sidebar flex items-center justify-center">👥</span> Friends
        </NavLink>
        <div className="sidebar-item" onClick={() => alert('Nitro is not a thing here.')}>
          <span className="w-7 h-7 rounded-full bg-flex-sidebar flex items-center justify-center">🎮</span> Activity
        </div>
      </div>
      <div className="px-3 mt-3 flex items-center justify-between text-xs font-semibold uppercase text-flex-muted">
        <span>Direct Messages</span>
        <button className="text-lg leading-none hover:text-white" title="New DM" onClick={() => alert('Click a friend in Friends view to start a DM')}>+</button>
      </div>
      <div className="flex-1 overflow-y-auto mt-1">
        {dms.map(d => {
          const other = d.isGroup ? null : d.users.find(u => u.id !== user.id);
          const name = d.isGroup ? d.name : (other?.displayName || 'User');
          const initial = (name || '?')[0]?.toUpperCase();
          const unread = notifications['dm:'+d.id] > 0;
          return (
            <NavLink key={d.id} to={`/channels/@me/${d.id}`} className={({isActive}) => `mx-2 px-2 py-1.5 rounded flex items-center gap-2 cursor-pointer ${isActive ? 'bg-flex-active text-white' : unread ? 'text-white hover:bg-flex-hover/60' : 'text-flex-muted hover:bg-flex-hover/60 hover:text-white'}`}>
              <div className="avatar w-8 h-8 bg-flex-accent flex items-center justify-center font-semibold text-white">
                {initial}
              </div>
              <span className="flex-1 truncate text-sm">{name}</span>
              {unread && <span className="w-2 h-2 rounded-full bg-flex-red" />}
            </NavLink>
          );
        })}
        {dms.length === 0 && <div className="px-4 py-2 text-flex-muted text-xs">No DMs yet. Add a friend to start chatting.</div>}
      </div>
      <UserPanel />
    </div>
  );
}
