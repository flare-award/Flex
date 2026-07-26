import React, { useState } from 'react';
import { NavLink, useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../state/AppState.jsx';
import UserPanel from './UserPanel.jsx';

export default function ChannelSidebar() {
  const { activeGuild, selectChannel, notifications, mentions, setModal, user } = useApp();
  const [showMenu, setShowMenu] = useState(false);
  const navigate = useNavigate();
  if (!activeGuild) return <div className="w-60 bg-flex-sidebar flex-shrink-0" />;

  const isOwner = activeGuild.ownerId === user.id;

  return (
    <div className="w-60 bg-flex-sidebar flex flex-col flex-shrink-0">
      <div className="h-12 px-4 flex items-center justify-between border-b border-black/30 shadow-sm cursor-pointer hover:bg-flex-hover/40" onClick={() => setShowMenu(s => !s)}>
        <div className="font-semibold text-white truncate">{activeGuild.name}</div>
        <div className="text-xl leading-none">⌄</div>
      </div>
      {showMenu && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setShowMenu(false)} />
          <div className="context-menu left-[80px] top-[14px] z-40">
            <div className="context-item" onClick={()=>{ setShowMenu(false); setModal({ type: 'invite', guild: activeGuild }); }}>Invite People</div>
            <div className="context-item" onClick={()=>{ setShowMenu(false); setModal({ type: 'guildSettings', guild: activeGuild }); }}>Server Settings</div>
            <div className="context-item" onClick={()=>{ setShowMenu(false); setModal({ type: 'createChannel', guild: activeGuild }); }}>Create Channel</div>
            <div className="context-item" onClick={()=>{ setShowMenu(false); setModal({ type: 'createCategory', guild: activeGuild }); }}>Create Category</div>
            {!isOwner && <div className="context-item danger" onClick={async () => {
              setShowMenu(false);
              const { api } = await import('../api.js');
              await api.leaveGuild(activeGuild.id);
              navigate('/channels/@me');
            }}>Leave Server</div>}
            {isOwner && <div className="context-item danger" onClick={async () => {
              setShowMenu(false);
              if (!confirm('Delete this server? This cannot be undone.')) return;
              const { api } = await import('../api.js');
              await api.deleteGuild(activeGuild.id);
              navigate('/channels/@me');
            }}>Delete Server</div>}
          </div>
        </>
      )}
      <div className="flex-1 overflow-y-auto py-2">
        {/* Channels grouped by category */}
        {activeGuild.categories.map(cat => (
          <CategorySection key={cat.id} category={cat} guild={activeGuild} />
        ))}
        {/* Orphan channels (if any not in a category) */}
        {activeGuild.channels.filter(c => !c.categoryId).map(c => (
          <ChannelItem key={c.id} channel={c} />
        ))}
      </div>
      <UserPanel />
    </div>
  );
}

function CategorySection({ category, guild }) {
  const [collapsed, setCollapsed] = useState(false);
  const { setModal } = useApp();
  const channels = guild.channels.filter(c => c.categoryId === category.id);
  return (
    <div className="mb-1">
      <div className="flex items-center group px-2 py-1 text-flex-muted text-xs uppercase font-semibold tracking-wide cursor-pointer hover:text-white" onClick={() => setCollapsed(c=>!c)}>
        <span className="mr-1">{collapsed ? '▶' : '▼'}</span>
        <span className="flex-1 truncate">{category.name}</span>
        <span className="opacity-0 group-hover:opacity-100 flex gap-1 text-sm">
          <button onClick={(e)=>{ e.stopPropagation(); setModal({ type: 'createChannel', guild, categoryId: category.id }); }} title="Add Channel">+</button>
        </span>
      </div>
      {!collapsed && channels.map(c => <ChannelItem key={c.id} channel={c} />)}
    </div>
  );
}

function ChannelItem({ channel }) {
  const { activeChannelId, selectChannel, notifications, mentions, joinVoice, voice, leaveVoice } = useApp();
  const { guildId } = useParams();
  const isActive = activeChannelId === channel.id;
  const unread = notifications[channel.id] > 0 && !isActive;
  const ment = mentions[channel.id] || 0;
  const isThisVoice = voice.channelId === channel.id && channel.type === 'voice';

  function handleClick() {
    if (channel.type === 'text') selectChannel(channel.id);
    else {
      if (isThisVoice) leaveVoice();
      else joinVoice(channel.id);
    }
  }

  return (
    <div onClick={handleClick} className={`mx-2 px-2 py-1.5 rounded flex items-center gap-1.5 cursor-pointer group ${isActive ? 'bg-flex-active text-white' : unread ? 'text-white hover:bg-flex-hover/60' : 'text-flex-muted hover:bg-flex-hover/60 hover:text-white'}`}>
      <span className="text-xl leading-none w-5 text-center">{channel.type === 'voice' ? '🔊' : '#'}</span>
      <span className="flex-1 truncate text-sm">{channel.name}</span>
      {ment > 0 && <span className="bg-flex-red text-white text-[11px] font-bold rounded-full px-1.5 min-w-[18px] text-center">{ment}</span>}
      {isThisVoice && <span className="text-flex-green text-xs">connected</span>}
    </div>
  );
}
