import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { API_BASE } from '../config.js';
import { api, getToken } from '../api.js';
import { useAuth } from './Auth.jsx';
import { VoiceEngine } from '../voice/VoiceEngine.js';

const AppCtx = createContext(null);

export function AppStateProvider({ children }) {
  const { user } = useAuth();
  const [guilds, setGuilds] = useState([]);
  const [dms, setDms] = useState([]);
  const [friends, setFriends] = useState([]);
  const [activeGuildId, setActiveGuildId] = useState(null);
  const [activeChannelId, setActiveChannelId] = useState(null);
  const [activeDmId, setActiveDmId] = useState(null);
  const [messages, setMessages] = useState({});
  const [dmMessages, setDmMessages] = useState({});
  const [typing, setTyping] = useState({});
  const [dmTyping, setDmTyping] = useState({});
  const [presence, setPresence] = useState({});
  const [voice, setVoice] = useState({ channelId: null, states: {}, connecting: false, mode: 'relay' });
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [notifications, setNotifications] = useState({});
  const [mentions, setMentions] = useState({});
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);
  const voiceRef = useRef(null);
  const voiceSubsRef = useRef({ onState: () => {}, onAudio: () => {}, onPeer: () => {}, onScreen: () => {} });

  // Initial load
  useEffect(() => {
    if (!user) { setGuilds([]); setDms([]); setFriends([]); setActiveGuildId(null); setActiveChannelId(null); setActiveDmId(null); setMessages({}); setDmMessages({}); return; }
    refreshAll();
  }, [user?.id]);

  async function refreshAll() {
    try {
      const [gs, ds, fs] = await Promise.all([api.guilds(), api.dms(), api.friends()]);
      setGuilds(gs); setDms(ds); setFriends(fs);
    } catch (e) { showToast('Не удалось загрузить данные: ' + e.message, 'error'); }
  }

  // Socket with auto-reconnect
  useEffect(() => {
    if (!user) {
      if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; }
      setConnected(false);
      return;
    }
    const s = io(API_BASE || undefined, {
      auth: { token: getToken() },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
      withCredentials: false,
    });
    socketRef.current = s;

    s.on('connect', () => {
      setConnected(true);
      // Re-join guild rooms, request sync
      s.emit('sync:request');
    });
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', () => setConnected(false));

    s.on('sync:guilds', (gs) => {
      setGuilds(prev => {
        // Merge: prefer server data but preserve existing local message state per channel
        return gs;
      });
    });

    s.on('ready', ({ user: me }) => {});
    s.on('user:update', (u) => {
      setGuilds(prev => prev.map(g => ({ ...g, members: g.members.map(m => m.id === u.id ? u : m) })));
      setDms(prev => prev.map(d => ({ ...d, users: d.users.map(m => m.id === u.id ? u : m) })));
    });
    s.on('guild:update', (g) => setGuilds(prev => { const i = prev.findIndex(x => x.id === g.id); if (i === -1) return [...prev, g]; const c = [...prev]; c[i] = g; return c; }));
    s.on('guild:delete', ({ id }) => {
      setGuilds(prev => prev.filter(g => g.id !== id));
      if (activeGuildId === id) { setActiveGuildId(null); setActiveChannelId(null); }
    });
    s.on('channel:create', (ch) => setGuilds(prev => prev.map(g => g.id === ch.guildId ? { ...g, channels: [...g.channels, ch] } : g)));
    s.on('channel:update', (ch) => setGuilds(prev => prev.map(g => g.id === ch.guildId ? { ...g, channels: g.channels.map(c => c.id === ch.id ? ch : c) } : g)));
    s.on('channel:delete', ({ id }) => {
      setGuilds(prev => prev.map(g => ({ ...g, channels: g.channels.filter(c => c.id !== id) })));
      setMessages(prev => { const c = {...prev}; delete c[id]; return c; });
      if (activeChannelId === id) setActiveChannelId(null);
    });
    s.on('message:new', (m) => {
      setMessages(prev => ({ ...prev, [m.channelId]: [...(prev[m.channelId]||[]), m] }));
      if (m.authorId !== user.id) {
        setNotifications(prev => ({ ...prev, [m.channelId]: (prev[m.channelId]||0)+1 }));
        if (m.mentions?.includes?.(user.id)) setMentions(prev => ({ ...prev, [m.channelId]: (prev[m.channelId]||0)+1 }));
        if (activeChannelId !== m.channelId && document.hidden) notify('Новое сообщение', m.author?.displayName + ': ' + (m.content||'вложение'));
      }
    });
    s.on('message:update', (m) => setMessages(prev => ({ ...prev, [m.channelId]: (prev[m.channelId]||[]).map(x => x.id === m.id ? m : x) })));
    s.on('message:delete', ({ id, channelId }) => setMessages(prev => ({ ...prev, [channelId]: (prev[channelId]||[]).filter(x => x.id !== id) })));
    s.on('typing', ({ channelId, userId: uid, name }) => {
      if (uid === user.id) return;
      setTyping(prev => {
        const list = (prev[channelId]||[]).filter(t => t.userId !== uid);
        return { ...prev, [channelId]: [...list, { userId: uid, name, ts: Date.now() }] };
      });
    });
    s.on('dm:message', (m) => {
      setDmMessages(prev => ({ ...prev, [m.dmId]: [...(prev[m.dmId]||[]), m] }));
      setDms(prev => prev.map(d => d.id === m.dmId ? { ...d, lastMessage: m } : d));
      if (m.authorId !== user.id) {
        setNotifications(prev => ({ ...prev, ['dm:'+m.dmId]: (prev['dm:'+m.dmId]||0)+1 }));
        if (activeDmId !== m.dmId && document.hidden) notify('ЛС', m.author?.displayName + ': ' + (m.content||'вложение'));
      }
    });
    s.on('dm:update', (m) => setDmMessages(prev => ({ ...prev, [m.dmId]: (prev[m.dmId]||[]).map(x => x.id===m.id?m:x) })));
      s.on('dm:delete', ({ id, dmId }) => setDmMessages(prev => ({ ...prev, [dmId]: (prev[dmId]||[]).filter(x => x.id !== id) })));
    s.on('dm:typing', ({ dmId, userId: uid, name }) => {
      if (uid === user.id) return;
      setDmTyping(prev => ({ ...prev, [dmId]: [{ userId: uid, name, ts: Date.now() }] }));
    });
    s.on('friend:request', () => { api.friends().then(setFriends); showToast('Новая заявка в друзья'); });
    s.on('friend:update', () => { api.friends().then(setFriends); });
    s.on('presence', ({ userId, status }) => setPresence(prev => ({ ...prev, [userId]: status })));

    // Voice relay events
    s.on('voice:relay-roster', ({ channelId, roster }) => {
      setVoice(v => ({ ...v, channelId, states: Object.fromEntries(roster.map(u => [u.userId, { ...u, streams: v.states?.[u.userId]?.streams || {} }])) }));
    });
    s.on('voice:relay-joined', ({ userId, muted }) => {
      setVoice(v => ({ ...v, states: { ...v.states, [userId]: { userId, muted, deaf: false, speaking: false, serverMuted: false, serverDeaf: false, streams: v.states?.[userId]?.streams || {} } } }));
    });
    s.on('voice:relay-leave', ({ userId }) => {
      setVoice(v => { const s = { ...v.states }; delete s[userId]; return { ...v, states: s }; });
    });
    s.on('voice:relay-state', ({ userId, key, value }) => {
      setVoice(v => {
        const st = v.states[userId]; if (!st) return v;
        const ns = { ...st };
        if (key === 'mute') ns.muted = value;
        if (key === 'deaf') ns.deaf = value;
        if (key === 'speaking') ns.speaking = value;
        if (key === 'serverMute') ns.serverMuted = value;
        if (key === 'serverDeaf') ns.serverDeaf = value;
        return { ...v, states: { ...v.states, [userId]: ns } };
      });
    });
    s.on('voice:relay-speaking', ({ userId, speaking }) => {
      setVoice(v => {
        const st = v.states[userId]; if (!st) return v;
        return { ...v, states: { ...v.states, [userId]: { ...st, speaking } } };
      });
    });
    s.on('voice:relay-share', ({ userId, on }) => {
      setVoice(v => {
        const st = v.states[userId]; if (!st) return v;
        return { ...v, states: { ...v.states, [userId]: { ...st, sharing: on } } };
      });
    });
    s.on('voice:relay-audio', ({ userId, data }) => {
      voiceSubsRef.current.onAudio(userId, data);
    });
    s.on('voice:relay-screen', ({ userId, data, keyframe }) => {
      voiceSubsRef.current.onScreen(userId, data, keyframe);
    });

    return () => { s.disconnect(); socketRef.current = null; setConnected(false); };
    // eslint-disable-next-line
  }, [user?.id]);

  // Typing decay
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      setTyping(prev => {
        let changed = false; const out = {};
        for (const k in prev) { const f = prev[k].filter(t => now - t.ts < 3000); if (f.length) out[k]=f; if (f.length !== prev[k].length) changed = true; }
        return changed ? out : prev;
      });
      setDmTyping(prev => {
        const out = {}; let changed = false;
        for (const k in prev) { const f = prev[k].filter(t => now - t.ts < 3000); if (f.length) out[k]=f; if (f.length !== prev[k].length) changed = true; }
        return changed ? out : prev;
      });
    }, 1500);
    return () => clearInterval(t);
  }, []);

  // Browser notifications
  function notify(title, body) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') new Notification(title, { body });
    else if (Notification.permission !== 'denied') Notification.requestPermission();
  }

  function showToast(msg, kind = 'info') {
    setToast({ msg, kind, id: Math.random() });
    setTimeout(() => setToast(null), 3500);
  }

  async function selectChannel(channelId) {
    setActiveChannelId(channelId); setActiveDmId(null);
    setNotifications(n => ({ ...n, [channelId]: 0 }));
    setMentions(n => ({ ...n, [channelId]: 0 }));
    if (channelId && !messages[channelId]) {
      try {
        const msgs = await api.messages(channelId);
        setMessages(prev => ({ ...prev, [channelId]: msgs }));
      } catch (e) { showToast(e.message, 'error'); }
    }
  }
  async function selectDm(dmId) {
    setActiveDmId(dmId); setActiveChannelId(null);
    setNotifications(n => ({ ...n, ['dm:'+dmId]: 0 }));
    if (dmId && !dmMessages[dmId]) {
      try {
        const msgs = await api.dmMessages(dmId);
        setDmMessages(prev => ({ ...prev, [dmId]: msgs }));
      } catch (e) { showToast(e.message, 'error'); }
    }
  }
  function selectGuild(guildId) {
    setActiveGuildId(guildId); setActiveDmId(null);
    if (guildId && guildId !== '@me') {
      const g = guilds.find(x => x.id === guildId);
      const firstText = g?.channels.find(c => c.type === 'text');
      if (firstText) selectChannel(firstText.id);
    }
  }

  async function sendMessage(content, files = [], replyToId = null) {
    const fd = new FormData();
    if (content) fd.append('content', content);
    if (replyToId) fd.append('replyToId', replyToId);
    files.forEach(f => fd.append('files', f));
    if (activeChannelId) {
      const m = await api.sendMessage(activeChannelId, fd);
      setMessages(prev => ({ ...prev, [activeChannelId]: [...(prev[activeChannelId]||[]), m] }));
    } else if (activeDmId) {
      const m = await api.sendDm(activeDmId, fd);
      setDmMessages(prev => ({ ...prev, [activeDmId]: [...(prev[activeDmId]||[]), m] }));
      setDms(prev => prev.map(d => d.id === activeDmId ? { ...d, lastMessage: m } : d));
    }
  }

  async function editMessage(msg, content) {
    const m = await api.editMessage(msg.id, content);
    if (msg.channelId) setMessages(prev => ({ ...prev, [msg.channelId]: (prev[msg.channelId]||[]).map(x => x.id===m.id?m:x) }));
    else if (msg.dmId) setDmMessages(prev => ({ ...prev, [msg.dmId]: (prev[msg.dmId]||[]).map(x => x.id===m.id?m:x) }));
  }
  async function deleteMessage(msg) {
    await api.deleteMessage(msg.id);
    if (msg.channelId) setMessages(prev => ({ ...prev, [msg.channelId]: (prev[msg.channelId]||[]).filter(x => x.id!==msg.id) }));
    else if (msg.dmId) setDmMessages(prev => ({ ...prev, [msg.dmId]: (prev[msg.dmId]||[]).filter(x => x.id!==msg.id) }));
  }
  async function toggleReact(msg, emoji) {
    const has = msg.reactions?.[emoji]?.includes?.(user.id);
    const m = has ? await api.unreact(msg.id, emoji) : await api.react(msg.id, emoji);
    if (msg.channelId) setMessages(prev => ({ ...prev, [msg.channelId]: (prev[msg.channelId]||[]).map(x => x.id===msg.id?m:x) }));
    else if (msg.dmId) setDmMessages(prev => ({ ...prev, [msg.dmId]: (prev[msg.dmId]||[]).map(x => x.id===msg.id?m:x) }));
  }
  async function togglePin(msg) {
    const m = await api.pin(msg.id);
    if (msg.channelId) setMessages(prev => ({ ...prev, [msg.channelId]: (prev[msg.channelId]||[]).map(x => x.id===msg.id?m:x) }));
  }
  function emitTyping() {
    if (activeChannelId) socketRef.current?.emit('typing', { channelId: activeChannelId });
    else if (activeDmId) socketRef.current?.emit('typing', { dmId: activeDmId });
  }

  // ===== Voice via relay =====
  const joinVoice = useCallback(async (channelId) => {
    if (voiceRef.current) { await leaveVoice(); }
    setVoice(v => ({ ...v, connecting: true, channelId }));
    try {
      const engine = new VoiceEngine({
        sendAudio: (data) => socketRef.current?.emit('voice:relay-audio', { channelId, data }),
        sendState: (key, value) => socketRef.current?.emit('voice:relay-state', { channelId, key, value }),
        sendSpeaking: (speaking) => socketRef.current?.emit('voice:relay-speaking', { channelId, speaking }),
        onRemoteAudio: (userId, blob) => voiceSubsRef.current.onAudio(userId, blob),
      });
      await engine.start();
      voiceRef.current = { engine, channelId };
      socketRef.current?.emit('voice:relay-join', { channelId, mute: false });

      voiceSubsRef.current.onAudio = engine.playRemote.bind(engine);
      voiceSubsRef.current.onScreen = () => {}; // screenshare over relay v2

      setVoice(v => ({ ...v, connecting: false, localMute: false, localDeaf: false, sharing: false }));
    } catch (e) {
      showToast('Доступ к микрофону: ' + e.message, 'error');
      setVoice(v => ({ ...v, connecting: false, channelId: null }));
    }
  }, []);

  async function leaveVoice() {
    if (voiceRef.current) {
      socketRef.current?.emit('voice:relay-leave', { channelId: voiceRef.current.channelId });
      voiceRef.current.engine.stop();
      voiceRef.current = null;
    }
    setVoice({ channelId: null, states: {}, connecting: false });
  }
  async function toggleVoiceMic() {
    const e = voiceRef.current; if (!e) return;
    const muted = e.engine.toggleMute();
    setVoice(v => ({ ...v, localMute: muted }));
  }
  async function toggleVoiceDeaf() {
    const e = voiceRef.current; if (!e) return;
    const deaf = e.engine.toggleDeaf();
    setVoice(v => ({ ...v, localDeaf: deaf }));
  }
  function startScreenshare() {
    showToast('Демонстрация экрана через релейный сервер в разработке; используйте Discord-style UI. P2P-демо работает, если соединение позволяет.', 'info');
  }
  function stopScreenshare() {}
  function serverMute(uid, value) { socketRef.current?.emit('voice:server-toggle', { channelId: voice.channelId, targetId: uid, key: 'mute', value }); }
  function serverDeafen(uid, value) { socketRef.current?.emit('voice:server-toggle', { channelId: voice.channelId, targetId: uid, key: 'deaf', value }); }

  // Refresh helpers
  const refreshGuild = useCallback(async (id) => {
    try { const g = await api.guild(id); setGuilds(prev => prev.map(x => x.id === id ? g : x)); } catch (e) { showToast(e.message, 'error'); }
  }, []);
  const refreshDms = useCallback(() => api.dms().then(setDms), []);
  const refreshFriends = useCallback(() => api.friends().then(setFriends), []);

  const activeGuild = useMemo(() => guilds.find(g => g.id === activeGuildId) || null, [guilds, activeGuildId]);
  const activeChannel = useMemo(() => activeGuild?.channels.find(c => c.id === activeChannelId) || null, [activeGuild, activeChannelId]);
  const activeDm = useMemo(() => dms.find(d => d.id === activeDmId) || null, [dms, activeDmId]);

  const value = {
    user, guilds, dms, friends, presence, connected,
    activeGuildId, activeGuild, activeChannelId, activeChannel, activeDmId, activeDm,
    selectGuild, selectChannel, selectDm, setActiveGuildId,
    messages, dmMessages, sendMessage, editMessage, deleteMessage, toggleReact, togglePin,
    typing, dmTyping, emitTyping,
    voice, joinVoice, leaveVoice, toggleVoiceMic, toggleVoiceDeaf, startScreenshare, stopScreenshare, serverMute, serverDeafen,
    modal, setModal, toast, showToast,
    notifications, mentions, setNotifications, setMentions,
    refreshGuild, refreshDms, refreshFriends, setGuilds, setDms, setFriends, refreshAll,
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export const useApp = () => useContext(AppCtx);
