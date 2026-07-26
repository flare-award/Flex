import React from 'react';
import { useApp } from '../state/AppState.jsx';
import { useAuth } from '../state/Auth.jsx';
import { initials } from '../utils/format.js';

export default function VoiceOverlay() {
  const { voice, leaveVoice, toggleVoiceMic, toggleVoiceDeaf } = useApp();
  const { user } = useAuth();
  const ch = voice.channelId ? { name: 'Voice' } : null;
  // Try to find channel name from guilds
  const { guilds } = useApp();
  let channelName = 'Голосовой канал';
  let guildName = '';
  for (const g of guilds) {
    const found = g.channels.find(c => c.id === voice.channelId);
    if (found) { channelName = found.name; guildName = g.name; break; }
  }
  const states = Object.values(voice.states || {});
  if (!voice.channelId) return null;

  return (
    <div className="h-auto min-h-[90px] bg-[#232428] border-t border-black/40 flex flex-col flex-shrink-0">
      <div className="h-[90px] flex items-center px-3 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="text-xl">🔊</div>
          <div className="min-w-0">
            <div className="text-white font-semibold text-sm truncate">{channelName}</div>
            <div className="text-flex-muted text-xs truncate">{guildName ? `${guildName} • P2P WebRTC` : 'P2P WebRTC • STUN: stun.l.google.com'}</div>
          </div>
        </div>
        <div className="flex-1 flex gap-2 items-center overflow-x-auto">
          {states.map(s => (
            <VoiceUser key={s.userId} state={s} self={s.userId === user?.id} />
          ))}
          {states.length === 0 && <div className="text-flex-muted text-xs">Ожидание участников…</div>}
        </div>
        <div className="flex items-center gap-1">
          <VoiceBtn active={voice.localMute} onClick={toggleVoiceMic} title={voice.localMute ? 'Включить микрофон' : 'Выключить микрофон'}>🎤{voice.localMute ? '❌' : ''}</VoiceBtn>
          <VoiceBtn active={voice.localDeaf} onClick={toggleVoiceDeaf} title={voice.localDeaf ? 'Включить звук' : 'Заглушить звук'}>🎧{voice.localDeaf ? '❌' : ''}</VoiceBtn>
          <button onClick={leaveVoice} className="px-3 h-10 rounded bg-flex-red text-white hover:bg-red-700 font-medium" title="Отключиться">📞 Leave</button>
        </div>
      </div>
      {voice.iceFailed && (
        <div className="px-3 pb-2">
          <div className="bg-flex-yellow/20 border border-flex-yellow/40 text-flex-yellow text-xs p-2 rounded">
            {voice.errorMsg || 'P2P соединение не удалось.'} <br/>
            <span className="text-[11px] text-flex-muted">Голос работает напрямую между браузерами. В некоторых мобильных, корпоративных и CGNAT-сетях соединение без TURN-сервера может не установиться. Попробуйте другую сеть (Wi-Fi) или добавьте TURN сервер в настройках деплоя.</span>
          </div>
        </div>
      )}
      <div className="px-3 pb-2">
        <div className="text-[10px] text-flex-muted">P2P: {states.length} участников • ICE servers: stun.l.google.com:19302, stun1.l.google.com:19302 • Без TURN CGNAT может не пройти — это ожидаемо.</div>
      </div>
    </div>
  );
}

function VoiceBtn({ active, onClick, title, children }) {
  return (
    <button onClick={onClick} title={title} className={`w-10 h-10 rounded flex items-center justify-center ${active ? 'bg-flex-red text-white' : 'bg-flex-hover text-white hover:bg-flex-active'}`}>{children}</button>
  );
}

function VoiceUser({ state, self }) {
  const muted = state.muted;
  const deafened = state.deaf;
  const name = state.user?.displayName || state.displayName || 'User';
  const avatar = state.user?.avatar || state.avatar || '';
  return (
    <div className={`flex flex-col items-center gap-1 p-1.5 rounded transition-all ${state.speaking ? 'ring-2 ring-flex-green shadow-[0_0_12px_rgba(35,165,90,.5)]' : ''}`}>
      <div className="avatar w-12 h-12 bg-flex-accent flex items-center justify-center font-semibold relative">
        {avatar ? <img src={avatar} className="w-full h-full object-cover" /> : initials(name)}
        <div className="absolute -bottom-0.5 -right-0.5 flex gap-0.5">
          {muted && <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] bg-flex-red text-white">🎤</span>}
          {deafened && <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] bg-flex-red text-white">🎧</span>}
        </div>
        {state.speaking && <span className="absolute -top-1 -right-1 w-3 h-3 bg-flex-green rounded-full animate-pulse border-2 border-[#232428]" />}
      </div>
      <div className="text-xs text-white max-w-[70px] truncate">{name}{self ? ' (вы)' : ''}</div>
      <div className="text-[10px] text-flex-muted">{muted ? 'muted' : state.speaking ? 'speaking' : ''}</div>
    </div>
  );
}
