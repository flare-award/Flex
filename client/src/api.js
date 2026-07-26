// Tiny API client with token handling.
import { API_BASE } from './config.js';

const TOKEN_KEY = 'flex_token';

export function getToken() { return localStorage.getItem(TOKEN_KEY); }
export function setToken(t) { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); }

async function handle(res) {
  const ct = res.headers.get('content-type') || '';
  if (!res.ok) {
    let err = 'Request failed';
    try { err = ct.includes('json') ? (await res.json()).error || err : await res.text(); } catch {}
    throw new Error(err);
  }
  if (ct.includes('json')) return res.json();
  return res.text();
}

function authHeaders() {
  const h = {};
  const t = getToken();
  if (t) h['Authorization'] = 'Bearer ' + t;
  return h;
}

function url(path) { return API_BASE + path; }

export const api = {
  register: (data) => post('/api/auth/register', data),
  login: (data) => post('/api/auth/login', data),
  me: () => get('/api/me'),
  updateMe: (data) => patchForm('/api/me', data),
  getUser: (id) => get('/api/users/' + id),
  guilds: () => get('/api/guilds'),
  guild: (id) => get('/api/guilds/' + id),
  createGuild: (name) => post('/api/guilds', { name }),
  updateGuild: (id, data) => patchForm('/api/guilds/' + id, data),
  deleteGuild: (id) => del('/api/guilds/' + id),
  leaveGuild: (id) => post('/api/guilds/' + id + '/leave', {}),
  joinInvite: (code) => post('/api/invites/' + encodeURIComponent(code) + '/join', {}),
  lookupInvite: (code) => get('/api/invites/lookup/' + encodeURIComponent(code)),
  createChannel: (guildId, data) => post('/api/guilds/' + guildId + '/channels', data),
  createCategory: (guildId, name) => post('/api/guilds/' + guildId + '/categories', { name }),
  updateChannel: (id, data) => patch('/api/channels/' + id, data),
  deleteChannel: (id) => del('/api/channels/' + id),
  createRole: (guildId, data) => post('/api/guilds/' + guildId + '/roles', data),
  updateRole: (guildId, rid, data) => patch('/api/guilds/' + guildId + '/roles/' + rid, data),
  assignRole: (guildId, uid, roleId, add) => post(`/api/guilds/${guildId}/members/${uid}/roles`, { roleId, add }),
  kickMember: (guildId, uid, reason) => post(`/api/guilds/${guildId}/kick/${uid}`, { reason }),
  messages: (channelId) => get('/api/channels/' + channelId + '/messages'),
  sendMessage: (channelId, formData) => postForm('/api/channels/' + channelId + '/messages', formData),
  editMessage: (id, content) => patch('/api/messages/' + id, { content }),
  deleteMessage: (id) => del('/api/messages/' + id),
  react: (id, emoji) => post('/api/messages/' + id + '/react', { emoji }),
  unreact: (id, emoji) => del('/api/messages/' + id + '/react/' + encodeURIComponent(emoji)),
  pin: (id) => post('/api/messages/' + id + '/pin', {}),
  dms: () => get('/api/dms'),
  createDm: (data) => post('/api/dms', data),
  dmMessages: (id) => get('/api/dms/' + id + '/messages'),
  sendDm: (id, formData) => postForm('/api/dms/' + id + '/messages', formData),
  friends: () => get('/api/friends'),
  addFriend: (username) => post('/api/friends/' + username, {}),
  acceptFriend: (id) => post('/api/friends/' + id + '/accept', {}),
  removeFriend: (id) => del('/api/friends/' + id),
};

function get(path) { return fetch(url(path), { headers: authHeaders() }).then(handle); }
function post(path, body) {
  return fetch(url(path), { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) }).then(handle);
}
function patch(path, body) {
  return fetch(url(path), { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) }).then(handle);
}
function del(path) { return fetch(url(path), { method: 'DELETE', headers: authHeaders() }).then(handle); }
function postForm(path, formData) { return fetch(url(path), { method: 'POST', headers: authHeaders(), body: formData }).then(handle); }
function patchForm(path, data) {
  const fd = (data instanceof FormData) ? data : objectToForm(data);
  return fetch(url(path), { method: 'PATCH', headers: authHeaders(), body: fd }).then(handle);
}
function objectToForm(obj) {
  const fd = new FormData();
  for (const k in obj) if (obj[k] != null) fd.append(k, obj[k]);
  return fd;
}
