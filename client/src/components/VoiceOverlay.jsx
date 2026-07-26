import React, { useState } from 'react';
import { useApp } from '../state/AppState.jsx';
import { useAuth } from '../state/Auth.jsx';
import { initials } from '../utils/format.js';

export default function VoiceOverlay() {
  const { voice, leaveVoice, toggleVoiceMic, toggleVoiceDeaf, startScreenshare, stopScreenshare, serverMute, serverDeafen, activeGuild } = useApp();
  const { user } = useAuth();
  const [shareOptionsOpen, setShareOptionsOpen] = useState(false);
  const [shareOpts, setShareOpts] = useState({ quality: '1080p', fps: 30, audio: true, codec: 'h264' });
  const ch = activeGuild?.channels.find(c => c.id === voice.channelId);
  const states = Object.values(voice.states || {});

  if (!voice.channelId) return null;

  return (
    <div className="h-[90px] bg-[#232428] border-t border-black/40 flex items-center px-3 gap-3 flex-shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <div className="text-xl">🔊</div>
        <div className="min-w-0">
          <div className="text-white font-semibold text-sm truncate">{ch?.name || 'Голосовой канал'}</div>
          <div className="text-flex-muted text-xs truncate">{activeGuild?.name} • серверный ретранслятор</div>
        </div>
      </div>
      <div className="flex-1 flex gap-2 items-center overflow-x-auto">
        {states.map(s => (
          <VoiceUser key={s.userId} state={s} self={s.userId === user.id} />
        ))}
      </div>
      <div className="flex items-center gap-1">
        <VoiceBtn active={voice.localMute} onClick={toggleVoiceMic} title={voice.localMute ? 'Включить микрофон' : 'Выключить микрофон'}>🎤</VoiceBtn>
        <VoiceBtn active={voice.localDeaf} onClick={toggleVoiceDeaf} title={voice.localDeaf ? 'Включить звук' : 'Заглушить звук'}>🎧</VoiceBtn>
        <VoiceBtn active={voice.sharing} onClick={() => voice.sharing ? stopScreenshare() : setShareOptionsOpen(true)} title="Демонстрация экрана">🖥️</VoiceBtn>
        <button onClick={leaveVoice} className="px-3 h-10 rounded bg-flex-red text-white hover:bg-red-700 font-medium" title="Отключиться">📞</button>
      </div>

      {shareOptionsOpen && (
        <div className="modal-backdrop" onClick={() => setShareOptionsOpen(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="p-5">
              <h3 className="text-white text-lg font-bold mb-3">Демонстрация экрана</h3>
              <p className="text-flex-muted text-sm mb-3">Демонстрация через сервер находится в разработке. Для двоих вы можете поделиться экраном напрямую через WebRTC (работает не при всех NAT).</p>
              <label className="block text-xs font-semibold text-flex-muted uppercase mb-1">Качество</label>
              <select className="input mb-3" value={shareOpts.quality} onChange={e=>setShareOpts({...shareOpts, quality:e.target.value})}>
                <option value="480p">480p — для слабого интернета</option>
                <option value="720p">720p</option>
                <option value="1080p">1080p</option>
                <option value="1440p">1440p — исходное качество</option>
              </select>
              <label className="block text-xs font-semibold text-flex-muted uppercase mb-1">Частота кадров</label>
              <select className="input mb-3" value={shareOpts.fps} onChange={e=>setShareOpts({...shareOpts, fps:Number(e.target.value)})}>
                <option value={15}>15 FPS</option><option value={30}>30 FPS</option><option value={60}>60 FPS</option>
              </select>
              <label className="flex items-center gap-2 mb-3">
                <input type="checkbox" checked={shareOpts.audio} onChange={e=>setShareOpts({...shareOpts, audio:e.target.checked})} /> Со звуком
              </label>
              <label className="block text-xs font-semibold text-flex-muted uppercase mb-1">Кодек</label>
              <select className="input mb-4" value={shareOpts.codec} onChange={e=>setShareOpts({...shareOpts, codec:e.target.value})}>
                <option value="h264">H.264 — лучше при слабом интернете (рекомендуется)</option>
                <option value="av1">AV1 — лучшее качество при хорошем интернете</option>
                <option value="vp8">VP8 — запасной</option>
              </select>
              <div className="flex gap-2 justify-end">
                <button className="btn-secondary" onClick={() => setShareOptionsOpen(false)}>Отмена</button>
                <button className="btn-primary" onClick={async () => { setShareOptionsOpen(false); await startScreenshare(shareOpts); }}>Включить (beta)</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VoiceBtn({ active, onClick, title, children }) {
  return (
    <button onClick={onClick} title={title} className={`w-10 h-10 rounded flex items-center justify-center ${active ? 'bg-flex-red text-white' : 'bg-flex-hover text-white hover:bg-flex-active'}`}>{children}</button>
  );
}

function VoiceUser({ state, self }) {
  const muted = state.muted || state.serverMuted;
  const deafened = state.deaf || state.serverDeaf;
  const adminMute = state.serverMuted;
  const adminDeaf = state.serverDeaf;
  const name = state.user?.displayName || 'Пользователь';
  return (
    <div className={`flex flex-col items-center gap-1 p-1.5 rounded transition-all ${state.speaking ? 'ring-2 ring-flex-green shadow-[0_0_12px_rgba(35,165,90,.5)]' : ''}`}>
      <div className="avatar w-12 h-12 bg-flex-accent flex items-center justify-center font-semibold relative">
        {state.user?.avatar ? <img src={state.user.avatar} className="w-full h-full object-cover" /> : initials(name)}
        <div className="absolute -bottom-0.5 -right-0.5 flex gap-0.5">
          {muted && <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${adminMute ? 'bg-flex-red text-white' : 'bg-flex-hover text-white'}`}>🎤</span>}
          {deafened && <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${adminDeaf ? 'bg-flex-red text-white' : 'bg-flex-hover text-white'}`}>🎧</span>}
          {state.sharing && <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] bg-flex-hover">🖥️</span>}
        </div>
      </div>
      <div className="text-xs text-white max-w-[70px] truncate">{name}{self ? ' (вы)' : ''}</div>
    </div>
  );
}
