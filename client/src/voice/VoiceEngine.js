// Voice engine using the server relay.
// Strategy: capture mic with MediaRecorder (Opus in WebM/OGG chunks), send chunks over socket.
// For playback, we feed remote chunks to an <audio> element via MediaSource (buffered).
// Fallback for browsers without MediaSource + webm: use WebAudio PCM (worse quality, but works).

export class VoiceEngine {
  constructor({ sendAudio, sendState, sendSpeaking, onRemoteAudio }) {
    this.sendAudio = sendAudio;
    this.sendState = sendState;
    this.sendSpeaking = sendSpeaking;
    this.muted = false;
    this.deaf = false;
    this.localStream = null;
    this.recorder = null;
    this.audioCtx = null;
    this.remoteSources = new Map(); // userId -> { audioEl, mediaSource, sourceBuffer, queue }
    this.analyser = null;
    this.speakingRaf = null;
    this.container = document.createElement('div');
    this.container.style.display = 'none';
    document.body.appendChild(this.container);
    this.timesliceMs = 80; // send voice in 80ms chunks
  }

  async start() {
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
      video: false,
    });
    // Speaking detection via AudioContext
    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = this.audioCtx.createMediaStreamSource(this.localStream);
    const analyser = this.audioCtx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    this.analyser = analyser;
    const data = new Uint8Array(analyser.frequencyBinCount);
    let lastSpeaking = false;
    let silenceStreak = 0;
    const detect = () => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const avg = sum / data.length;
      const speakingNow = avg > 15 && !this.muted;
      if (speakingNow !== lastSpeaking) {
        if (speakingNow) { this.sendSpeaking(true); lastSpeaking = true; silenceStreak = 0; }
        else { silenceStreak++; if (silenceStreak > 6) { this.sendSpeaking(false); lastSpeaking = false; } }
      }
      this.speakingRaf = requestAnimationFrame(detect);
    };
    detect();

    // Start MediaRecorder
    const mime = pickSupportedMime();
    if (!mime) {
      console.warn('[voice] No supported MediaRecorder audio type; PCM fallback not built — disabling audio capture.');
      return;
    }
    this.recorder = new MediaRecorder(this.localStream, { mimeType: mime, audioBitsPerSecond: 32000 });
    this.recorder.ondataavailable = (e) => {
      if (this.muted) return;
      if (e.data && e.data.size > 0) {
        e.data.arrayBuffer().then(buf => {
          this.sendAudio(buf);
        });
      }
    };
    this.recorder.start(this.timesliceMs);
  }

  // Called when binary audio arrives from a remote user
  playRemote(userId, buffer) {
    if (this.deaf) return;
    let entry = this.remoteSources.get(userId);
    if (!entry) {
      entry = createRemoteEntry(userId, this.container);
      this.remoteSources.set(userId, entry);
    }
    feedChunk(entry, new Uint8Array(buffer));
  }

  toggleMute() {
    this.muted = !this.muted;
    this.sendState('mute', this.muted);
    this.localStream?.getAudioTracks().forEach(t => t.enabled = !this.muted);
    if (this.muted) this.sendSpeaking(false);
    return this.muted;
  }
  toggleDeaf() {
    this.deaf = !this.deaf;
    this.sendState('deaf', this.deaf);
    this.remoteSources.forEach(e => { if (e.audioEl) e.audioEl.muted = this.deaf; });
    return this.deaf;
  }

  stop() {
    if (this.speakingRaf) cancelAnimationFrame(this.speakingRaf);
    if (this.recorder && this.recorder.state !== 'inactive') { try { this.recorder.stop(); } catch {} }
    if (this.localStream) this.localStream.getTracks().forEach(t => t.stop());
    if (this.audioCtx) { try { this.audioCtx.close(); } catch {} }
    this.remoteSources.forEach(e => { if (e.audioEl) { e.audioEl.pause(); e.audioEl.removeAttribute('src'); e.audioEl.srcObject = null; } });
    this.remoteSources.clear();
    if (this.container.parentNode) this.container.parentNode.removeChild(this.container);
  }
}

function pickSupportedMime() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  for (const c of candidates) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(c)) return c;
  }
  return null;
}

function createRemoteEntry(userId, container) {
  const audioEl = document.createElement('audio');
  audioEl.autoplay = true;
  audioEl.controls = false;
  audioEl.muted = false;
  container.appendChild(audioEl);

  const ms = new MediaSource();
  audioEl.src = URL.createObjectURL(ms);
  const entry = { audioEl, ms, queue: [], sourceBuffer: null, started: false, mime: null, initialBuffered: false };
  ms.addEventListener('sourceopen', () => {
    // Pick source buffer mime matching what we record — default to opus/webm
    let mime = 'audio/webm;codecs=opus';
    try {
      entry.sourceBuffer = ms.addSourceBuffer(mime);
      entry.mime = mime;
    } catch {
      try { entry.sourceBuffer = ms.addSourceBuffer('audio/webm'); entry.mime = 'audio/webm'; }
      catch { console.warn('Could not add source buffer'); }
    }
    if (entry.sourceBuffer) {
      entry.sourceBuffer.mode = 'sequence';
      entry.sourceBuffer.addEventListener('updateend', () => {
        entry._updating = false;
        pumpQueue(entry);
      });
    }
    entry.opened = true;
    pumpQueue(entry);
  });
  return entry;
}

function feedChunk(entry, bytes) {
  entry.queue.push(bytes);
  pumpQueue(entry);
}

function pumpQueue(entry) {
  if (!entry.sourceBuffer || entry._updating) return;
  if (entry.queue.length === 0) {
    // End stream? Don't end — keep alive for future chunks.
    return;
  }
  const next = entry.queue.shift();
  try {
    entry._updating = true;
    entry.sourceBuffer.appendBuffer(next);
  } catch (e) {
    entry._updating = false;
    // Quota exceeded error → remove oldest
    if (e.name === 'QuotaExceededError' && entry.sourceBuffer.buffered.length > 0) {
      try {
        const start = entry.sourceBuffer.buffered.start(0);
        const end = entry.sourceBuffer.buffered.end(0);
        const removeEnd = Math.min(start + 2, end - 0.5);
        if (removeEnd > start) {
          entry.sourceBuffer.remove(start, removeEnd);
          entry.sourceBuffer.addEventListener('updateend', () => { entry._updating = false; pumpQueue(entry); }, { once: true });
          return;
        }
      } catch {}
    }
    console.warn('[voice] append error:', e);
  }
}
