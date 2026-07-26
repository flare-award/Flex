import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../state/AppState.jsx';

export default function MessageComposer({ channelId, placeholder }) {
  const { sendMessage, emitTyping } = useApp();
  const [text, setText] = useState('');
  const ta = useRef(null);
  const typingTimer = useRef(null);

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
    if (!text.trim()) return;
    try {
      await sendMessage(text, [], null);
      setText('');
      resize();
    } catch (e) {
      console.error(e);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(e); }
  }

  return (
    <div className="px-4 pb-6 pt-1 flex-shrink-0">
      <form onSubmit={submit} className="bg-[#383a40] rounded-md flex items-end gap-2 px-3 py-2">
        <div className="flex-1 flex flex-col">
          <textarea
            ref={ta}
            rows={1}
            value={text}
            onChange={onType}
            onKeyDown={handleKeyDown}
            placeholder={placeholder || 'Message #general — realtime via Firebase'}
            className="w-full bg-transparent outline-none resize-none max-h-[300px] placeholder:text-flex-muted"
          />
        </div>
        <button type="submit" className="btn-primary py-1 px-3 text-sm">Send</button>
      </form>
      <div className="text-[11px] text-flex-muted mt-1 px-1">Markdown: **bold** *italic* __underline__ ~~strike~~ `code` ```block``` @username. Press Enter to send, Shift+Enter new line. Firebase Realtime Database.</div>
    </div>
  );
}
