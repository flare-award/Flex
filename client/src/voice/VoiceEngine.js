// Deprecated relay engine - replaced by lib/voiceP2P.js for P2P version
export class VoiceEngine {
  constructor() {}
  async start() { throw new Error('VoiceEngine deprecated - use VoiceP2P'); }
  stop() {}
}
