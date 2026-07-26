import jwt from 'jsonwebtoken';

// In production this would come from env; kept simple for self-hosted friend group use.
export const JWT_SECRET = process.env.JWT_SECRET || 'flex-dev-secret-change-me';
const TOKEN_TTL = '30d';

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, email: user.email },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

export function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

// Usernames: lowercase latin letters, digits, dash, underscore, tilde. Length 2-32.
export const USERNAME_RE = /^[a-z0-9\-_~]{2,32}$/;

export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName || u.username,
    avatar: u.avatar || null,
    banner: u.banner || null,
    bannerColor: u.bannerColor || '#1e1f22',
    profileColor1: u.profileColor1 || '#5865f2',
    profileColor2: u.profileColor2 || '#eb459e',
    aboutMe: u.aboutMe || '',
    status: u.status || 'offline',
    customStatus: u.customStatus || '',
    createdAt: u.createdAt,
    integrations: u.integrations || [],
  };
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = token ? verifyToken(token) : null;
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });
  req.userId = payload.sub;
  next();
}
