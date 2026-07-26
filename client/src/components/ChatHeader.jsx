import React from 'react';
export default function ChatHeader({ channel, guild, onSettings, title, subtitle, onTitleClick }) {
  return (
    <div className="h-12 px-4 flex items-center gap-3 border-b border-black/30 shadow-sm flex-shrink-0">
      {channel ? (
        <>
          <span className="text-xl text-flex-muted">{channel.type === 'voice' ? '🔊' : '#'}</span>
          <div className="font-semibold text-white">{channel.name}</div>
          {channel.topic && <div className="h-6 w-px bg-flex-hover mx-2" />}
          {channel.topic && <div className="text-flex-muted text-sm truncate">{channel.topic}</div>}
        </>
      ) : (
        <>
          <div className="font-semibold text-white cursor-pointer" onClick={onTitleClick}>{title}</div>
          {subtitle && <div className="text-flex-muted text-sm">{subtitle}</div>}
        </>
      )}
      <div className="ml-auto flex items-center gap-3 text-flex-muted">
        <button title="Pinned Messages">📌</button>
        <button title="Members">👥</button>
        <button title="Search" onClick={() => alert('Search: start typing with / or press Ctrl+K (coming soon)')}>🔍</button>
        <button title="Inbox">📥</button>
        <button title="Help">❓</button>
        {onSettings && <button title="Channel Settings" onClick={onSettings}>⚙️</button>}
      </div>
    </div>
  );
}
