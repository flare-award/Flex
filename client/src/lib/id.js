export function genId(prefix = '') {
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function genInviteCode(len = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function now() {
  return Date.now();
}

// Sanitize username
export function isValidUsername(u) {
  return /^[a-z0-9\-_~]{2,32}$/.test(u);
}
