// Production-grade JSON store with atomic writes, auto-backups, and corruption recovery.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.FLEX_DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

for (const d of [DATA_DIR, BACKUP_DIR, UPLOADS_DIR]) if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });

const defaultDB = () => ({
  _version: 2,
  users: [],
  guilds: [],
  channels: [],
  messages: [],
  dms: [],
  dmMessages: [],
  friends: [],
  invites: [],
  stickers: [],
});

let db = null;
let saveTimer = null;
let dirty = false;

function atomicWrite(obj, file) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.fsyncSync(fs.openSync(tmp, 'r+'));
  fs.renameSync(tmp, file);
}

function load() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      db = JSON.parse(raw);
      // Backup once per hour at most
      const hourly = path.join(BACKUP_DIR, `db-${new Date().toISOString().slice(0,13)}.json`);
      if (!fs.existsSync(hourly)) {
        try { atomicWrite(db, hourly); } catch {}
        // Keep last 48 hourly backups
        const files = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('db-')).sort();
        while (files.length > 48) { try { fs.unlinkSync(path.join(BACKUP_DIR, files.shift())); } catch {} }
      }
    } else {
      db = defaultDB();
      atomicWrite(db, DB_FILE);
    }
    // Ensure defaults/backwards compat
    const d = defaultDB();
    for (const k of Object.keys(d)) if (db[k] === undefined) db[k] = d[k];
    db._version = 2;
  } catch (e) {
    console.error('[db] load failed, attempting backup recovery:', e.message);
    // Try latest backup
    const backups = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('db-')).sort().reverse();
    for (const b of backups) {
      try {
        db = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, b), 'utf8'));
        console.error('[db] recovered from backup:', b);
        atomicWrite(db, DB_FILE);
        break;
      } catch {}
    }
    if (!db) {
      console.error('[db] no backup available, starting fresh.');
      db = defaultDB();
      atomicWrite(db, DB_FILE);
    }
  }
}

function scheduleSave() {
  dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (dirty) {
      try { atomicWrite(db, DB_FILE); dirty = false; }
      catch (e) { console.error('[db] save failed:', e.message); }
    }
  }, 500);
}

// Immediate save on SIGINT/SIGTERM
process.on('SIGINT', () => { try { atomicWrite(db, DB_FILE); } catch {} process.exit(0); });
process.on('SIGTERM', () => { try { atomicWrite(db, DB_FILE); } catch {} process.exit(0); });

load();

export const DB_PATH = DB_FILE;
export const UPLOADS_PATH = UPLOADS_DIR;
export function get() { return db; }
export function save() { dirty = true; scheduleSave(); }
export function saveNow() { if (dirty || !db) { atomicWrite(db, DB_FILE); dirty = false; } }

export function id(prefix = '') {
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function userById(i) { return db.users.find(u => u.id === i); }
export function userByUsername(name) { return db.users.find(u => u.username === name); }
export function userByEmail(email) { return db.users.find(u => u.email.toLowerCase() === email.toLowerCase()); }
export function guildById(i) { return db.guilds.find(g => g.id === i); }
export function channelById(i) { return db.channels.find(c => c.id === i); }
export function dmById(i) { return db.dms.find(d => d.id === i); }
export function messageById(i) { return db.messages.find(m => m.id === i) || db.dmMessages.find(m => m.id === i); }
export function guildByInvite(code) { return db.guilds.find(g => g.invites.some(i => i.code === code)); }

export function seedIfEmpty() {
  if (db.users.length > 0) return;
  console.log('[db] Seeding demo content for you and a friend…');
  console.log('[db] TIP: Register your own account via the UI and delete demo users when ready.');

  const adminId = id('u_');
  const friendId = id('u_');
  db.users.push({
    id: adminId, email: 'demo@flex.app', username: 'demo',
    passwordHash: bcrypt.hashSync('demo1234', 12),
    displayName: 'Demo User', avatar: null, banner: null, bannerColor: '#1e1f22',
    aboutMe: 'Welcome to Flex! Edit your profile in settings ⚙️.',
    status: 'online', customStatus: 'Trying out Flex 🚀',
    createdAt: Date.now(), theme: 'dark', integrations: [],
    profileColor1: '#5865f2', profileColor2: '#eb459e',
    lastUsernameChange: 0,
  });
  db.users.push({
    id: friendId, email: 'friend@flex.app', username: 'friend',
    passwordHash: bcrypt.hashSync('friend1234', 12),
    displayName: 'Friend', avatar: null, banner: null, bannerColor: '#1e1f22',
    aboutMe: 'Hey! This is the second demo account.',
    status: 'online', customStatus: '',
    createdAt: Date.now(), theme: 'dark', integrations: [],
    profileColor1: '#57f287', profileColor2: '#00b36e',
    lastUsernameChange: 0,
  });

  const guildId = id('g_');
  const everyoneId = id('r_');
  const modId = id('r_');
  const adminRoleId = id('r_');
  const catId = id('cat_');

  const general = { id: id('ch_'), guildId, type: 'text', name: 'general', topic: 'Главный чат — общайтесь здесь.', categoryId: catId, position: 0, isPrivate: false, overwrites: [] };
  const random = { id: id('ch_'), guildId, type: 'text', name: 'random', topic: 'Оффтоп, мемы, ссылки', categoryId: catId, position: 1, isPrivate: false, overwrites: [] };
  const voice = { id: id('vc_'), guildId, type: 'voice', name: 'Голосовой', categoryId: catId, position: 0, isPrivate: false, overwrites: [] };

  db.guilds.push({
    id: guildId, name: 'Flex Lounge', icon: null, banner: null, ownerId: adminId,
    members: [adminId, friendId],
    roles: [
      { id: everyoneId, name: '@everyone', color: '#99aab5', permissions: 0x00000400 | 0x00000800 | 0x00100000 | 0x00200000, position: 0 },
      { id: modId, name: 'Mod', color: '#f47b67', permissions: 0x00000002 | 0x00000004 | 0x00002000 | 0x00400000 | 0x00800000 | 0x01000000, position: 1 },
      { id: adminRoleId, name: 'Admin', color: '#5865f2', permissions: 0xffffffff, position: 2 },
    ],
    memberRoles: { [adminId]: [adminRoleId, everyoneId], [friendId]: [everyoneId] },
    invites: [{ code: 'flex-home', uses: 0, maxUses: 0, creatorId: adminId, createdAt: Date.now() }],
    categories: [{ id: catId, name: 'ОБЩЕЕ', position: 0, channels: [general.id, random.id, voice.id] }],
    channels: [general, random, voice],
    auditLog: [],
    defaultMessageNotifications: 'all',
  });
  db.channels.push(general, random, voice);

  db.messages.push({
    id: id('m_'), channelId: general.id, authorId: adminId,
    content: '👋 Добро пожаловать в **Flex**! Это демонстрационный сервер. Заходите в #general или в голосовой канал.',
    attachments: [], reactions: {}, replyToId: null, editedAt: null, mentions: [], pinned: true, ts: Date.now() - 60_000,
  });
  db.messages.push({
    id: id('m_'), channelId: general.id, authorId: friendId,
    content: 'Привет! 👋 Проверка связи между двумя аккаунтами работает.',
    attachments: [], reactions: {}, replyToId: null, editedAt: null, mentions: [], pinned: false, ts: Date.now() - 30_000,
  });

  const dmId = id('dm_');
  db.dms.push({ id: dmId, users: [adminId, friendId], isGroup: false, name: null, icon: null });
  db.dmMessages.push({ id: id('dm_'), dmId, authorId: friendId, content: 'Привет! Это личное сообщение 📩', attachments: [], reactions: {}, replyToId: null, editedAt: null, ts: Date.now() - 30_000 });

  atomicWrite(db, DB_FILE);
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   DEMO ACCOUNTS (удалите/поменяйте пароль в проде)   ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log('║  demo@flex.app   / demo1234                          ║');
  console.log('║  friend@flex.app / friend1234                        ║');
  console.log('║  Invite code:   flex-home                            ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
}
