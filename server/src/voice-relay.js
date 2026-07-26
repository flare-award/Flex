// Server-side voice relay (MCU-lite). Works through ANY NAT (CGNAT, symmetric NAT, etc.)
// without requiring TURN. Audio is Opus packets relayed via Socket.IO binary events.
//
// This is the "always works" mode. The client may also try direct P2P WebRTC as an
// optional boost, but the relay ensures cross-border calls between Russia/Moldova
// (or any other tricky NAT combo) always succeed.

const channels = new Map(); // channelId -> Map<userId, {socketId, muted, deaf, speaking, serverMuted, serverDeaf, lastSeen}>
const clients = new Map();  // userId -> socket

function getChan(id) {
  if (!channels.has(id)) channels.set(id, new Map());
  return channels.get(id);
}

export function attachVoiceRelay(io) {
  // Per-socket state
  io.on('connection', (socket) => {
    const userId = socket.userId;
    clients.set(userId, socket);

    // ---- Relay voice events (always-on channel) ----
    socket.on('voice:relay-join', ({ channelId, mute }) => {
      const chan = getChan(channelId);
      // Leave previous channels
      for (const [cid, m] of channels) {
        if (m.has(userId) && cid !== channelId) {
          m.delete(userId);
          io.to('voice:' + cid).emit('voice:relay-leave', { userId });
          io.to('voice:relay:' + cid).emit('relay:left', { userId });
          broadcastPresence(cid);
        }
      }
      chan.set(userId, { socketId: socket.id, muted: !!mute, deaf: false, speaking: false, lastSeen: Date.now() });
      socket.join('voice:relay:' + channelId);
      // Send full roster to the joiner
      const roster = [];
      for (const [uid, s] of chan) {
        roster.push({ userId: uid, muted: s.muted, deaf: s.deaf, speaking: s.speaking, serverMuted: s.serverMuted || false, serverDeaf: s.serverDeaf || false });
      }
      socket.emit('voice:relay-roster', { channelId, roster });
      // Tell others someone joined
      socket.to('voice:relay:' + channelId).emit('voice:relay-joined', { userId, muted: !!mute });
      broadcastPresence(channelId);
    });

    socket.on('voice:relay-leave', ({ channelId }) => {
      leaveRelay(socket, userId, channelId);
    });

    socket.on('voice:relay-state', ({ channelId, key, value }) => {
      const chan = getChan(channelId);
      const s = chan.get(userId);
      if (!s) return;
      if (key === 'mute') s.muted = !!value;
      if (key === 'deaf') s.deaf = !!value;
      io.to('voice:relay:' + channelId).emit('voice:relay-state', { userId, key, value });
      broadcastPresence(channelId);
    });

    // Audio packet: Binary data (Opus frame) -> relay to everyone else in channel
    // Packed format: [seq:u16][ts:u32][opus...] for ordering/lipsync; but we keep it simple.
    socket.on('voice:relay-audio', ({ channelId, data }) => {
      const chan = getChan(channelId);
      const s = chan.get(userId);
      if (!s || s.muted || s.serverMuted) return;
      s.lastSeen = Date.now();
      // fan out
      socket.to('voice:relay:' + channelId).emit('voice:relay-audio', { userId, data });
    });

    socket.on('voice:relay-speaking', ({ channelId, speaking }) => {
      const chan = getChan(channelId);
      const s = chan.get(userId);
      if (!s) return;
      s.speaking = !!speaking;
      io.to('voice:relay:' + channelId).emit('voice:relay-speaking', { userId, speaking: s.speaking });
    });

    // Screen share signaling (tracks are also relayed via the same socket as binary)
    socket.on('voice:relay-share', ({ channelId, on }) => {
      const chan = getChan(channelId);
      if (!chan.has(userId)) return;
      io.to('voice:relay:' + channelId).emit('voice:relay-share', { userId, on });
      broadcastPresence(channelId);
    });
    socket.on('voice:relay-screen', ({ channelId, data, keyframe }) => {
      const chan = getChan(channelId);
      const s = chan.get(userId);
      if (!s || s.deaf || s.serverDeaf) return;
      socket.to('voice:relay:' + channelId).emit('voice:relay-screen', { userId, data, keyframe });
    });

    // Server-side mute/deafen from mods
    socket.on('voice:relay-server-toggle', ({ channelId, targetId, key, value }) => {
      // authorization handled in index.js via canModerate; we just trust server
      const chan = getChan(channelId);
      const s = chan.get(targetId);
      if (!s) return;
      if (key === 'mute') s.serverMuted = !!value;
      if (key === 'deaf') s.serverDeaf = !!value;
      io.to('voice:relay:' + channelId).emit('voice:relay-state', { userId: targetId, key: 'server'+key[0].toUpperCase()+key.slice(1), value: !!value });
      broadcastPresence(channelId);
    });

    socket.on('disconnect', () => {
      clients.delete(userId);
      for (const [cid, m] of channels) {
        if (m.has(userId)) leaveRelay(socket, userId, cid);
      }
    });
  });

  function broadcastPresence(channelId) {
    const chan = getChan(channelId);
    const users = [];
    for (const [uid, s] of chan) users.push({ userId: uid, muted: s.muted, deaf: s.deaf, speaking: s.speaking, serverMuted: !!s.serverMuted, serverDeaf: !!s.serverDeaf });
    io.to('voice:' + channelId).emit('voice:state', { channelId, users });
  }

  function leaveRelay(socket, userId, channelId) {
    const chan = channels.get(channelId);
    if (!chan) return;
    chan.delete(userId);
    socket.leave('voice:relay:' + channelId);
    io.to('voice:relay:' + channelId).emit('voice:relay-leave', { userId });
    if (chan.size === 0) channels.delete(channelId);
    broadcastPresence(channelId);
  }
}

export function relayRosterOf(channelId) {
  const chan = channels.get(channelId);
  if (!chan) return [];
  const out = [];
  for (const [uid, s] of chan) out.push({ userId: uid, ...s });
  return out;
}
