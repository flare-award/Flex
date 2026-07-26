import http from 'node:http';
import path from 'node:path';
import fs, { existsSync as fsExists } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { Server as IOServer } from 'socket.io';
import { get, save, saveNow, id, userById, userByUsername, userByEmail, guildById, channelById, dmById, guildByInvite, seedIfEmpty, UPLOADS_PATH } from './db.js';
import { signToken, verifyToken, USERNAME_RE, publicUser, authMiddleware } from './auth.js';
import { attachVoiceRelay } from './voice-relay.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
seedIfEmpty();

const app = express();
app.set('trust proxy', true);

// In production, serve from one origin; in dev CORS is open.
const DEV = process.env.NODE_ENV !== 'production';
// CORS: allow all in dev, or allow the specific origin(s) set by CORS_ORIGIN env var.
const CORS_ORIGIN = process.env.CORS_ORIGIN || '';
const corsOptions = DEV
  ? { origin: true, credentials: false }
  : CORS_ORIGIN
    ? { origin: CORS_ORIGIN.split(',').map(s => s.trim()).filter(Boolean), credentials: false }
    : { origin: false };
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/healthz', (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.use('/uploads', express.static(UPLOADS_PATH, { maxAge: '7d', immutable: false }));

// ---- Multer (file uploads) ----
const ALLOWED_IMG = new Set(['image/png','image/jpeg','image/gif','image/webp']);
const ALLOWED_ATTACH = new Set([
  'image/png','image/jpeg','image/gif','image/webp',
  'video/mp4','video/webm','video/quicktime',
  'audio/mpeg','audio/ogg','audio/wav','audio/webm',
  'text/plain','text/markdown','application/pdf','application/zip',
]);
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_PATH),
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').toLowerCase().slice(0, 10);
    cb(null, id('f_') + ext);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, true), // allow all types up to size; client filters
});

// ==================== AUTH ====================
app.post('/api/auth/register', (req, res) => {
  const { email, username, password, displayName } = req.body || {};
  if (!email || !username || !password) return res.status(400).json({ error: 'Заполните все поля' });
  if (!USERNAME_RE.test(username)) return res.status(400).json({ error: 'Никнейм: 2-32 символа, только строчные латинские буквы/цифры/ - _ ~' });
  if (password.length < 6) return res.status(400).json({ error: 'Пароль минимум 6 символов' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Некорректный email' });
  const db = get();
  if (userByEmail(email)) return res.status(409).json({ error: 'Этот email уже используется' });
  if (userByUsername(username)) return res.status(409).json({ error: 'Никнейм занят' });
  const user = {
    id: id('u_'), email: String(email).toLowerCase(), username,
    passwordHash: bcrypt.hashSync(password, 12),
    displayName: (displayName && String(displayName).slice(0, 32)) || username,
    avatar: null, banner: null, bannerColor: '#1e1f22',
    aboutMe: '', status: 'online', customStatus: '',
    createdAt: Date.now(), theme: 'dark', integrations: [],
    profileColor1: '#5865f2', profileColor2: '#eb459e',
    lastUsernameChange: 0,
  };
  db.users.push(user);
  save();
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.post('/api/auth/login', (req, res) => {
  const { emailOrUsername, password } = req.body || {};
  if (!emailOrUsername || !password) return res.status(400).json({ error: 'Заполните все поля' });
  const key = String(emailOrUsername);
  const user = key.includes('@')
    ? get().users.find(u => u.email.toLowerCase() === key.toLowerCase())
    : userByUsername(key.toLowerCase());
  if (!user || !user.passwordHash || !bcrypt.compareSync(password, user.passwordHash)) return res.status(401).json({ error: 'Неверный логин или пароль' });
  user.status = 'online';
  save();
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.get('/api/me', authMiddleware, (req, res) => {
  res.json(publicUser(userById(req.userId)));
});

// ==================== USERS / PROFILE ====================
app.patch('/api/me', authMiddleware, upload.fields([{ name: 'avatar', maxCount: 1 }, { name: 'banner', maxCount: 1 }]), (req, res) => {
  const u = userById(req.userId);
  if (!u) return res.status(404).json({ error: 'Не найден' });
  const b = req.body || {};
  if (b.displayName !== undefined) u.displayName = String(b.displayName).slice(0, 32) || u.username;
  if (b.aboutMe !== undefined) u.aboutMe = String(b.aboutMe).slice(0, 500);
  if (b.status !== undefined && ['online','idle','dnd','offline'].includes(b.status)) u.status = b.status;
  if (b.customStatus !== undefined) u.customStatus = String(b.customStatus).slice(0, 64);
  if (b.bannerColor !== undefined) u.bannerColor = String(b.bannerColor);
  if (b.profileColor1) u.profileColor1 = String(b.profileColor1);
  if (b.profileColor2) u.profileColor2 = String(b.profileColor2);
  if (b.theme !== undefined) u.theme = String(b.theme);
  if (b.username !== undefined && b.username !== u.username) {
    const now = Date.now();
    if (now - (u.lastUsernameChange || 0) < 15*60*1000) return res.status(429).json({ error: 'Ник можно менять раз в 15 минут' });
    if (!USERNAME_RE.test(b.username)) return res.status(400).json({ error: 'Некорректный ник' });
    if (userByUsername(b.username)) return res.status(409).json({ error: 'Ник занят' });
    u.username = b.username;
    u.lastUsernameChange = now;
  }
  if (req.files?.avatar?.[0]) u.avatar = '/uploads/' + req.files.avatar[0].filename;
  if (req.files?.banner?.[0]) u.banner = '/uploads/' + req.files.banner[0].filename;
  if (b.removeAvatar === 'true') u.avatar = null;
  if (b.removeBanner === 'true') u.banner = null;
  save();
  io.to('user:' + u.id).emit('user:update', publicUser(u));
  res.json(publicUser(u));
});

app.get('/api/users/:id', authMiddleware, (req, res) => {
  const u = userById(req.params.id);
  if (!u) return res.status(404).json({ error: 'Не найден' });
  res.json(publicUser(u));
});

// ==================== GUILDS ====================
app.get('/api/guilds', authMiddleware, (req, res) => {
  res.json(get().guilds.filter(g => g.members.includes(req.userId)).map(g => serializeGuild(g, req.userId)));
});

function serializeGuild(g) {
  return {
    id: g.id, name: g.name, icon: g.icon, banner: g.banner, ownerId: g.ownerId,
    members: g.members.map(uid => publicUser(userById(uid))).filter(Boolean),
    roles: g.roles,
    memberRoles: g.memberRoles || {},
    categories: g.categories || [],
    channels: (g.channels || []).map(serializeChannel),
    invites: g.invites || [],
  };
}
function serializeChannel(c) {
  return { id: c.id, guildId: c.guildId, type: c.type, name: c.name, topic: c.topic || '',
    categoryId: c.categoryId, position: c.position || 0, isPrivate: !!c.isPrivate, overwrites: c.overwrites || [] };
}

app.post('/api/guilds', authMiddleware, (req, res) => {
  const { name } = req.body || {};
  if (!name || name.length > 100) return res.status(400).json({ error: 'Некорректное название' });
  const db = get();
  const guildId = id('g_');
  const everyoneId = id('r_');
  const catId = id('cat_');
  const general = { id: id('ch_'), guildId, type: 'text', name: 'general', topic: 'Общий чат', categoryId: catId, position: 0, isPrivate: false, overwrites: [] };
  const voice = { id: id('vc_'), guildId, type: 'voice', name: 'Общий', categoryId: catId, position: 0, isPrivate: false, overwrites: [] };
  const g = {
    id: guildId, name: String(name).slice(0,100), icon: null, banner: null, ownerId: req.userId,
    members: [req.userId],
    roles: [{ id: everyoneId, name: '@everyone', color: '#99aab5', permissions: 0x00000400 | 0x00000800 | 0x00100000 | 0x00200000, position: 0 }],
    memberRoles: { [req.userId]: [everyoneId] },
    invites: [{ code: randomInviteCode(), uses: 0, maxUses: 0, creatorId: req.userId, createdAt: Date.now() }],
    categories: [{ id: catId, name: 'ТЕКСТОВЫЕ КАНАЛЫ', position: 0, channels: [general.id, voice.id] }],
    channels: [general, voice],
    auditLog: [{ id: id('al_'), actorId: req.userId, action: 'guild.create', target: guildId, meta: { name }, ts: Date.now() }],
    defaultMessageNotifications: 'all',
  };
  db.guilds.push(g);
  db.channels.push(general, voice);
  save();
  res.json(serializeGuild(g));
});

app.get('/api/guilds/:id', authMiddleware, (req, res) => {
  const g = guildById(req.params.id);
  if (!g) return res.status(404).json({ error: 'Не найден' });
  if (!g.members.includes(req.userId)) return res.status(403).json({ error: 'Вы не участник сервера' });
  res.json(serializeGuild(g));
});

app.patch('/api/guilds/:id', authMiddleware, upload.fields([{ name: 'icon', maxCount: 1 }, { name: 'banner', maxCount: 1 }]), (req, res) => {
  const g = guildById(req.params.id);
  if (!g) return res.status(404).json({ error: 'Не найден' });
  if (g.ownerId !== req.userId && !hasPermission(g, req.userId, 'MANAGE_GUILD')) return res.status(403).json({ error: 'Нет прав' });
  if (req.body.name) g.name = String(req.body.name).slice(0, 100);
  if (req.files?.icon?.[0]) g.icon = '/uploads/' + req.files.icon[0].filename;
  if (req.files?.banner?.[0]) g.banner = '/uploads/' + req.files.banner[0].filename;
  if (req.body.removeIcon === 'true') g.icon = null;
  if (req.body.removeBanner === 'true') g.banner = null;
  g.auditLog.push({ id: id('al_'), actorId: req.userId, action: 'guild.update', target: g.id, meta: {}, ts: Date.now() });
  save();
  const out = serializeGuild(g);
  broadcastToGuild(g.id, 'guild:update', out);
  res.json(out);
});

app.delete('/api/guilds/:id', authMiddleware, (req, res) => {
  const db = get();
  const idx = db.guilds.findIndex(g => g.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Не найден' });
  const g = db.guilds[idx];
  if (g.ownerId !== req.userId) return res.status(403).json({ error: 'Только владелец может удалить сервер' });
  const chIds = new Set(g.channels.map(c => c.id));
  db.channels = db.channels.filter(c => c.guildId !== g.id);
  db.messages = db.messages.filter(m => !chIds.has(m.channelId));
  db.guilds.splice(idx, 1);
  save();
  broadcastToGuild(g.id, 'guild:delete', { id: g.id });
  res.json({ ok: true });
});

app.post('/api/guilds/:id/leave', authMiddleware, (req, res) => {
  const g = guildById(req.params.id);
  if (!g) return res.status(404).json({ error: 'Не найден' });
  if (g.ownerId === req.userId) return res.status(400).json({ error: 'Владелец не может выйти; передайте права или удалите сервер' });
  g.members = g.members.filter(m => m !== req.userId);
  delete g.memberRoles[req.userId];
  g.auditLog.push({ id: id('al_'), actorId: req.userId, action: 'member.leave', target: req.userId, meta: {}, ts: Date.now() });
  save();
  io.to('guild:' + g.id).emit('guild:update', serializeGuild(g));
  res.json({ ok: true });
});

// Invites
app.get('/api/invites/lookup/:code', (req, res) => {
  const g = guildByInvite(req.params.code);
  if (!g) return res.status(404).json({ error: 'Приглашение не найдено' });
  res.json({ code: req.params.code, guild: { id: g.id, name: g.name, icon: g.icon, memberCount: g.members.length, banner: g.banner } });
});

app.post('/api/invites/:code/join', authMiddleware, (req, res) => {
  const db = get();
  const code = req.params.code;
  const g = db.guilds.find(gg => gg.invites.some(i => i.code === code));
  if (!g) return res.status(404).json({ error: 'Приглашение не найдено' });
  if (!g.members.includes(req.userId)) {
    g.members.push(req.userId);
    const everyone = g.roles.find(r => r.name === '@everyone');
    if (everyone) g.memberRoles[req.userId] = [everyone.id];
    const inv = g.invites.find(i => i.code === code);
    inv.uses++;
    g.auditLog.push({ id: id('al_'), actorId: req.userId, action: 'member.join', target: req.userId, meta: { code }, ts: Date.now() });
    save();
    broadcastToGuild(g.id, 'guild:update', serializeGuild(g));
  }
  res.json(serializeGuild(g));
});

app.post('/api/guilds/:id/invites', authMiddleware, (req, res) => {
  const g = guildById(req.params.id);
  if (!g) return res.status(404).json({ error: 'Не найден' });
  if (!g.members.includes(req.userId)) return res.status(403).json({ error: 'Нет доступа' });
  const code = randomInviteCode();
  g.invites.push({ code, uses: 0, maxUses: 0, creatorId: req.userId, createdAt: Date.now() });
  save();
  res.json({ code, link: `/invite/${code}` });
});

// Channels
app.post('/api/guilds/:id/channels', authMiddleware, (req, res) => {
  const g = guildById(req.params.id);
  if (!g) return res.status(404).json({ error: 'Не найден' });
  if (!hasPermission(g, req.userId, 'MANAGE_CHANNELS')) return res.status(403).json({ error: 'Нет прав' });
  const { type = 'text', name, categoryId = null, isPrivate = false, topic = '' } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Укажите название' });
  const ch = {
    id: type === 'voice' ? id('vc_') : id('ch_'),
    guildId: g.id, type, name: String(name).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9а-яё\-_]/gi,'-').replace(/-+/g,'-').slice(0, 32),
    topic: String(topic).slice(0, 1024), categoryId, position: g.channels.length, isPrivate: !!isPrivate, overwrites: [],
  };
  g.channels.push(ch);
  if (categoryId) {
    const cat = g.categories.find(c => c.id === categoryId);
    if (cat) cat.channels.push(ch.id);
  } else {
    // Auto-create a category if none
    if (g.categories.length === 0) {
      const newCat = { id: id('cat_'), name: type === 'voice' ? 'ГОЛОСОВЫЕ КАНАЛЫ' : 'ТЕКСТОВЫЕ КАНАЛЫ', position: 0, channels: [ch.id] };
      g.categories.push(newCat);
      ch.categoryId = newCat.id;
    }
  }
  save();
  broadcastToGuild(g.id, 'channel:create', ch);
  broadcastToGuild(g.id, 'guild:update', serializeGuild(g));
  res.json(ch);
});

app.patch('/api/channels/:id', authMiddleware, (req, res) => {
  const ch = channelById(req.params.id);
  if (!ch) return res.status(404).json({ error: 'Не найден' });
  const g = ch.guildId ? guildById(ch.guildId) : null;
  if (ch.guildId && !hasPermission(g, req.userId, 'MANAGE_CHANNELS')) return res.status(403).json({ error: 'Нет прав' });
  if (req.body.name) ch.name = String(req.body.name).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9а-яё\-_]/gi,'-').replace(/-+/g,'-').slice(0,32);
  if (req.body.topic !== undefined) ch.topic = String(req.body.topic).slice(0, 1024);
  if (req.body.isPrivate !== undefined) ch.isPrivate = !!req.body.isPrivate;
  if (req.body.categoryId !== undefined) {
    // Move between categories
    if (ch.categoryId) {
      const oldCat = g.categories.find(c => c.id === ch.categoryId);
      if (oldCat) oldCat.channels = oldCat.channels.filter(id => id !== ch.id);
    }
    ch.categoryId = req.body.categoryId || null;
    if (ch.categoryId) {
      const cat = g.categories.find(c => c.id === ch.categoryId);
      if (cat && !cat.channels.includes(ch.id)) cat.channels.push(ch.id);
    }
  }
  save();
  if (g) {
    broadcastToGuild(g.id, 'channel:update', ch);
    broadcastToGuild(g.id, 'guild:update', serializeGuild(g));
  }
  res.json(ch);
});

app.delete('/api/channels/:id', authMiddleware, (req, res) => {
  const db = get();
  const ch = channelById(req.params.id);
  if (!ch) return res.status(404).json({ error: 'Не найден' });
  const g = ch.guildId ? guildById(ch.guildId) : null;
  if (ch.guildId && !hasPermission(g, req.userId, 'MANAGE_CHANNELS')) return res.status(403).json({ error: 'Нет прав' });
  db.channels = db.channels.filter(c => c.id !== ch.id);
  db.messages = db.messages.filter(m => m.channelId !== ch.id);
  if (g) {
    g.channels = g.channels.filter(c => c.id !== ch.id);
    for (const cat of g.categories) cat.channels = cat.channels.filter(cid => cid !== ch.id);
    g.auditLog.push({ id: id('al_'), actorId: req.userId, action: 'channel.delete', target: ch.id, meta: { name: ch.name }, ts: Date.now() });
    broadcastToGuild(g.id, 'channel:delete', { id: ch.id });
    broadcastToGuild(g.id, 'guild:update', serializeGuild(g));
  }
  save();
  res.json({ ok: true });
});

app.post('/api/guilds/:id/categories', authMiddleware, (req, res) => {
  const g = guildById(req.params.id);
  if (!g) return res.status(404).json({ error: 'Не найден' });
  if (!hasPermission(g, req.userId, 'MANAGE_CHANNELS')) return res.status(403).json({ error: 'Нет прав' });
  const cat = { id: id('cat_'), name: String(req.body?.name || 'НОВАЯ КАТЕГОРИЯ').toUpperCase().slice(0, 32), position: g.categories.length, channels: [] };
  g.categories.push(cat);
  save();
  broadcastToGuild(g.id, 'guild:update', serializeGuild(g));
  res.json(cat);
});

// Roles
app.post('/api/guilds/:id/roles', authMiddleware, (req, res) => {
  const g = guildById(req.params.id);
  if (!g) return res.status(404).json({ error: 'Не найден' });
  if (!hasPermission(g, req.userId, 'MANAGE_ROLES')) return res.status(403).json({ error: 'Нет прав' });
  const role = { id: id('r_'), name: String(req.body?.name || 'new role').slice(0, 32), color: req.body?.color || '#99aab5', permissions: 0, position: g.roles.length };
  g.roles.push(role);
  save();
  broadcastToGuild(g.id, 'guild:update', serializeGuild(g));
  res.json(role);
});

app.patch('/api/guilds/:id/roles/:rid', authMiddleware, (req, res) => {
  const g = guildById(req.params.id);
  if (!g) return res.status(404).json({ error: 'Не найден' });
  if (!hasPermission(g, req.userId, 'MANAGE_ROLES')) return res.status(403).json({ error: 'Нет прав' });
  const r = g.roles.find(x => x.id === req.params.rid);
  if (!r) return res.status(404).json({ error: 'Роль не найдена' });
  if (req.body.name !== undefined) r.name = String(req.body.name).slice(0, 32);
  if (req.body.color !== undefined) r.color = String(req.body.color);
  if (req.body.permissions !== undefined) r.permissions = Number(req.body.permissions) | 0;
  save();
  broadcastToGuild(g.id, 'guild:update', serializeGuild(g));
  res.json(r);
});

app.post('/api/guilds/:id/members/:uid/roles', authMiddleware, (req, res) => {
  const g = guildById(req.params.id);
  if (!g) return res.status(404).json({ error: 'Не найден' });
  if (!hasPermission(g, req.userId, 'MANAGE_ROLES')) return res.status(403).json({ error: 'Нет прав' });
  if (!g.members.includes(req.params.uid)) return res.status(400).json({ error: 'Не участник' });
  if (!g.memberRoles[req.params.uid]) g.memberRoles[req.params.uid] = [g.roles.find(r => r.name === '@everyone').id];
  const { roleId, add } = req.body || {};
  const rs = new Set(g.memberRoles[req.params.uid]);
  if (add) rs.add(roleId); else rs.delete(roleId);
  g.memberRoles[req.params.uid] = [...rs];
  save();
  broadcastToGuild(g.id, 'guild:update', serializeGuild(g));
  res.json({ ok: true });
});

app.post('/api/guilds/:id/kick/:uid', authMiddleware, (req, res) => {
  const g = guildById(req.params.id);
  if (!g) return res.status(404).json({ error: 'Не найден' });
  if (!hasPermission(g, req.userId, 'KICK_MEMBERS')) return res.status(403).json({ error: 'Нет прав' });
  if (req.params.uid === g.ownerId) return res.status(400).json({ error: 'Нельзя кикнуть владельца' });
  g.members = g.members.filter(m => m !== req.params.uid);
  delete g.memberRoles[req.params.uid];
  g.auditLog.push({ id: id('al_'), actorId: req.userId, action: 'member.kick', target: req.params.uid, meta: { reason: req.body?.reason || '' }, ts: Date.now() });
  save();
  broadcastToGuild(g.id, 'guild:update', serializeGuild(g));
  res.json({ ok: true });
});

// ==================== MESSAGES ====================
app.get('/api/channels/:id/messages', authMiddleware, (req, res) => {
  const ch = channelById(req.params.id);
  if (!ch) return res.status(404).json({ error: 'Канал не найден' });
  const g = ch.guildId ? guildById(ch.guildId) : null;
  if (ch.guildId && (!g || !g.members.includes(req.userId))) return res.status(403).json({ error: 'Нет доступа' });
  const before = req.query.before ? parseInt(req.query.before) : Date.now() + 1;
  const limit = Math.min(parseInt(req.query.limit) || 100, 100);
  const msgs = get().messages
    .filter(m => m.channelId === ch.id && m.ts < before)
    .sort((a,b) => b.ts - a.ts).slice(0, limit).reverse();
  res.json(msgs.map(serializeMessage));
});

app.post('/api/channels/:id/messages', authMiddleware, upload.array('files', 10), (req, res) => {
  const ch = channelById(req.params.id);
  if (!ch) return res.status(404).json({ error: 'Канал не найден' });
  if (ch.type !== 'text') return res.status(400).json({ error: 'Нельзя писать в голосовой канал' });
  const g = ch.guildId ? guildById(ch.guildId) : null;
  if (ch.guildId && (!g || !g.members.includes(req.userId))) return res.status(403).json({ error: 'Нет доступа' });
  const attachments = (req.files || []).map(f => ({
    id: id('a_'), url: '/uploads/' + f.filename, name: f.originalname, size: f.size, type: f.mimetype,
  }));
  const content = String(req.body?.content || '').slice(0, 4000);
  if (!content && attachments.length === 0) return res.status(400).json({ error: 'Пустое сообщение' });
  const msg = {
    id: id('m_'), channelId: ch.id, authorId: req.userId, content,
    attachments, reactions: {}, replyToId: req.body?.replyToId || null,
    editedAt: null, mentions: extractMentions(content), pinned: false, ts: Date.now(),
  };
  get().messages.push(msg);
  // Cap per-channel history to 5000 messages to keep DB small
  pruneChannel(ch.id);
  save();
  const out = serializeMessage(msg);
  if (g) broadcastToGuild(g.id, 'message:new', out);
  res.json(out);
});

app.patch('/api/messages/:id', authMiddleware, (req, res) => {
  const db = get();
  const m = db.messages.find(x => x.id === req.params.id) || db.dmMessages.find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Не найдено' });
  if (m.authorId !== req.userId) return res.status(403).json({ error: 'Не ваше сообщение' });
  m.content = String(req.body?.content ?? m.content).slice(0, 4000);
  m.editedAt = Date.now();
  m.mentions = extractMentions(m.content);
  save();
  const out = serializeMessage(m);
  const ch = m.channelId ? channelById(m.channelId) : null;
  if (ch?.guildId) broadcastToGuild(ch.guildId, 'message:update', out);
  if (m.dmId) io.to('dm:' + m.dmId).emit('dm:update', out);
  res.json(out);
});

app.delete('/api/messages/:id', authMiddleware, (req, res) => {
  const db = get();
  const mi = db.messages.findIndex(x => x.id === req.params.id);
  const dmi = mi === -1 ? db.dmMessages.findIndex(x => x.id === req.params.id) : -1;
  if (mi === -1 && dmi === -1) return res.status(404).json({ error: 'Не найдено' });
  if (mi !== -1) {
    const m = db.messages[mi];
    const ch = channelById(m.channelId);
    const g = ch?.guildId ? guildById(ch.guildId) : null;
    const canDel = m.authorId === req.userId || (g && hasPermission(g, req.userId, 'MANAGE_MESSAGES'));
    if (!canDel) return res.status(403).json({ error: 'Нет прав' });
    db.messages.splice(mi, 1);
    save();
    if (g) broadcastToGuild(g.id, 'message:delete', { id: m.id, channelId: m.channelId });
  } else {
    const m = db.dmMessages[dmi];
    if (m.authorId !== req.userId) return res.status(403).json({ error: 'Нет прав' });
    db.dmMessages.splice(dmi, 1);
    save();
    io.to('dm:' + m.dmId).emit('dm:delete', { id: m.id });
  }
  res.json({ ok: true });
});

app.post('/api/messages/:id/react', authMiddleware, (req, res) => {
  const m = get().messages.find(x => x.id === req.params.id) || get().dmMessages.find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Не найдено' });
  const emoji = String(req.body?.emoji || '').slice(0, 16);
  if (!emoji) return res.status(400).json({ error: 'Нет эмодзи' });
  m.reactions = m.reactions || {};
  if (!m.reactions[emoji]) m.reactions[emoji] = [];
  if (!m.reactions[emoji].includes(req.userId)) m.reactions[emoji].push(req.userId);
  save();
  const out = serializeMessage(m);
  const ch = m.channelId ? channelById(m.channelId) : null;
  if (ch?.guildId) broadcastToGuild(ch.guildId, 'message:update', out);
  else if (m.dmId) io.to('dm:' + m.dmId).emit('dm:update', out);
  res.json(out);
});

app.delete('/api/messages/:id/react/:emoji', authMiddleware, (req, res) => {
  const m = get().messages.find(x => x.id === req.params.id) || get().dmMessages.find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Не найдено' });
  const emoji = decodeURIComponent(req.params.emoji);
  if (m.reactions?.[emoji]) m.reactions[emoji] = m.reactions[emoji].filter(u => u !== req.userId);
  save();
  res.json({ ok: true });
});

app.post('/api/messages/:id/pin', authMiddleware, (req, res) => {
  const m = get().messages.find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Не найдено' });
  const ch = channelById(m.channelId);
  const g = ch?.guildId ? guildById(ch.guildId) : null;
  if (g && !hasPermission(g, req.userId, 'MANAGE_MESSAGES')) return res.status(403).json({ error: 'Нет прав' });
  m.pinned = !m.pinned;
  save();
  if (g) broadcastToGuild(g.id, 'message:update', serializeMessage(m));
  res.json(serializeMessage(m));
});

// Pin list
app.get('/api/channels/:id/pins', authMiddleware, (req, res) => {
  const ch = channelById(req.params.id);
  if (!ch) return res.status(404).json({ error: 'Не найдено' });
  const pins = get().messages.filter(m => m.channelId === ch.id && m.pinned).sort((a,b)=>b.ts-a.ts);
  res.json(pins.map(serializeMessage));
});

// ==================== DMs ====================
app.get('/api/dms', authMiddleware, (req, res) => {
  const db = get();
  const mine = db.dms.filter(d => d.users.includes(req.userId));
  res.json(mine.map(d => ({
    id: d.id, isGroup: d.isGroup, name: d.name, icon: d.icon,
    users: d.users.map(uid => publicUser(userById(uid))).filter(Boolean),
    lastMessage: db.dmMessages.filter(m => m.dmId === d.id).sort((a,b)=>b.ts-a.ts)[0] || null,
  })));
});

app.post('/api/dms', authMiddleware, (req, res) => {
  const db = get();
  const { userId, userIds, isGroup = false, name = null } = req.body || {};
  const targetUsers = userIds?.length ? userIds : [userId];
  if (!targetUsers.length || targetUsers.some(u => !userById(u))) return res.status(400).json({ error: 'Пользователь не найден' });
  const all = [...new Set([req.userId, ...targetUsers])];
  if (all.length === 2 && !isGroup) {
    const existing = db.dms.find(d => !d.isGroup && d.users.length === 2 && d.users.includes(all[0]) && d.users.includes(all[1]));
    if (existing) return res.json(dmJson(existing));
  }
  const dm = { id: id('dm_'), users: all, isGroup: !!isGroup, name, icon: null };
  db.dms.push(dm);
  save();
  res.json(dmJson(dm));
});

function dmJson(d) {
  return { id: d.id, isGroup: d.isGroup, name: d.name, icon: d.icon,
    users: d.users.map(uid => publicUser(userById(uid))).filter(Boolean) };
}

app.get('/api/dms/:id/messages', authMiddleware, (req, res) => {
  const d = dmById(req.params.id);
  if (!d || !d.users.includes(req.userId)) return res.status(403).json({ error: 'Нет доступа' });
  const msgs = get().dmMessages.filter(m => m.dmId === d.id).sort((a,b)=>a.ts-b.ts).slice(-100);
  res.json(msgs.map(serializeMessage));
});

app.post('/api/dms/:id/messages', authMiddleware, upload.array('files', 10), (req, res) => {
  const d = dmById(req.params.id);
  if (!d || !d.users.includes(req.userId)) return res.status(403).json({ error: 'Нет доступа' });
  const attachments = (req.files || []).map(f => ({ id: id('a_'), url: '/uploads/'+f.filename, name: f.originalname, size: f.size, type: f.mimetype }));
  const content = String(req.body?.content || '').slice(0, 4000);
  if (!content && attachments.length === 0) return res.status(400).json({ error: 'Пусто' });
  const msg = { id: id('dm_'), dmId: d.id, authorId: req.userId, content, attachments, reactions: {}, replyToId: null, editedAt: null, ts: Date.now() };
  get().dmMessages.push(msg);
  save();
  const out = serializeMessage(msg);
  io.to('dm:' + d.id).emit('dm:message', out);
  res.json(out);
});

// ==================== FRIENDS ====================
app.get('/api/friends', authMiddleware, (req, res) => {
  const db = get();
  const mine = db.friends.filter(f => f.a === req.userId || f.b === req.userId);
  res.json(mine.map(f => ({
    id: f.id,
    user: publicUser(userById(f.a === req.userId ? f.b : f.a)),
    status: f.status,
    direction: f.a === req.userId ? 'outgoing' : 'incoming',
  })));
});

app.post('/api/friends/:username', authMiddleware, (req, res) => {
  const db = get();
  const target = db.users.find(u => u.username === req.params.username);
  if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
  if (target.id === req.userId) return res.status(400).json({ error: 'Нельзя добавить себя' });
  const existing = db.friends.find(f => (f.a === req.userId && f.b === target.id) || (f.b === req.userId && f.a === target.id));
  if (existing) return res.status(409).json({ error: 'Уже в друзьях или есть заявка' });
  db.friends.push({ id: id('fr_'), a: req.userId, b: target.id, status: 'pending' });
  save();
  io.to('user:' + target.id).emit('friend:request', { from: publicUser(userById(req.userId)) });
  res.json({ ok: true });
});

app.post('/api/friends/:id/accept', authMiddleware, (req, res) => {
  const f = get().friends.find(x => x.id === req.params.id);
  if (!f || f.b !== req.userId) return res.status(403).json({ error: 'Нет доступа' });
  f.status = 'accepted';
  save();
  io.to('user:' + f.a).emit('friend:update', { id: f.id, status: 'accepted', user: publicUser(userById(req.userId)) });
  res.json({ ok: true });
});

app.delete('/api/friends/:id', authMiddleware, (req, res) => {
  const db = get();
  const idx = db.friends.findIndex(x => x.id === req.params.id && (x.a === req.userId || x.b === req.userId));
  if (idx === -1) return res.status(404).json({ error: 'Не найдено' });
  db.friends.splice(idx, 1);
  save();
  res.json({ ok: true });
});

// ==================== INVITE PAGE (deep link) ====================

app.get('/invite/:code', (_req, res) => {
  // serve the SPA; the client router will pick up /invite/:code
  const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
  const indexHtml = path.join(clientDist, 'index.html');
  if (fsExists(indexHtml)) return res.sendFile(indexHtml);
  res.type('html').send(inviteSplash(_req.params.code));
});

function inviteSplash(code) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Flex — приглашение</title><style>body{margin:0;background:#313338;color:#dbdee1;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;} .box{background:#2b2d31;padding:2rem 2.5rem;border-radius:8px;text-align:center;max-width:420px;} h1{margin:0 0 .5rem;color:#fff;} a{color:#5865f2;}</style></head><body><div class="box"><h1>Flex</h1><p>Приглашение <b>${code}</b>. Запустите Flex клиент и введите этот код, чтобы присоединиться.</p><p><a href="/">Открыть Flex →</a></p></div></body></html>`;
}

// ==================== Helpers ====================
function extractMentions(text) {
  const re = /@([a-z0-9\-_~]{2,32})/g;
  const out = []; let m;
  while ((m = re.exec(text))) {
    const u = get().users.find(x => x.username === m[1]);
    if (u) out.push(u.id);
  }
  return out;
}
function pruneChannel(channelId) {
  const db = get();
  const arr = db.messages.filter(m => m.channelId === channelId).sort((a,b)=>b.ts-a.ts);
  if (arr.length > 5000) {
    const keep = new Set(arr.slice(0, 5000).map(m => m.id));
    db.messages = db.messages.filter(m => m.channelId !== channelId || keep.has(m.id));
  }
}
function serializeMessage(m) {
  return { ...m, author: m.authorId ? publicUser(userById(m.authorId)) : null };
}
function randomInviteCode() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = ''; for (let i=0;i<8;i++) out += chars[Math.floor(Math.random()*chars.length)];
  return out;
}

// Permissions
const PERMS = {
  ADMINISTRATOR: 0x00000008, MANAGE_GUILD: 0x00000020, MANAGE_CHANNELS: 0x00000010,
  MANAGE_ROLES: 0x00001000, KICK_MEMBERS: 0x00000002, BAN_MEMBERS: 0x00000004,
  MANAGE_MESSAGES: 0x00002000, SEND_MESSAGES: 0x00000800,
  CONNECT: 0x00100000, SPEAK: 0x00200000, MUTE_MEMBERS: 0x00400000,
  DEAFEN_MEMBERS: 0x00800000, MOVE_MEMBERS: 0x01000000,
};
function hasPermission(g, userId, permName) {
  if (!g) return false;
  if (g.ownerId === userId) return true;
  const roleIds = g.memberRoles?.[userId] || [];
  const roles = g.roles.filter(r => roleIds.includes(r.id));
  let perms = 0;
  for (const r of roles) perms |= r.permissions;
  if (perms & PERMS.ADMINISTRATOR) return true;
  return !!(perms & PERMS[permName]);
}

// Static client in production
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fsExists(clientDist)) {
  app.use(express.static(clientDist, { fallthrough: true, maxAge: '1d' }));
  app.get(/^\/(?!api|uploads|socket\.io|invite).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// ==================== HTTP + SOCKET.IO ====================
const server = http.createServer(app);
const io = new IOServer(server, {
  cors: DEV
    ? { origin: true }
    : CORS_ORIGIN ? { origin: CORS_ORIGIN.split(',').map(s => s.trim()).filter(Boolean) } : { origin: false },
  maxHttpBufferSize: 1e7, // 10MB for binary audio chunks
  pingInterval: 10_000,
  pingTimeout: 25_000,
  transports: ['websocket', 'polling'],
});

// User socket maps
const connectedUsers = new Map(); // userId -> Set<socketId>
io.of('/').adapter.on('delete-room', () => {});

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    const payload = verifyToken(token);
    if (!payload) return next(new Error('unauthorized'));
    socket.userId = payload.sub;
    next();
  } catch (e) { next(new Error('auth error')); }
});

io.on('connection', (socket) => {
  const userId = socket.userId;
  if (!connectedUsers.has(userId)) connectedUsers.set(userId, new Set());
  connectedUsers.get(userId).add(socket.id);
  socket.join('user:' + userId);

  const u = userById(userId);
  if (u) {
    u.status = u.status === 'offline' ? 'online' : u.status;
    save();
    for (const g of get().guilds.filter(g => g.members.includes(userId))) socket.join('guild:' + g.id);
    for (const d of get().dms.filter(d => d.users.includes(userId))) socket.join('dm:' + d.id);
  }

  socket.emit('ready', { user: publicUser(u), serverTime: Date.now() });
  io.emit('presence', { userId, status: u?.status || 'online' });

  // Re-send guild state on reconnect for quick sync
  socket.on('sync:request', () => {
    if (!u) return;
    const gs = get().guilds.filter(g => g.members.includes(userId)).map(serializeGuild);
    socket.emit('sync:guilds', gs);
  });

  socket.on('typing', ({ channelId, dmId }) => {
    const payload = { userId, name: publicUser(u)?.displayName || u?.username };
    if (channelId) {
      const ch = channelById(channelId);
      if (ch?.guildId) io.to('guild:' + ch.guildId).emit('typing', { channelId, ...payload });
    } else if (dmId) {
      io.to('dm:' + dmId).emit('dm:typing', { dmId, ...payload });
    }
  });

  // Compatibility stubs for old WebRTC events (ignored; relay is primary now)
  socket.on('voice:join', () => {});
  socket.on('voice:leave', () => {});
  socket.on('voice:toggle', () => {});
  socket.on('voice:signal', () => {});
  socket.on('voice:share', () => {});

  // Moderator server mute/deafen through relay
  socket.on('voice:server-toggle', ({ channelId, targetId, key, value }) => {
    const ch = channelById(channelId);
    const g = ch?.guildId ? guildById(ch.guildId) : null;
    if (!g) return;
    const needed = key === 'mute' ? 'MUTE_MEMBERS' : 'DEAFEN_MEMBERS';
    if (!hasPermission(g, userId, needed)) return;
    io.emit('voice:relay-state', { channelId, userId: targetId, key: 'server'+key[0].toUpperCase()+key.slice(1), value: !!value });
  });

  socket.on('disconnect', (reason) => {
    const set = connectedUsers.get(userId);
    if (set) {
      set.delete(socket.id);
      if (set.size === 0) {
        connectedUsers.delete(userId);
        if (u && u.status !== 'offline' && u.status !== 'idle' && u.status !== 'dnd') {
          u.status = 'offline';
          save();
        }
        io.emit('presence', { userId, status: 'offline' });
      }
    }
  });
});

attachVoiceRelay(io);

const PORT = process.env.PORT || 4000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`╔══════════════════════════════════════════════════╗`);
  console.log(`║   Flex server listening on http://0.0.0.0:${PORT}  ║`);
  console.log(`║   Mode: ${DEV ? 'development' : 'production'}${' '.repeat(Math.max(0,38-DEV?11:10))}║`);
  console.log(`╚══════════════════════════════════════════════════╝`);
});
