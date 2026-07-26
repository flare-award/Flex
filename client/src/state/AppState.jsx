import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { ref, onValue, off, get, push, set, remove, child, query, orderByChild, limitToLast } from 'firebase/database';
import { db } from '../lib/firebase.js';
import { useAuth } from './Auth.jsx';
import { createGuild as dbCreateGuild, createInvite, joinGuildViaInvite, leaveGuild, deleteGuild as dbDeleteGuild, sendMessage as dbSendMessage, createChannel, createCategory as dbCreateCategory } from '../lib/db.js';
import { VoiceP2P } from '../lib/voiceP2P.js';
import { hasTurnServer } from '../lib/webrtcConfig.js';

const AppCtx = createContext(null);

export function AppStateProvider({ children }) {
  const { user } = useAuth();
  const [guilds, setGuilds] = useState([]);
  const [guildsRaw, setGuildsRaw] = useState({}); // guildId -> guild data
  const [membersRaw, setMembersRaw] = useState({}); // guildId -> {uid: member}
  const [channelsRaw, setChannelsRaw] = useState({}); // guildId -> {chId: ch}
  const [categoriesRaw, setCategoriesRaw] = useState({}); // guildId -> {catId: cat}
  const [profilesCache, setProfilesCache] = useState({}); // uid -> profile

  const [activeGuildId, setActiveGuildId] = useState(null);
  const [activeChannelId, setActiveChannelId] = useState(null);

  const [messages, setMessages] = useState({}); // channelId -> msgs[]
  const [typing, setTyping] = useState({}); // channelId -> [{userId, name, ts}]

  const [voice, setVoice] = useState({ channelId: null, states: {}, connecting: false, localMute: false, localDeaf: false, iceFailed: false, errorMsg: '' });
  const voiceManagerRef = useRef(null);
  const guildListenersRef = useRef({}); // guildId -> unsubscribe fns array

  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);

  const [notifications, setNotifications] = useState({});
  const [mentions, setMentions] = useState({});

  // helpers
  const showToast = useCallback((msg, kind = 'info') => {
    setToast({ msg, kind, id: Math.random() });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Fetch profile for a uid and cache
  const fetchProfile = useCallback(async (uid) => {
    if (profilesCache[uid]) return profilesCache[uid];
    try {
      const snap = await get(ref(db, `profiles/${uid}`));
      if (snap.exists()) {
        const p = snap.val();
        setProfilesCache(prev => ({ ...prev, [uid]: p }));
        return p;
      }
    } catch {}
    return null;
  }, [profilesCache]);

  // Listen to userGuilds
  useEffect(() => {
    if (!user) {
      // clear all
      setGuilds([]);
      setGuildsRaw({});
      setMembersRaw({});
      setChannelsRaw({});
      setCategoriesRaw({});
      setActiveGuildId(null);
      setActiveChannelId(null);
      setMessages({});
      return;
    }
    const uid = user.id;
    const ugRef = ref(db, `userGuilds/${uid}`);
    const cb = onValue(ugRef, (snap) => {
      const val = snap.val() || {};
      const guildIds = Object.keys(val);
      // For each guildId, setup listeners if not already
      guildIds.forEach(gid => {
        if (guildListenersRef.current[gid]) return;
        // guild data
        const gRef = ref(db, `guilds/${gid}`);
        const mRef = ref(db, `guildMembers/${gid}`);
        const chRef = ref(db, `guildChannels/${gid}`);
        const catRef = ref(db, `guildCategories/${gid}`);

        const unsubs = [];

        const gCb = onValue(gRef, (gsnap) => {
          if (!gsnap.exists()) {
            setGuildsRaw(prev => {
              const c = { ...prev };
              delete c[gid];
              return c;
            });
            return;
          }
          setGuildsRaw(prev => ({ ...prev, [gid]: gsnap.val() }));
        });
        unsubs.push(() => off(gRef, 'value', gCb));

        const mCb = onValue(mRef, (msnap) => {
          const membersObj = msnap.val() || {};
          setMembersRaw(prev => ({ ...prev, [gid]: membersObj }));
          // fetch profiles for members
          Object.keys(membersObj).forEach(uid => {
            if (!profilesCache[uid]) fetchProfile(uid);
          });
        });
        unsubs.push(() => off(mRef, 'value', mCb));

        const chCb = onValue(chRef, (csnap) => {
          setChannelsRaw(prev => ({ ...prev, [gid]: csnap.val() || {} }));
        });
        unsubs.push(() => off(chRef, 'value', chCb));

        const catCb = onValue(catRef, (catSnap) => {
          setCategoriesRaw(prev => ({ ...prev, [gid]: catSnap.val() || {} }));
        });
        unsubs.push(() => off(catRef, 'value', catCb));

        guildListenersRef.current[gid] = unsubs;
      });

      // Remove listeners for guilds no longer in list
      Object.keys(guildListenersRef.current).forEach(gid => {
        if (!guildIds.includes(gid)) {
          guildListenersRef.current[gid].forEach(fn => { try { fn(); } catch {} });
          delete guildListenersRef.current[gid];
          setGuildsRaw(prev => {
            const c = { ...prev };
            delete c[gid];
            return c;
          });
          setMembersRaw(prev => {
            const c = { ...prev };
            delete c[gid];
            return c;
          });
          setChannelsRaw(prev => {
            const c = { ...prev };
            delete c[gid];
            return c;
          });
          setCategoriesRaw(prev => {
            const c = { ...prev };
            delete c[gid];
            return c;
          });
        }
      });
    });

    return () => {
      off(ugRef, 'value', cb);
      Object.values(guildListenersRef.current).forEach(arr => arr.forEach(fn => { try { fn(); } catch {} }));
      guildListenersRef.current = {};
    };
  }, [user?.id]);

  // Combine raw into guilds array
  useEffect(() => {
    const list = Object.values(guildsRaw).map(g => {
      const membersObj = membersRaw[g.id] || {};
      const members = Object.values(membersObj).map(m => {
        const prof = profilesCache[m.uid] || { uid: m.uid, displayName: m.uid.slice(0,6), username: m.uid.slice(0,6) };
        return {
          id: m.uid,
          uid: m.uid,
          ...prof,
          role: m.role,
          joinedAt: m.joinedAt,
        };
      });
      const chObj = channelsRaw[g.id] || {};
      const channels = Object.values(chObj).sort((a,b) => (a.position||0)-(b.position||0) || (a.createdAt||0)-(b.createdAt||0));
      const catObj = categoriesRaw[g.id] || {};
      const categories = Object.values(catObj).sort((a,b) => (a.position||0)-(b.position||0));
      // provide memberRoles dummy to keep MemberList compatible? We'll create empty
      return {
        ...g,
        members,
        channels,
        categories,
        memberRoles: {},
        roles: [{ id: 'everyone', name: '@everyone', color: '#99aab5', position: 0 }],
      };
    });
    setGuilds(list);
  }, [guildsRaw, membersRaw, channelsRaw, categoriesRaw, profilesCache]);

  // Active guild & channel helpers
  const activeGuild = useMemo(() => guilds.find(g => g.id === activeGuildId) || null, [guilds, activeGuildId]);
  const activeChannel = useMemo(() => {
    if (!activeGuild) return null;
    return activeGuild.channels.find(c => c.id === activeChannelId) || null;
  }, [activeGuild, activeChannelId]);

  // Messages listening for active channel
  useEffect(() => {
    if (!activeChannelId) return;
    const mRef = ref(db, `messages/${activeChannelId}`);
    const cb = onValue(mRef, (snap) => {
      const val = snap.val() || {};
      const msgs = Object.values(val).sort((a,b) => a.ts - b.ts);
      // need to enrich author profiles
      const enriched = msgs.map(m => {
        const author = profilesCache[m.authorId] || { uid: m.authorId, displayName: m.authorId.slice(0,6), username: m.authorId.slice(0,6) };
        // if author not cached, fetch in background
        if (!profilesCache[m.authorId]) fetchProfile(m.authorId);
        return {
          ...m,
          author: {
            id: author.uid || author.id || m.authorId,
            displayName: author.displayName || author.username || 'User',
            username: author.username || '',
            avatar: author.avatar || '',
          },
        };
      });
      setMessages(prev => ({ ...prev, [activeChannelId]: enriched }));
    });
    return () => off(mRef, 'value', cb);
  }, [activeChannelId]);

  // Also list messages for all channels we need? For now only active channel real-time; but we also need to keep notifications count? We'll do simple.

  // Typing: store in typing/{channelId}/{uid}
  useEffect(() => {
    if (!activeChannelId) return;
    const tRef = ref(db, `typing/${activeChannelId}`);
    const cb = onValue(tRef, (snap) => {
      const val = snap.val() || {};
      const list = Object.entries(val).map(([uid, data]) => ({
        userId: uid,
        name: data.displayName || uid.slice(0,6),
        ts: data.ts,
      })).filter(t => Date.now() - t.ts < 5000 && t.userId !== user?.id);
      setTyping(prev => ({ ...prev, [activeChannelId]: list }));
    });
    return () => off(tRef, 'value', cb);
  }, [activeChannelId, user?.id]);

  // Void for dm typing not needed

  // Functions
  const selectGuild = useCallback((guildId) => {
    setActiveGuildId(guildId);
    if (guildId && guildId !== '@me') {
      const g = guildsRaw[guildId];
      // we should wait for channelsRaw but use logic after? Use latest guilds from state? We'll use channelsRaw directly
      const chMap = channelsRaw[guildId] || {};
      const chList = Object.values(chMap).sort((a,b) => (a.position||0)-(b.position||0));
      const firstText = chList.find(c => c.type === 'text');
      if (firstText) {
        setActiveChannelId(firstText.id);
        setNotifications(n => ({ ...n, [firstText.id]: 0 }));
        setMentions(n => ({ ...n, [firstText.id]: 0 }));
      }
    }
  }, [guildsRaw, channelsRaw]);

  const selectChannel = useCallback((channelId) => {
    setActiveChannelId(channelId);
    setNotifications(n => ({ ...n, [channelId]: 0 }));
    setMentions(n => ({ ...n, [channelId]: 0 }));
  }, []);

  async function sendMessage(content, files = [], replyToId = null) {
    if (!activeChannelId) throw new Error('No channel selected');
    if (!user) throw new Error('Not logged in');
    // files not supported in static version (would need Storage). Warn and ignore.
    if (files && files.length > 0) {
      showToast('Вложения файлов требуют Firebase Storage — пока не подключено. Отправлено только текст.', 'info');
    }
    if (!content.trim()) return;
    await dbSendMessage({ channelId: activeChannelId, authorId: user.id, content, replyToId });
    // no need to manually set messages — onValue will update
  }

  // Voice P2P
  const joinVoice = useCallback(async (channelId) => {
    if (!user) return;
    // find guildId for this channel
    let guildId = null;
    for (const gid of Object.keys(channelsRaw)) {
      if (channelsRaw[gid][channelId]) { guildId = gid; break; }
    }
    if (!guildId) {
      // try from activeGuild
      if (activeGuild) guildId = activeGuild.id;
    }
    if (!guildId) {
      showToast('Не удалось определить сервер для голосового канала', 'error');
      return;
    }

    if (voiceManagerRef.current) {
      await leaveVoice();
    }
    setVoice(v => ({ ...v, connecting: true, channelId, iceFailed: false, errorMsg: '' }));

    try {
      const manager = new VoiceP2P({
        guildId,
        channelId,
        selfUid: user.id,
        selfProfile: user,
        database: db,
      });

      await manager.join({
        onParticipantsChange: (participants) => {
          const states = {};
          participants.forEach(p => {
            states[p.userId] = {
              userId: p.userId,
              user: {
                displayName: p.displayName,
                avatar: p.avatar,
                username: p.username,
              },
              muted: !!p.muted,
              deaf: !!p.deaf,
              speaking: !!p.speaking,
              joinedAt: p.joinedAt,
            };
          });
          setVoice(v => ({ ...v, states }));
        },
        onSpeakingChange: (uid, speaking) => {
          setVoice(v => {
            const st = v.states[uid];
            if (!st) return v;
            return { ...v, states: { ...v.states, [uid]: { ...st, speaking } } };
          });
        },
        onIceStateChange: (uid, connState, iceState) => {
          if (iceState === 'failed' || connState === 'failed') {
            setVoice(v => ({ ...v, iceFailed: true, errorMsg: 'P2P соединение не удалось — возможно, ваша сеть за CGNAT/symmetric NAT и нужен TURN сервер.' }));
          }
        },
        onError: (msg) => {
          console.warn('[voice error]', msg);
          if (msg.toLowerCase().includes('failed') || msg.toLowerCase().includes('turn') || msg.toLowerCase().includes('cgnat')) {
            setVoice(v => ({ ...v, iceFailed: true, errorMsg: msg }));
          }
          showToast(msg, 'error');
        },
      });

      voiceManagerRef.current = manager;
      setVoice(v => ({ ...v, connecting: false, localMute: false, localDeaf: false }));
    } catch (e) {
      console.error('[voice] join failed', e);
      showToast('Не удалось получить доступ к микрофону: ' + e.message, 'error');
      setVoice(v => ({ ...v, connecting: false, channelId: null, errorMsg: e.message }));
    }
  }, [user, channelsRaw, activeGuild, showToast]);

  async function leaveVoice() {
    if (voiceManagerRef.current) {
      try { await voiceManagerRef.current.leave(); } catch {}
      voiceManagerRef.current = null;
    }
    setVoice({ channelId: null, states: {}, connecting: false, localMute: false, localDeaf: false, iceFailed: false, errorMsg: '' });
  }

  async function toggleVoiceMic() {
    if (!voiceManagerRef.current) return;
    const muted = await voiceManagerRef.current.toggleMute();
    setVoice(v => ({ ...v, localMute: muted }));
  }

  async function toggleVoiceDeaf() {
    if (!voiceManagerRef.current) return;
    const deaf = await voiceManagerRef.current.toggleDeaf();
    setVoice(v => ({ ...v, localDeaf: deaf }));
  }

  // Guild actions
  async function createGuild(name) {
    if (!user) throw new Error('Not auth');
    const res = await dbCreateGuild({ name, ownerId: user.id, ownerProfile: user });
    setActiveGuildId(res.guild.id);
    setActiveChannelId(res.generalChannelId);
    showToast('Сервер создан');
    return res;
  }

  async function createInviteForGuild(guildId) {
    if (!user) throw new Error('Not auth');
    const inv = await createInvite({ guildId, createdBy: user.id });
    return inv;
  }

  async function joinInvite(code) {
    if (!user) throw new Error('Not auth');
    const res = await joinGuildViaInvite({ code, uid: user.id });
    setActiveGuildId(res.guildId);
    const chMap = channelsRaw[res.guildId] || {};
    const firstText = Object.values(chMap).find(c => c.type === 'text');
    if (firstText) setActiveChannelId(firstText.id);
    showToast(res.already ? 'Вы уже на этом сервере' : 'Вы присоединились к серверу', 'success');
    return res;
  }

  async function leaveGuildFn(guildId) {
    if (!user) return;
    if (voice.channelId) {
      // check if voice channel belongs to this guild
      const belongs = channelsRaw[guildId] && channelsRaw[guildId][voice.channelId];
      if (belongs) await leaveVoice();
    }
    await leaveGuild({ guildId, uid: user.id });
    if (activeGuildId === guildId) {
      setActiveGuildId(null);
      setActiveChannelId(null);
    }
    showToast('Вы покинули сервер');
  }

  async function deleteGuildFn(guildId) {
    if (voice.channelId) {
      const belongs = channelsRaw[guildId] && channelsRaw[guildId][voice.channelId];
      if (belongs) await leaveVoice();
    }
    await dbDeleteGuild({ guildId });
    if (activeGuildId === guildId) {
      setActiveGuildId(null);
      setActiveChannelId(null);
    }
    showToast('Сервер удалён');
  }

  async function createChannelFn(guildId, { name, type, categoryId }) {
    await createChannel({ guildId, name, type, categoryId });
    showToast(`Канал #${name} создан`);
  }

  async function createCategoryFn(guildId, name) {
    await dbCreateCategory({ guildId, name });
    showToast(`Категория ${name} создана`);
  }

  function emitTyping() {
    if (!activeChannelId || !user) return;
    const tRef = ref(db, `typing/${activeChannelId}/${user.id}`);
    set(tRef, { displayName: user.displayName, ts: Date.now() }).catch(() => {});
    // auto remove after 4s
    setTimeout(() => {
      remove(tRef).catch(() => {});
    }, 4000);
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (voiceManagerRef.current) {
        voiceManagerRef.current.leave().catch(() => {});
      }
    };
  }, []);

  const value = {
    user,
    guilds,
    activeGuildId,
    activeGuild,
    activeChannelId,
    activeChannel,
    selectGuild,
    selectChannel,
    setActiveGuildId,
    messages,
    dmMessages: {},
    sendMessage,
    typing,
    dmTyping: {},
    emitTyping,
    voice,
    joinVoice,
    leaveVoice,
    toggleVoiceMic,
    toggleVoiceDeaf,
    createGuild,
    createInviteForGuild,
    joinInvite,
    leaveGuild: leaveGuildFn,
    deleteGuild: deleteGuildFn,
    createChannel: createChannelFn,
    createCategory: createCategoryFn,
    modal,
    setModal,
    toast,
    showToast,
    notifications,
    mentions,
    setNotifications,
    setMentions,
    connected: true, // always true for firebase (we could track .info/connected)
    hasTurnServer: hasTurnServer(),
    presence: {}, // placeholder for MemberList compatibility
    dms: [],
    friends: [],
    refreshGuild: async () => {},
    refreshAll: async () => {},
    setGuilds,
  };

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export const useApp = () => useContext(AppCtx);
