import React, { useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useApp } from '../state/AppState.jsx';
import MessageList from './MessageList.jsx';
import MessageComposer from './MessageComposer.jsx';
import ChatHeader from './ChatHeader.jsx';

export default function DMView() {
  const { dmId } = useParams();
  const { selectDm, dms, user } = useApp();
  const prev = useRef(dmId);
  useEffect(() => {
    if (dmId && dmId !== prev.current) { selectDm(dmId); prev.current = dmId; }
    // eslint-disable-next-line
  }, [dmId]);
  const dm = dms.find(d => d.id === dmId);
  if (!dm) return <div className="flex-1 flex items-center justify-center text-flex-muted">Conversation not found</div>;
  const other = dm.isGroup ? null : dm.users.find(u => u.id !== user.id);
  const title = dm.isGroup ? (dm.name || 'Group DM') : (other?.displayName || 'DM');
  const subtitle = dm.isGroup ? dm.users.map(u => u.displayName).join(', ') : ('@' + (other?.username || ''));
  return (
    <>
      <ChatHeader title={title} subtitle={subtitle} />
      <MessageList dmId={dmId} />
      <MessageComposer dmId={dmId} placeholder={`Message @${other?.username || title}`} />
    </>
  );
}
