import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../state/AppState.jsx';
import Message from './Message.jsx';

export default function MessageList({ channelId, dmId }) {
  const { messages, dmMessages, typing, dmTyping } = useApp();
  const listRef = useRef(null);
  const msgs = channelId ? (messages[channelId] || []) : (dmMessages[dmId] || []);
  const typingNow = channelId ? (typing[channelId] || []) : (dmTyping[dmId] || []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = listRef.current; if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [msgs.length, channelId, dmId]);

  // Group messages from same author within 5 minutes
  const groups = [];
  let last = null;
  for (const m of msgs) {
    if (last && last.author?.id === m.author?.id && m.ts - last.lastTs < 5*60*1000 && !m.replyToId) {
      last.items.push(m); last.lastTs = m.ts;
    } else {
      last = { author: m.author, firstTs: m.ts, lastTs: m.ts, items: [m], isFirst: !last };
      groups.push(last);
    }
  }

  return (
    <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 scroll-smooth">
      {msgs.length === 0 && (
        <div className="text-flex-muted text-sm mt-8">No messages yet. Be the first to say hi!</div>
      )}
      {groups.map((g, gi) => (
        <MessageGroup key={g.items[0].id} group={g} showAvatar={true} />
      ))}
      {typingNow.length > 0 && (
        <div className="flex items-center gap-2 text-flex-muted text-sm mt-2">
          <div className="flex gap-[2px]"><span className="typing-dot" style={{animationDelay:'0ms'}}/><span className="typing-dot" style={{animationDelay:'150ms'}}/><span className="typing-dot" style={{animationDelay:'300ms'}}/></div>
          <span>{typingNow.map(t => t.name).join(', ')} {typingNow.length === 1 ? 'is' : 'are'} typing…</span>
        </div>
      )}
    </div>
  );
}

function MessageGroup({ group }) {
  const a = group.author;
  const initials = a?.displayName?.[0]?.toUpperCase() || '?';
  return (
    <div className="flex gap-3 py-[2px] mt-4 hover:bg-black/10 group/msg px-2 -mx-2 rounded">
      <div className="avatar w-10 h-10 bg-flex-accent flex items-center justify-center font-semibold mt-0.5 flex-shrink-0">
        {a?.avatar ? <img src={a.avatar} className="w-full h-full object-cover" /> : initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-white">{a?.displayName || 'Unknown'}</span>
          <span className="text-xs text-flex-muted">{formatTime(group.firstTs)}</span>
        </div>
        {group.items.map(m => <Message key={m.id} msg={m} compact />)}
      </div>
    </div>
  );
}

function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  if (sameDay) return `Today at ${hh}:${mm}`;
  return d.toLocaleDateString() + ' ' + `${hh}:${mm}`;
}
