import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../state/AppState.jsx';

export default function MessageComposer({ channelId, dmId, placeholder }) {
  const { sendMessage, emitTyping, activeChannel } = useApp();
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [replyTo, setReplyTo] = useState(null);
  const ta = useRef(null);
  const typingTimer = useRef(null);

  // Listen for reply modal triggering via setModal — handled via modal's onReply prop, but we also expose
  useEffect(() => {
    function onReply(e) {
      if (e.detail?.msg) setReplyTo(e.detail.msg);
    }
    window.addEventListener('flex:reply', onReply);
    return () => window.removeEventListener('flex:reply', onReply);
  }, []);

  function resize() {
    if (!ta.current) return;
    ta.current.style.height = 'auto';
    ta.current.style.height = Math.min(ta.current.scrollHeight, 300) + 'px';
  }

  function onType(e) {
    setText(e.target.value);
    resize();
    if (!typingTimer.current) {
      emitTyping();
      typingTimer.current = setTimeout(() => { typingTimer.current = null; }, 2500);
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (!text.trim() && files.length === 0) return;
    await sendMessage(text, files, replyTo?.id || null);
    setText(''); setFiles([]); setReplyTo(null);
    resize();
  }

  function onFiles(e) {
    const chosen = Array.from(e.target.files || []);
    if (chosen.length) setFiles(prev => [...prev, ...chosen]);
    e.target.value = '';
  }
  function onPaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imgs = [];
    for (const it of items) if (it.kind === 'file') imgs.push(it.getAsFile());
    if (imgs.length) setFiles(prev => [...prev, ...imgs.filter(Boolean)]);
  }
  function onDrop(e) {
    e.preventDefault();
    const fs = Array.from(e.dataTransfer.files || []);
    if (fs.length) setFiles(prev => [...prev, ...fs]);
  }

  // Enter to send, Shift+Enter new line
  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(e); }
  }

  return (
    <div className="px-4 pb-6 pt-1 flex-shrink-0">
      {replyTo && (
        <div className="bg-flex-sidebar rounded-t-md px-3 py-1 text-xs text-flex-muted flex items-center justify-between border-l-2 border-flex-accent">
          <span>Replying to <span className="text-white">{replyTo.author?.displayName}</span></span>
          <button onClick={() => setReplyTo(null)} className="text-flex-muted hover:text-white">✕</button>
        </div>
      )}
      <form onSubmit={submit} className={`bg-[#383a40] rounded-b-md ${replyTo ? 'rounded-t-none' : 'rounded-md'} flex items-end gap-2 px-3 py-2`}
        onDragOver={e=>e.preventDefault()} onDrop={onDrop}>
        <button type="button" className="text-flex-muted hover:text-white text-xl pb-2" title="Upload file" onClick={() => document.getElementById('file-'+(channelId||dmId)).click()}>＋</button>
        <input id={'file-'+(channelId||dmId)} type="file" multiple className="hidden" onChange={onFiles} accept="image/*,video/*,audio/*,.pdf,.zip,.txt,.md" />
        <div className="flex-1 flex flex-col">
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2 pt-1">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-1 bg-black/30 rounded px-2 py-1 text-xs">
                  <span>📎</span><span className="truncate max-w-[140px]">{f.name}</span>
                  <button type="button" onClick={() => setFiles(fs => fs.filter((_,j) => j!==i))} className="text-flex-muted hover:text-white">✕</button>
                </div>
              ))}
            </div>
          )}
          <textarea
            ref={ta}
            rows={1}
            value={text}
            onChange={onType}
            onKeyDown={handleKeyDown}
            onPaste={onPaste}
            placeholder={placeholder || 'Message...'}
            className="w-full bg-transparent outline-none resize-none max-h-[300px] placeholder:text-flex-muted"
          />
        </div>
        <div className="flex items-center gap-2 pb-1 text-flex-muted">
          <button type="button" title="Gift">🎁</button>
          <button type="button" title="GIF">🖼️</button>
          <button type="button" title="Sticker">🏷️</button>
          <button type="button" title="Emoji">😊</button>
        </div>
      </form>
      <div className="text-[11px] text-flex-muted mt-1 px-1">Markdown: **bold** *italic* __underline__ ~~strike~ `code` ```codeblock``` @username. Press Enter to send, Shift+Enter for new line.</div>
    </div>
  );
}
