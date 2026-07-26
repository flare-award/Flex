import React, { useState } from 'react';
import { useApp } from '../state/AppState.jsx';
import { useAuth } from '../state/Auth.jsx';
import { formatContent } from '../utils/format.js';

export default function Message({ msg, compact }) {
  const { user } = useAuth();
  const { editMessage, deleteMessage, toggleReact, togglePin, setModal } = useApp();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(msg.content);
  const [showMenu, setShowMenu] = useState(false);

  async function saveEdit(e) {
    e.preventDefault();
    if (!draft.trim()) return;
    await editMessage(msg, draft);
    setEditing(false);
  }
  function cancelEdit() { setDraft(msg.content); setEditing(false); }

  const quickReactions = ['👍','❤️','😂','😮','😢','🙏'];

  return (
    <div className="relative group" onContextMenu={(e) => { e.preventDefault(); setShowMenu(true); }}>
      {/* Hover toolbar */}
      <div className="absolute -top-3 right-2 hidden group-hover:flex bg-[#2b2d31] border border-black/40 rounded shadow text-sm">
        {quickReactions.map(r => (
          <button key={r} onClick={() => toggleReact(msg, r)} className="px-1.5 py-1 hover:bg-flex-hover">{r}</button>
        ))}
        <button onClick={() => setEditing(true)} className="px-2 py-1 hover:bg-flex-hover text-flex-muted" title="Edit">✏️</button>
        <button onClick={() => togglePin(msg)} className="px-2 py-1 hover:bg-flex-hover text-flex-muted" title="Pin">📌</button>
        <button className="px-2 py-1 hover:bg-flex-hover text-flex-muted" title="Reply" onClick={() => setModal({ type: 'reply', msg })}>↩</button>
        <button onClick={() => setShowMenu(s=>!s)} className="px-2 py-1 hover:bg-flex-hover text-flex-muted">⋯</button>
      </div>

      {/* Reply reference */}
      {msg.replyToId && <ReplyBadge replyToId={msg.replyToId} channelId={msg.channelId} dmId={msg.dmId} />}

      {editing ? (
        <form onSubmit={saveEdit} className="mt-1">
          <input autoFocus className="input w-full" value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{ if (e.key==='Escape') cancelEdit(); }} />
          <div className="text-xs text-flex-muted mt-1">escape to <button type="button" className="text-blue-400 hover:underline" onClick={cancelEdit}>cancel</button> • enter to save</div>
        </form>
      ) : (
        <div className="text-[15px] leading-[1.375rem] text-[#dbdee1] msg-content break-words" dangerouslySetInnerHTML={{ __html: formatContent(msg.content || '') }} />
      )}

      {/* Attachments */}
      {msg.attachments?.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-2">
          {msg.attachments.map(a => {
            const isImage = a.type?.startsWith('image/');
            const isVideo = a.type?.startsWith('video/');
            if (isImage) return <a key={a.id} href={a.url} target="_blank" rel="noreferrer"><img src={a.url} className="max-h-80 max-w-[400px] rounded-md border border-black/30" /></a>;
            if (isVideo) return <video key={a.id} src={a.url} controls className="max-h-80 max-w-[400px] rounded-md" />;
            return <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 bg-flex-sidebar p-2 rounded border border-black/30 hover:border-flex-accent">
              <span>📎</span><span className="text-sm text-blue-400 hover:underline">{a.name}</span><span className="text-xs text-flex-muted">{Math.round(a.size/1024)}KB</span>
            </a>;
          })}
        </div>
      )}

      {/* Reactions */}
      {msg.reactions && Object.keys(msg.reactions).length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {Object.entries(msg.reactions).map(([emoji, users]) => users.length > 0 && (
            <button key={emoji} onClick={() => toggleReact(msg, emoji)} className={`flex items-center gap-1 px-2 py-0.5 rounded border text-sm ${users.includes(user.id) ? 'bg-flex-accent/20 border-flex-accent/50' : 'bg-flex-sidebar border-black/30 hover:border-flex-accent/40'}`}>
              <span>{emoji}</span><span className="text-xs text-flex-muted">{users.length}</span>
            </button>
          ))}
        </div>
      )}
      {msg.editedAt && <span className="text-[10px] text-flex-muted ml-1">(edited)</span>}
      {msg.pinned && <span className="text-[10px] text-flex-muted ml-1">📌</span>}

      {showMenu && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setShowMenu(false)} />
          <div className="context-menu z-40" style={{ top: 'auto', right: '12px' }}>
            <div className="context-item" onClick={()=>{ setShowMenu(false); addReaction(msg, toggleReact); }}>Add Reaction</div>
            <div className="context-item" onClick={()=>{ setShowMenu(false); togglePin(msg); }}>{msg.pinned ? 'Unpin Message' : 'Pin Message'}</div>
            <div className="context-item" onClick={()=>{ setShowMenu(false); navigator.clipboard?.writeText(msg.content || ''); }}>Copy Text</div>
            <div className="context-item" onClick={()=>{ setShowMenu(false); navigator.clipboard?.writeText(msg.id); }}>Copy Message ID</div>
            {msg.authorId === user.id && (
              <>
                <div className="context-item" onClick={()=>{ setShowMenu(false); setEditing(true); }}>Edit Message</div>
                <div className="context-item danger" onClick={()=>{ if (confirm('Delete this message?')) deleteMessage(msg); setShowMenu(false); }}>Delete Message</div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function addReaction(msg, toggleReact) {
  const e = prompt('Emoji to react with:');
  if (e) toggleReact(msg, e.trim());
}

function ReplyBadge({ replyToId, channelId, dmId }) {
  const { messages, dmMessages } = useApp();
  const all = channelId ? (messages[channelId]||[]) : (dmMessages[dmId]||[]);
  const parent = all.find(m => m.id === replyToId);
  if (!parent) return null;
  return (
    <div className="flex items-center gap-2 text-xs text-flex-muted mb-1 -mt-2">
      <span className="w-4 h-3 border-l-2 border-t-2 border-flex-muted rounded-tl-md ml-5" />
      <span className="font-semibold text-white">@{parent.author?.displayName}</span>
      <span className="truncate">{(parent.content || '').slice(0,80)}</span>
    </div>
  );
}
