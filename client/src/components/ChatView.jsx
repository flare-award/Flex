import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useApp } from '../state/AppState.jsx';
import MessageComposer from './MessageComposer.jsx';
import MessageList from './MessageList.jsx';
import ChatHeader from './ChatHeader.jsx';

export default function ChatView() {
  const { channelId, guildId } = useParams();
  const { selectChannel, guilds } = useApp();
  useEffect(() => {
    if (channelId) selectChannel(channelId);
  }, [channelId]);
  const guild = guilds.find(g => g.id === guildId);
  const channel = guild?.channels.find(c => c.id === channelId);
  if (!channel) return <div className="flex-1 flex items-center justify-center text-flex-muted">Channel not found. Выберите канал слева.</div>;
  if (channel.type === 'voice') {
    return (
      <div className="flex-1 flex flex-col">
        <ChatHeader channel={channel} guild={guild} />
        <div className="flex-1 flex items-center justify-center flex-col gap-3 p-8 text-center">
          <div className="text-6xl">🔊</div>
          <div className="text-white font-bold text-lg">Voice channel: {channel.name}</div>
          <div className="text-flex-muted text-sm max-w-md">Нажмите на канал 🔊 слева ещё раз или используйте Join. Голос идёт напрямую между браузерами (P2P). Без TURN в сетях с CGNAT соединение может не установиться — это ожидаемо.</div>
          <div className="text-[11px] text-flex-yellow bg-flex-yellow/10 border border-flex-yellow/20 p-2 rounded max-w-md">Если после Join вы не слышите друг друга — попробуйте другую сеть (домашний Wi-Fi вместо мобильного), включите наушники чтобы избежать эха, проверьте разрешения микрофона в браузере.</div>
        </div>
      </div>
    );
  }
  return (
    <>
      <ChatHeader channel={channel} guild={guild} />
      <MessageList channelId={channelId} />
      <MessageComposer channelId={channelId} placeholder={`Message #${channel.name}`} />
    </>
  );
}
