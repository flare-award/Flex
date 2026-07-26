import React from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import ServerSidebar from '../components/ServerSidebar.jsx';
import ChannelSidebar from '../components/ChannelSidebar.jsx';
import ChatView from '../components/ChatView.jsx';
import MemberList from '../components/MemberList.jsx';
import VoiceOverlay from '../components/VoiceOverlay.jsx';
import ModalHost from '../components/ModalHost.jsx';
import Toast from '../components/Toast.jsx';
import { useApp } from '../state/AppState.jsx';

export default function MainApp() {
  const { activeChannelId, voice } = useApp();

  return (
    <div className="h-full w-full flex flex-col bg-flex-server">
      <div className="flex flex-1 min-h-0">
        <ServerSidebar />
        <ChannelSidebar />
        <div className="flex-1 flex flex-col min-w-0 bg-flex-bg">
          <Routes>
            <Route path=":guildId/:channelId" element={<ChatView />} />
            <Route path=":guildId" element={<SelectChannelPrompt />} />
            <Route path="@me" element={<HomeView />} />
            <Route path="*" element={<SelectChannelPrompt />} />
          </Routes>
        </div>
        {activeChannelId && <MemberList />}
      </div>
      {voice.channelId && <VoiceOverlay />}
      <ModalHost />
      <Toast />
    </div>
  );
}

function SelectChannelPrompt() {
  const { guilds } = useApp();
  return (
    <div className="flex-1 flex items-center justify-center flex-col gap-4 p-8 text-center">
      <div className="w-16 h-16 rounded-full bg-flex-accent flex items-center justify-center text-white text-3xl">F</div>
      <div className="text-white font-bold text-xl">Добро пожаловать в Flex P2P!</div>
      <div className="text-flex-muted text-sm max-w-md">
        Это статическая версия без Node/Express бэкенда. Сообщения и серверы живут в Firebase Realtime Database, голос — напрямую между браузерами через WebRTC P2P.
        {guilds.length === 0 ? ' Создайте сервер слева кнопкой +.' : ' Выберите канал слева.'}
      </div>
      <div className="bg-[#1e1f22] p-3 rounded text-[11px] text-flex-yellow max-w-md border border-flex-yellow/20">
        Голос работает напрямую между браузерами. В некоторых мобильных, корпоративных и CGNAT-сетях соединение без TURN-сервера может не установиться. Это честное ограничение P2P.
      </div>
    </div>
  );
}

function HomeView() {
  const { guilds } = useApp();
  const navigate = useNavigate();
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h2 className="text-2xl font-bold text-white mb-2">Flex P2P — Home</h2>
      <p className="text-flex-muted text-sm mb-4">Бесплатная статическая P2P версия для GitHub Pages. Без Docker, без Socket.IO, без серверного relay.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-flex-sidebar p-4 rounded-md">
          <h3 className="text-white font-semibold mb-2">Ваши серверы ({guilds.length})</h3>
          {guilds.length === 0 ? <div className="text-flex-muted text-sm">Нет серверов. Создайте кнопкой + в левой панели.</div> : guilds.map(g => (
            <button key={g.id} onClick={() => navigate(`/channels/${g.id}/${g.channels.find(c=>c.type==='text')?.id || ''}`)} className="w-full text-left px-3 py-2 rounded hover:bg-flex-hover/60">
              <div className="text-white font-medium">{g.name}</div>
              <div className="text-xs text-flex-muted">{g.channels.length} каналов, {g.members.length} участников</div>
            </button>
          ))}
        </div>
        <div className="bg-flex-sidebar p-4 rounded-md">
          <h3 className="text-white font-semibold mb-2">Как проверить голос</h3>
          <ol className="text-xs text-flex-muted list-decimal ml-4 space-y-1">
            <li>Зарегистрируйте два аккаунта (во вкладках разных браузеров/профилей).</li>
            <li>Создайте сервер, создайте invite, присоединитесь вторым аккаунтом.</li>
            <li>В каждом аккаунте зайдите в voice канал General (🔊).</li>
            <li>Разрешите микрофон, наденьте наушники.</li>
            <li>Если соединение установилось — услышите друг друга. Если ICE failed — сеть требует TURN.</li>
          </ol>
          <div className="mt-3 text-[11px] text-flex-yellow">Без TURN некоторые CGNAT/symmetric NAT подключения не пройдут. Это честно указано и в коде показывается предупреждение.</div>
        </div>
      </div>
    </div>
  );
}
