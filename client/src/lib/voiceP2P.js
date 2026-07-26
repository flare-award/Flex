/**
 * P2P Voice Engine using Firebase RTDB for signaling.
 * - getUserMedia audio only
 * - RTCPeerConnection mesh (one PC per remote)
 * - Firebase signaling: offers/answers/candidates under voice/{guildId}/{channelId}
 * - Presence: voice/{guildId}/{channelId}/state/{uid}
 * - Speaking detection via AudioContext analyser -> updates presence
 * - Remote audio via HTMLAudioElement
 */

import { ref, onValue, set, update, remove, push, onChildAdded, off, get, child } from 'firebase/database';
import { db } from './firebase.js';
import { RTC_CONFIG } from './webrtcConfig.js';

export class VoiceP2P {
  constructor({ guildId, channelId, selfUid, selfProfile, database }) {
    this.guildId = guildId;
    this.channelId = channelId;
    this.selfUid = selfUid;
    this.selfProfile = selfProfile || {};
    this.db = database || db;

    this.localStream = null;
    this.localAudioTrack = null;
    this.audioCtx = null;
    this.analyser = null;
    this.speakingRaf = null;
    this.isSpeaking = false;
    this.muted = false;
    this.deafened = false;

    /** Map remoteUid -> { pc, remoteStream, audioEl, state, speaking, candidateListeners, cleanup } */
    this.peers = new Map();

    /** callbacks */
    this.onParticipantsChange = () => {};
    this.onSpeakingChange = () => {};
    this.onIceStateChange = () => {};
    this.onError = () => {};

    // internal listeners refs for cleanup
    this._listeners = [];
    this._container = null;

    // presence list
    this._presence = new Map(); // uid -> presence obj

    this._joined = false;
  }

  _voicePath(...parts) {
    return ['voice', this.guildId, this.channelId, ...parts].join('/');
  }

  _log(...args) {
    console.log('[voiceP2P]', ...args);
  }

  async join({ onParticipantsChange, onSpeakingChange, onIceStateChange, onError }) {
    if (this._joined) return;
    if (onParticipantsChange) this.onParticipantsChange = onParticipantsChange;
    if (onSpeakingChange) this.onSpeakingChange = onSpeakingChange;
    if (onIceStateChange) this.onIceStateChange = onIceStateChange;
    if (onError) this.onError = onError;

    // Create hidden container for audio elements
    this._container = document.createElement('div');
    this._container.style.display = 'none';
    document.body.appendChild(this._container);

    // getUserMedia
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
        video: false,
      });
      this.localAudioTrack = this.localStream.getAudioTracks()[0];
    } catch (e) {
      this._log('getUserMedia failed', e);
      throw e;
    }

    // speaking detection for local
    try {
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
        if (!this.analyser) return;
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length;
        const speakingNow = avg > 12 && !this.muted;
        if (speakingNow !== lastSpeaking) {
          if (speakingNow) {
            lastSpeaking = true;
            silenceStreak = 0;
            this._setSpeaking(true);
          } else {
            silenceStreak++;
            if (silenceStreak > 8) {
              lastSpeaking = false;
              this._setSpeaking(false);
            }
          }
        }
        this.speakingRaf = requestAnimationFrame(detect);
      };
      detect();
    } catch (e) {
      console.warn('[voice] analyser failed', e);
    }

    // Write presence
    await this._writePresence({ speaking: false, muted: false, deaf: false });

    // Listen presence
    this._listenPresence();

    // Listen for offers addressed to self
    this._listenOffers();
    this._listenAnswers();
    this._listenCandidates();

    this._joined = true;
  }

  async _writePresence(extra = {}) {
    if (!this.db) return;
    const presenceRef = ref(this.db, this._voicePath('state', this.selfUid));
    const payload = {
      userId: this.selfUid,
      displayName: this.selfProfile.displayName || this.selfUid.slice(0, 6),
      avatar: this.selfProfile.avatar || null,
      username: this.selfProfile.username || '',
      muted: !!this.muted,
      deaf: !!this.deafened,
      speaking: !!extra.speaking || false,
      joinedAt: extra.joinedAt || Date.now(),
      ...extra,
    };
    // keep joinedAt stable if exists
    try {
      const snap = await get(presenceRef);
      if (snap.exists()) {
        payload.joinedAt = snap.val().joinedAt || payload.joinedAt;
      }
    } catch {}
    await set(presenceRef, payload);
  }

  _setSpeaking(speaking) {
    if (this.isSpeaking === speaking) return;
    this.isSpeaking = speaking;
    // update presence speaking
    const presenceRef = ref(this.db, this._voicePath('state', this.selfUid));
    update(presenceRef, { speaking }).catch(() => {});
    this.onSpeakingChange(this.selfUid, speaking);
  }

  _listenPresence() {
    const presenceRoot = ref(this.db, this._voicePath('state'));
    const cb = onValue(presenceRoot, (snap) => {
      const val = snap.val() || {};
      const prev = new Map(this._presence);
      this._presence.clear();
      Object.entries(val).forEach(([uid, data]) => {
        this._presence.set(uid, data);
      });

      // For each remote, ensure peer connection if needed
      for (const [uid, data] of this._presence.entries()) {
        if (uid === this.selfUid) continue;
        if (!this.peers.has(uid)) {
          // decide who offers: deterministic by uid lex compare to avoid glare
          if (this.selfUid < uid) {
            this._createPeerAndOffer(uid).catch(e => console.warn('offer creation failed', e));
          } else {
            // wait for offer, but still create peer placeholder waiting
            this._ensurePeer(uid);
          }
        }
      }

      // Remove peers for users who left
      for (const uid of this.peers.keys()) {
        if (!this._presence.has(uid)) {
          this._closePeer(uid);
        }
      }

      // Notify
      this.onParticipantsChange(Array.from(this._presence.values()));
    });
    this._listeners.push(() => off(presenceRoot, 'value', cb));
  }

  _listenOffers() {
    // offers/{selfUid}/{fromUid}
    const offersRoot = ref(this.db, this._voicePath('offers', this.selfUid));
    const cb = onValue(offersRoot, async (snap) => {
      const offers = snap.val() || {};
      for (const [fromUid, offerData] of Object.entries(offers)) {
        if (fromUid === this.selfUid) continue;
        if (!offerData || !offerData.sdp) continue;
        // If we already have stable connection and processed this sdp, skip
        const peer = this.peers.get(fromUid);
        if (peer && peer._lastRemoteOffer === offerData.sdp) continue;

        try {
          await this._handleOffer(fromUid, offerData);
        } catch (e) {
          console.warn('[voice] handle offer err', e);
          this.onError(`Offer handling failed for ${fromUid}: ${e.message}`);
        }
      }
    });
    this._listeners.push(() => off(offersRoot, 'value', cb));
  }

  _listenAnswers() {
    const answersRoot = ref(this.db, this._voicePath('answers', this.selfUid));
    const cb = onValue(answersRoot, async (snap) => {
      const answers = snap.val() || {};
      for (const [fromUid, answerData] of Object.entries(answers)) {
        if (fromUid === this.selfUid) continue;
        if (!answerData || !answerData.sdp) continue;
        const peer = this.peers.get(fromUid);
        if (!peer) continue;
        if (peer._lastRemoteAnswer === answerData.sdp) continue;
        try {
          await this._handleAnswer(fromUid, answerData);
        } catch (e) {
          console.warn('[voice] handle answer err', e);
          this.onError(`Answer handling failed for ${fromUid}: ${e.message}`);
        }
      }
    });
    this._listeners.push(() => off(answersRoot, 'value', cb));
  }

  _listenCandidates() {
    const candidatesRoot = ref(this.db, this._voicePath('candidates', this.selfUid));
    // Listen child added for each fromUid path? We'll listen onValue for simplicity
    const cb = onValue(candidatesRoot, async (snap) => {
      const byFrom = snap.val() || {};
      for (const [fromUid, candidates] of Object.entries(byFrom)) {
        if (fromUid === this.selfUid) continue;
        if (!candidates) continue;
        const peerEntry = this.peers.get(fromUid);
        if (!peerEntry) continue;
        for (const [cid, candData] of Object.entries(candidates)) {
          if (peerEntry._handledCandidates?.has(cid)) continue;
          try {
            if (candData && candData.candidate) {
              await peerEntry.pc.addIceCandidate(new RTCIceCandidate(candData.candidate));
              if (!peerEntry._handledCandidates) peerEntry._handledCandidates = new Set();
              peerEntry._handledCandidates.add(cid);
            }
          } catch (e) {
            // ignore
          }
        }
      }
    });
    this._listeners.push(() => off(candidatesRoot, 'value', cb));
  }

  _ensurePeer(remoteUid) {
    if (this.peers.has(remoteUid)) return this.peers.get(remoteUid);
    const pc = new RTCPeerConnection(RTC_CONFIG);

    // Add local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        try {
          pc.addTrack(track, this.localStream);
        } catch (e) {
          console.warn('addTrack failed', e);
        }
      });
    }

    const remoteStream = new MediaStream();
    const audioEl = document.createElement('audio');
    audioEl.autoplay = true;
    audioEl.playsInline = true;
    if (this._container) this._container.appendChild(audioEl);

    const entry = {
      pc,
      remoteStream,
      audioEl,
      iceState: 'new',
      connectionState: 'new',
      _handledCandidates: new Set(),
      _lastRemoteOffer: null,
      _lastRemoteAnswer: null,
    };

    pc.ontrack = (e) => {
      e.streams[0]?.getTracks().forEach(t => remoteStream.addTrack(t));
      if (e.track) {
        try {
          if (!remoteStream.getTracks().includes(e.track)) remoteStream.addTrack(e.track);
        } catch {}
      }
      audioEl.srcObject = remoteStream;
      audioEl.muted = !!this.deafened;
      audioEl.play().catch(() => {});
      this._log(`track from ${remoteUid}`);
    };

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        // push to candidates/{remoteUid}/{selfUid}/autoId
        const candPath = ref(this.db, this._voicePath('candidates', remoteUid, this.selfUid));
        const newRef = push(candPath);
        set(newRef, {
          candidate: ev.candidate.toJSON(),
          ts: Date.now(),
        }).catch(() => {});
      }
    };

    pc.onconnectionstatechange = () => {
      entry.connectionState = pc.connectionState;
      this._log(`connection state ${remoteUid}: ${pc.connectionState}`);
      this.onIceStateChange(remoteUid, pc.connectionState, pc.iceConnectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        this.onError(`P2P connection to ${remoteUid} ${pc.connectionState}. May need TURN in restrictive networks.`);
      }
    };

    pc.oniceconnectionstatechange = () => {
      entry.iceState = pc.iceConnectionState;
      this.onIceStateChange(remoteUid, pc.connectionState, pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed') {
        this.onError(`ICE failed for ${remoteUid}. Голос работает напрямую между браузерами. В некоторых мобильных, корпоративных и CGNAT-сетях соединение без TURN-сервера может не установиться.`);
      }
    };

    this.peers.set(remoteUid, entry);
    return entry;
  }

  async _createPeerAndOffer(remoteUid) {
    const peer = this._ensurePeer(remoteUid);
    if (peer._offerCreated) return;
    peer._offerCreated = true;
    try {
      const offer = await peer.pc.createOffer({ offerToReceiveAudio: true });
      await peer.pc.setLocalDescription(offer);
      // send offer to remote
      const offerRef = ref(this.db, this._voicePath('offers', remoteUid, this.selfUid));
      await set(offerRef, {
        sdp: offer.sdp,
        type: offer.type,
        ts: Date.now(),
      });
      this._log(`offer sent to ${remoteUid}`);
    } catch (e) {
      peer._offerCreated = false;
      throw e;
    }
  }

  async _handleOffer(fromUid, offerData) {
    const peer = this._ensurePeer(fromUid);
    peer._lastRemoteOffer = offerData.sdp;
    // If we have existing local description as offer and we are non-polite? Simple approach: if stable or have-remote-offer, handle.
    // Avoid glare: if we're also have local offer and selfUid > fromUid, we are impolite and should rollback? Simpler: always set remote if not already.
    // For mesh with deterministic initiator, offers should only come from lower UID. So if we get offer, we should be higher UID. But handle anyway.
    try {
      // If pc signalingState is not stable, we may need to handle collision - for simplicity, if we already have local offer, we ignore? Instead we rollback if polite.
      // We'll implement polite logic: if selfUid > fromUid, we are polite (since lower initiates). Actually lower is initiator, so higher should accept.
      // If we are initiator (selfUid < fromUid) receiving offer, that is glare - we should ignore if we already have offer.
      if (peer.pc.signalingState !== 'stable' && this.selfUid < fromUid) {
        // We initiated earlier, ignore incoming offer to prevent glare, wait for answer
        this._log(`glare ignored offer from ${fromUid}, we are initiator`);
        return;
      }

      await peer.pc.setRemoteDescription({ type: 'offer', sdp: offerData.sdp });
      const answer = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);
      const answerRef = ref(this.db, this._voicePath('answers', fromUid, this.selfUid));
      await set(answerRef, {
        sdp: answer.sdp,
        type: answer.type,
        ts: Date.now(),
      });
      this._log(`answer sent to ${fromUid}`);
    } catch (e) {
      console.warn('[voice] handleOffer err', e);
      throw e;
    }
  }

  async _handleAnswer(fromUid, answerData) {
    const peer = this.peers.get(fromUid);
    if (!peer) return;
    peer._lastRemoteAnswer = answerData.sdp;
    if (peer.pc.signalingState !== 'have-local-offer') {
      // Already set?
      // console.warn
      // return;
    }
    try {
      await peer.pc.setRemoteDescription({ type: 'answer', sdp: answerData.sdp });
      this._log(`answer applied from ${fromUid}`);
    } catch (e) {
      console.warn('[voice] setRemote answer failed', e);
      throw e;
    }
  }

  async toggleMute() {
    this.muted = !this.muted;
    if (this.localAudioTrack) this.localAudioTrack.enabled = !this.muted;
    // update presence
    const presenceRef = ref(this.db, this._voicePath('state', this.selfUid));
    await update(presenceRef, { muted: this.muted }).catch(() => {});
    if (this.muted) this._setSpeaking(false);
    return this.muted;
  }

  async toggleDeaf() {
    this.deafened = !this.deafened;
    // mute remote audio elements
    for (const entry of this.peers.values()) {
      if (entry.audioEl) entry.audioEl.muted = !!this.deafened;
    }
    const presenceRef = ref(this.db, this._voicePath('state', this.selfUid));
    await update(presenceRef, { deaf: this.deafened }).catch(() => {});
    return this.deafened;
  }

  _closePeer(uid) {
    const entry = this.peers.get(uid);
    if (!entry) return;
    try {
      entry.pc.close();
    } catch {}
    if (entry.audioEl) {
      try {
        entry.audioEl.pause();
        entry.audioEl.srcObject = null;
        entry.audioEl.remove();
      } catch {}
    }
    this.peers.delete(uid);
    this._log(`peer closed ${uid}`);
  }

  async leave() {
    if (!this._joined) return;
    this._joined = false;

    // Stop speaking detection
    if (this.speakingRaf) cancelAnimationFrame(this.speakingRaf);
    if (this.audioCtx) {
      try { await this.audioCtx.close(); } catch {}
    }

    // Stop local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
    }

    // Remove listeners
    this._listeners.forEach(fn => { try { fn(); } catch {} });
    this._listeners = [];

    // Close peers
    for (const uid of Array.from(this.peers.keys())) this._closePeer(uid);

    // Remove presence and signaling data for self
    try {
      const stateRef = ref(this.db, this._voicePath('state', this.selfUid));
      await remove(stateRef);
    } catch {}

    // Remove offers where self is from or to
    try {
      // Remove offers sent by self to others: offers/{other}/{self}
      // We need to list all offers under offers/*
      // Simplest: iterate peers and delete individually? But we don't know all remote ids after presence cleared.
      // Also iterate presence snapshot already? For safety, we try to remove:
      // offers/{selfUid} node and any child under offers where key self? Actually offers path is offers/{to}/{from}
      // So to remove our outgoing offers, we need to remove offers/{remote}/{self} for each remote we had.
      // And incoming offers offers/{self}/{remote}
      // We will attempt bulk: if we have list of known uids from last presence, remove.
      const allPresence = Array.from(this._presence.keys());
      const removals = [];
      for (const remote of allPresence) {
        removals.push(remove(ref(this.db, this._voicePath('offers', remote, this.selfUid))).catch(() => {}));
        removals.push(remove(ref(this.db, this._voicePath('answers', remote, this.selfUid))).catch(() => {}));
        removals.push(remove(ref(this.db, this._voicePath('candidates', remote, this.selfUid))).catch(() => {}));
        // incoming
        removals.push(remove(ref(this.db, this._voicePath('offers', this.selfUid, remote))).catch(() => {}));
        removals.push(remove(ref(this.db, this._voicePath('answers', this.selfUid, remote))).catch(() => {}));
        removals.push(remove(ref(this.db, this._voicePath('candidates', this.selfUid, remote))).catch(() => {}));
      }
      // Also clean self root offers
      removals.push(remove(ref(this.db, this._voicePath('offers', this.selfUid))).catch(() => {}));
      removals.push(remove(ref(this.db, this._voicePath('answers', this.selfUid))).catch(() => {}));
      removals.push(remove(ref(this.db, this._voicePath('candidates', this.selfUid))).catch(() => {}));
      await Promise.all(removals);
    } catch (e) {
      console.warn('[voice] cleanup failed', e);
    }

    if (this._container && this._container.parentNode) {
      try { this._container.parentNode.removeChild(this._container); } catch {}
    }
    this._container = null;
    this._presence.clear();
    this.peers.clear();
    this.localStream = null;
    this.localAudioTrack = null;
  }
}
