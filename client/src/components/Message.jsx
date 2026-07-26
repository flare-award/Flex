import React, { useState } from 'react';
import { useAuth } from '../state/Auth.jsx';
import { useApp } from '../state/AppState.jsx';
import { formatContent } from '../utils/format.js';
import { ref, remove } from 'firebase/database';
import { db } from '../lib/firebase.js';

export default function Message({ msg }) {
  const { user } = useAuth();
  const { showToast } = useApp();
  const [showMenu, setShowMenu] = useState(false);

  async function deleteMsg() {
    if (!confirm('Delete this message?')) return;
    try {
      await remove(ref(db, `messages/${msg.channelId}/${msg.id}`));
    } catch (e) { showToast(e.message, 'error'); }
  }

  function copyText() {
    navigator.clipboard?.writeText(msg.content || '').then(() => showToast('Copied'));
  }

  const isOwn = msg.authorId === user?.id;

  return (
    <div className="relative group py-0.5" onContextMenu={(e) => { e.preventDefault(); setShowMenu(true); }}>
      <div className="absolute -top-2 right-2 hidden group-hover:flex bg-[#2b2d31] border border-black/40 rounded shadow text-[12px] z-10">
        <button className="px-2 py-1 hover:bg-flex-hover" title="Copy" onClick={copyText}>📋</button>
        {isOwn && <button className="px-2 py-1 hover:bg-flex-hover text-flex-red" title="Delete" onClick={deleteMsg}>🗑️</button>}
        <button onClick={() => setShowMenu(s=>!s)} className="px-2 py-1 hover:bg-flex-hover">⋯</button>
      </div>

      <div className="text-[15px] leading-[1.375rem] text-[#dbdee1] msg-content break-words" dangerouslySetInnerHTML={{ __html: formatContent(msg.content || '') }} />

      {showMenu && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setShowMenu(false)} />
          <div className="context-menu z-30" style={{ top: '20px', right: '12px' }}>
            <div className="context-item" onClick={()=>{ setShowMenu(false); copyText(); }}>Copy Text</div>
            <div className="context-item" onClick={()=>{ setShowMenu(false); navigator.clipboard?.writeText(msg.id); showToast('ID copied'); }}>Copy Message ID</div>
            {isOwn && <div className="context-item danger" onClick={()=>{ setShowMenu(false); deleteMsg(); }}>Delete Message</div>}
          </div>
        </>
      )}
    </div>
  );
}
