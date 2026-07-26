// ICE servers config - STUN by default, TURN can be added later via env or UI.
export function getIceServers() {
  const env = import.meta.env.VITE_ICE_SERVERS;
  if (env) {
    try {
      const parsed = JSON.parse(env);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {
      console.warn('[webrtc] Failed to parse VITE_ICE_SERVERS JSON', e);
    }
  }
  return [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];
}

export const RTC_CONFIG = {
  iceServers: getIceServers(),
};

// Optional helper to test if TURN is configured
export function hasTurnServer() {
  return getIceServers().some(s => {
    const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
    return urls.some(u => String(u).startsWith('turn:') || String(u).startsWith('turns:'));
  });
}
