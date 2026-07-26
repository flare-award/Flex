import { ref, set, get, push, update, remove, onValue, off, query, orderByChild, equalTo, child } from 'firebase/database';
import { db } from './firebase.js';
import { genId, genInviteCode } from './id.js';

export function userGuildsRef(uid) {
  return ref(db, `userGuilds/${uid}`);
}
export function guildRef(guildId) {
  return ref(db, `guilds/${guildId}`);
}
export function guildMembersRef(guildId) {
  return ref(db, `guildMembers/${guildId}`);
}
export function guildChannelsRef(guildId) {
  return ref(db, `guildChannels/${guildId}`);
}
export function guildCategoriesRef(guildId) {
  return ref(db, `guildCategories/${guildId}`);
}
export function messagesRef(channelId) {
  return ref(db, `messages/${channelId}`);
}
export function profileRef(uid) {
  return ref(db, `profiles/${uid}`);
}
export function usernameRef(username) {
  return ref(db, `usernames/${username}`);
}
export function inviteRef(code) {
  return ref(db, `invites/${code}`);
}

export async function createProfile(uid, { email, username, displayName }) {
  const nowTs = Date.now();
  const profile = {
    uid,
    email: email || '',
    username: (username || '').toLowerCase(),
    displayName: displayName || username || 'User',
    avatar: '',
    banner: '',
    bannerColor: '#5865f2',
    color1: '#5865f2',
    color2: '#eb459e',
    status: 'online',
    customStatus: '',
    createdAt: nowTs,
    friendsCount: 0,
  };
  await set(profileRef(uid), profile);
  if (profile.username) {
    await set(usernameRef(profile.username), uid);
  }
  return profile;
}

export async function getProfile(uid) {
  const snap = await get(profileRef(uid));
  return snap.exists() ? snap.val() : null;
}

export async function ensureUsernameMapping(username, uid) {
  const snap = await get(usernameRef(username));
  if (snap.exists() && snap.val() !== uid) {
    throw new Error('Username already taken');
  }
  await set(usernameRef(username), uid);
}

export async function createGuild({ name, ownerId, ownerProfile }) {
  const guildId = genId('g_');
  const nowTs = Date.now();
  const guild = {
    id: guildId,
    name: name.slice(0, 100) || 'New Server',
    ownerId,
    icon: '',
    banner: '',
    createdAt: nowTs,
  };
  // Create guild
  await set(guildRef(guildId), guild);
  // members
  await set(ref(db, `guildMembers/${guildId}/${ownerId}`), {
    uid: ownerId,
    role: 'owner',
    joinedAt: nowTs,
  });
  await set(ref(db, `userGuilds/${ownerId}/${guildId}`), true);

  // default category "Text Channels"
  const catId = genId('cat_');
  await set(ref(db, `guildCategories/${guildId}/${catId}`), {
    id: catId,
    name: 'Text Channels',
    position: 0,
  });

  // #general text channel
  const generalId = genId('ch_');
  await set(ref(db, `guildChannels/${guildId}/${generalId}`), {
    id: generalId,
    guildId,
    name: 'general',
    type: 'text',
    categoryId: catId,
    topic: 'General discussion',
    createdAt: nowTs,
    position: 0,
  });

  // General voice channel for P2P test
  const voiceId = genId('ch_');
  await set(ref(db, `guildChannels/${guildId}/${voiceId}`), {
    id: voiceId,
    guildId,
    name: 'General',
    type: 'voice',
    categoryId: null,
    createdAt: nowTs + 1,
    position: 1,
  });

  return { guild, generalChannelId: generalId, voiceChannelId: voiceId };
}

export async function createInvite({ guildId, createdBy }) {
  const code = genInviteCode(8);
  const data = {
    code,
    guildId,
    createdBy,
    createdAt: Date.now(),
  };
  await set(inviteRef(code), data);
  // also store reference under guildInvites
  await set(ref(db, `guildInvites/${guildId}/${code}`), true);
  return data;
}

export async function joinGuildViaInvite({ code, uid }) {
  const snap = await get(inviteRef(code));
  if (!snap.exists()) throw new Error('Invite not found');
  const invite = snap.val();
  const guildId = invite.guildId;
  // check already member
  const memberSnap = await get(ref(db, `guildMembers/${guildId}/${uid}`));
  if (memberSnap.exists()) {
    return { guildId, already: true };
  }
  const nowTs = Date.now();
  await set(ref(db, `guildMembers/${guildId}/${uid}`), {
    uid,
    role: 'member',
    joinedAt: nowTs,
  });
  await set(ref(db, `userGuilds/${uid}/${guildId}`), true);
  return { guildId, already: false };
}

export async function leaveGuild({ guildId, uid }) {
  await remove(ref(db, `guildMembers/${guildId}/${uid}`));
  await remove(ref(db, `userGuilds/${uid}/${guildId}`));
}

export async function deleteGuild({ guildId }) {
  // delete guild, members, channels, categories, invites, voice, userGuilds references
  // For simplicity we fetch members and userGuilds
  const snapMembers = await get(guildMembersRef(guildId));
  const members = snapMembers.exists() ? Object.keys(snapMembers.val()) : [];
  const promises = [];
  promises.push(remove(guildRef(guildId)));
  promises.push(remove(guildMembersRef(guildId)));
  promises.push(remove(guildChannelsRef(guildId)));
  promises.push(remove(guildCategoriesRef(guildId)));
  // remove guildInvites and invites
  const invSnap = await get(ref(db, `guildInvites/${guildId}`));
  if (invSnap.exists()) {
    const codes = Object.keys(invSnap.val());
    codes.forEach(c => promises.push(remove(inviteRef(c))));
  }
  promises.push(remove(ref(db, `guildInvites/${guildId}`)));
  // voice
  promises.push(remove(ref(db, `voice/${guildId}`)));
  // userGuilds entries
  members.forEach(mUid => {
    promises.push(remove(ref(db, `userGuilds/${mUid}/${guildId}`)));
  });
  await Promise.all(promises);
}

export async function sendMessage({ channelId, authorId, content, replyToId = null }) {
  const msgId = genId('m_');
  const msgRef = ref(db, `messages/${channelId}/${msgId}`);
  const payload = {
    id: msgId,
    channelId,
    authorId,
    content: content ? content.slice(0, 4000) : '',
    ts: Date.now(),
    replyToId: replyToId || null,
  };
  await set(msgRef, payload);
  return payload;
}

export async function createChannel({ guildId, name, type = 'text', categoryId = null }) {
  const chId = genId('ch_');
  await set(ref(db, `guildChannels/${guildId}/${chId}`), {
    id: chId,
    guildId,
    name: (name || 'new-channel').slice(0, 32).toLowerCase().replace(/\s+/g, '-'),
    type,
    categoryId,
    createdAt: Date.now(),
    position: Date.now() % 100000,
  });
  return chId;
}

export async function createCategory({ guildId, name }) {
  const catId = genId('cat_');
  await set(ref(db, `guildCategories/${guildId}/${catId}`), {
    id: catId,
    name: (name || 'New Category').slice(0, 64),
    position: Date.now() % 100000,
  });
  return catId;
}

export async function updateProfile(uid, updates) {
  await update(profileRef(uid), updates);
  if (updates.username) {
    await set(usernameRef(updates.username.toLowerCase()), uid);
  }
}
