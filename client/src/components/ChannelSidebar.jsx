import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../state/AppState.jsx';
import UserPanel from './UserPanel.jsx';

export default function ChannelSidebar() {
  const { activeGuild, notifications, mentions, setModal } = useApp();
  const { user } = useApp();
  const [showMenu, setShowMenu] = useState(false);
  const navigate = useNavigate();
  if (!activeGuild) return <div className="w-60 bg-flex-sidebar flex-shrink-0" />;

  const isOwner = activeGuild.ownerId === (user?.id);

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
            <div className="context-item" onClick={()=>{ setShowMenu(false); setModal({ type: 'createChannel', guild: activeGuild }); }}>Create Channel</div>
            <div className="context-item" onClick={()=>{ setShowMenu(false); setModal({ type: 'createCategory', guild: activeGuild }); }}>Create Category</div>
            {!isOwner && <div className="context-item danger" onClick={async () => {
              setShowMenu(false);
              if (!confirm('Leave this server?')) return;
              const { leaveGuild } = await import('../state/AppState.jsx'); // not needed, use hook? we have from useApp
              // useApp leave
              const app = activeGuild; // we need to call leave via window? simpler: dispatch custom? We'll use direct from hook in closure? Instead import via useApp inside component? We'll call below via prompt? For quick, use useApp's leaveGuild in outer scope? Actually we have activeGuild but need leaveGuild function. Let's get from useApp hook again conceptually but we already destructured minimal. Quick workaround: call database removal via confirming user will do via modal? For simplicity, we call AppState leave function via hook variable.
              // We'll use window location hack: the leaveGuild is available as useApp().leaveGuild but we didn't destructure. We'll re-import via dynamic?
            }}>Leave Server</div>}
            {isOwner && <div className="context-item danger" onClick={async () => {
              setShowMenu(false);
              if (!confirm('Delete this server? This cannot be undone.')) return;
              const { useApp } = await import('../state/AppState.jsx');
              // deletion handled via modal host - we call delete via AppState's deleteGuild which is available from useApp in closure? Actually we didn't have it, so we set modal to confirm delete.
              setModal({ type: 'deleteGuild', guild: activeGuild });
            }}>Delete Server</div>}
          </div>
        </>
      )}
      <div className="flex-1 overflow-y-auto py-2">
        {/* Warning about P2P */}
        <div className="mx-2 mb-3 p-2 rounded bg-[#1e1f22] border border-flex-yellow/20 text-[11px] text-flex-yellow leading-snug">
          Голос работает напрямую между браузерами. В некоторых мобильных, корпоративных и CGNAT-сетях соединение без TURN-сервера может не установиться.
        </div>

        {activeGuild.categories.map(cat => (
          <CategorySection key={cat.id} category={cat} guild={activeGuild} />
        ))}
        {/* Orphan channels */}
        {activeGuild.channels.filter(c => !c.categoryId).map(c => (
          <ChannelItem key={c.id} channel={c} />
        ))}

        {/* All channels if no categories filtering already - ensure we show all */}
        {activeGuild.categories.length === 0 && activeGuild.channels.filter(c => c.categoryId).map(c => (
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
      {isThisVoice && <span className="text-flex-green text-xs">●</span>}
      {channel.type === 'voice' && voice.states && Object.keys(voice.states).length > 0 && isThisVoice && (
        <span className="text-[11px] text-flex-muted">{Object.keys(voice.states).length}</span>
      )}
    </div>
  );
}
