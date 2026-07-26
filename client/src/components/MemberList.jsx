import React from 'react';
import { useApp } from '../state/AppState.jsx';
import { initials } from '../utils/format.js';

export default function MemberList() {
  const { activeGuild, setModal } = useApp();
  if (!activeGuild) return null;

  const members = activeGuild.members;

  return (
    <div className="w-60 bg-flex-sidebar flex-shrink-0 overflow-y-auto py-2 hidden md:block">
      <div className="px-3 py-1 text-xs uppercase font-semibold text-flex-muted tracking-wide">Members — {members.length}</div>
      {members.map(m => (
        <button key={m.id} onClick={() => setModal({ type: 'profile', user: m })} className="w-full flex items-center gap-2 px-2 py-1.5 mx-2 rounded hover:bg-flex-hover/60" style={{ width: 'calc(100% - 16px)' }}>
          <div className="avatar w-8 h-8 flex items-center justify-center font-semibold bg-flex-accent">
            {m.avatar ? <img src={m.avatar} className="w-full h-full object-cover" /> : initials(m.displayName)}
          </div>
          <div className="flex-1 text-left min-w-0">
            <div className="truncate text-sm font-medium text-white">{m.displayName}</div>
            <div className="text-xs text-flex-muted truncate">@{m.username}</div>
          </div>
        </button>
      ))}
    </div>
  );
}
