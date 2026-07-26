import React from 'react';
import { useApp } from '../state/AppState.jsx';
import { initials } from '../utils/format.js';

const STATUS_ORDER = { online: 0, idle: 1, dnd: 2, offline: 3 };

export default function MemberList() {
  const { activeGuild, presence, setModal, user } = useApp();
  if (!activeGuild) return null;
  const ownerId = activeGuild.ownerId;
  const members = activeGuild.members.map(m => {
    const roleIds = activeGuild.memberRoles?.[m.id] || [];
    const role = activeGuild.roles
      .filter(r => roleIds.includes(r.id) && r.name !== '@everyone')
      .sort((a,b) => b.position - a.position)[0];
    return {
      ...m,
      status: presence[m.id] || (m.status || 'offline'),
      color: role?.color || '#99aab5',
      topRole: role || activeGuild.roles.find(r => r.name === '@everyone'),
    };
  });
  // Group by role/online
  const byRole = {};
  const owner = members.find(m => m.id === ownerId);
  const others = members.filter(m => m.id !== ownerId);
  const sorted = others.sort((a,b) => {
    const sa = STATUS_ORDER[a.status] ?? 3;
    const sb = STATUS_ORDER[b.status] ?? 3;
    if (sa !== sb) return sa - sb;
    return a.displayName.localeCompare(b.displayName);
  });
  const online = sorted.filter(m => m.status !== 'offline');
  const offline = sorted.filter(m => m.status === 'offline');

  return (
    <div className="w-60 bg-flex-sidebar flex-shrink-0 overflow-y-auto py-2 hidden md:block">
      {owner && <MemberGroup title="Owner" members={[owner]} />}
      {online.length > 0 && <MemberGroup title={`Online — ${online.length}`} members={online} />}
      {offline.length > 0 && <MemberGroup title={`Offline — ${offline.length}`} members={offline} dim />}
    </div>
  );
}

function MemberGroup({ title, members, dim }) {
  return (
    <div className="mb-2">
      <div className="px-3 py-1 text-xs uppercase font-semibold text-flex-muted tracking-wide">{title}</div>
      {members.map(m => <MemberItem key={m.id} member={m} dim={dim} />)}
    </div>
  );
}

function MemberItem({ member, dim }) {
  const { setModal } = useApp();
  const statusColor = { online: 'bg-flex-green', idle: 'bg-flex-yellow', dnd: 'bg-flex-red', offline: 'bg-gray-500' }[member.status] || 'bg-gray-500';
  return (
    <button onClick={() => setModal({ type: 'profile', user: member })} className={`w-full flex items-center gap-2 px-2 py-1.5 mx-2 rounded hover:bg-flex-hover/60 ${dim ? 'opacity-40' : ''}`} style={{ width: 'calc(100% - 16px)' }}>
      <div className="avatar w-8 h-8 flex items-center justify-center font-semibold" style={{ background: member.color }}>
        {member.avatar ? <img src={member.avatar} className="w-full h-full object-cover" /> : initials(member.displayName)}
        <span className={`status-dot ${statusColor}`} />
      </div>
      <div className="flex-1 text-left min-w-0">
        <div className="truncate text-sm font-medium" style={{ color: member.color }}>{member.displayName}</div>
        {member.customStatus && <div className="text-xs text-flex-muted truncate">{member.customStatus}</div>}
      </div>
    </button>
  );
}
