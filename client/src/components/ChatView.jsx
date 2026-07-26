import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useApp } from '../state/AppState.jsx';
import MessageComposer from './MessageComposer.jsx';
import MessageList from './MessageList.jsx';
import ChatHeader from './ChatHeader.jsx';

export default function ChatView() {
  const { channelId, guildId } = useParams();
  const { selectChannel, activeChannel, guilds, setModal } = useApp();
  const prevId = useRef(channelId);
  useEffect(() => {
    if (channelId && channelId !== prevId.current) { selectChannel(channelId); prevId.current = channelId; }
    // eslint-disable-next-line
  }, [channelId]);
  const guild = guilds.find(g => g.id === guildId);
  const channel = guild?.channels.find(c => c.id === channelId);
  if (!channel) return <div className="flex-1 flex items-center justify-center text-flex-muted">Channel not found</div>;
  return (
    <>
      <ChatHeader channel={channel} guild={guild} onSettings={() => setModal({ type: 'channelSettings', channel, guild })} />
      <MessageList channelId={channelId} />
      <MessageComposer channelId={channelId} placeholder={`Message #${channel.name}`} />
    </>
  );
}
