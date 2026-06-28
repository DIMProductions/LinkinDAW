const DEFAULT_SIGNALING_BASE = 'https://dim.productions/linkindaw-signal';
const params = new URLSearchParams(window.location.search);
const transport = params.get('linkindaw') || params.get('linkindawTransport') || params.get('transport');
const roomId = params.get('room') || params.get('linkindawRoom') || params.get('linkindaw_room');
const enabled = transport === 'webrtc' || params.get('webrtc') === '1' || !!roomId;
const signalingBase = (params.get('signal') || params.get('linkindawSignal') || DEFAULT_SIGNALING_BASE).replace(/\/+$/, '');

let peer = null;
let channel = null;
let after = 0;
let closedByAdapter = false;
let reconnectTimer = null;
let connectAttempt = 0;
const STATE_TRACK_IDS = new Set(['kick', 'snare', 'hat', 'bass808']);

function log(...args) {
  console.info('[LinkinDAW WebRTC]', ...args);
}

function warn(...args) {
  console.warn('[LinkinDAW WebRTC]', ...args);
}

function scheduleReconnect(reason) {
  if (closedByAdapter || !enabled || reconnectTimer) return;
  warn('reconnect scheduled', reason);
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    connect().catch((error) => {
      warn('connect failed', error);
      scheduleReconnect('connect failed');
    });
  }, 2000);
}

function dispatchInbound(message) {
  if (!message || typeof message !== 'object') return;

  if (message.type === 'midi') {
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'MIDI_MESSAGE', payload: message, __linkindawWebRTC: true },
      origin: window.location.origin,
      source: window,
    }));
    return;
  }

  if (message.type === 'param') {
    log('Inbound param', { id: message.id, value: message.value, source: message.source });
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'SET_PARAM', id: message.id, value: message.value, __linkindawWebRTC: true },
      origin: window.location.origin,
      source: window,
    }));
    return;
  }

  if (message.type === 'system') {
    if (message.command === 'transport') {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'DAW_TRANSPORT', value: message.value, __linkindawWebRTC: true },
        origin: window.location.origin,
        source: window,
      }));
    } else if (message.command === 'set_samplerate') {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'SET_SAMPLERATE', value: message.value, __linkindawWebRTC: true },
        origin: window.location.origin,
        source: window,
      }));
    } else if (message.command === 'load_axion_state') {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'LOAD_AXION_PROJECT', project: message.value, __linkindawWebRTC: true },
        origin: window.location.origin,
        source: window,
      }));
    }
  }
}

function sendJson(value) {
  if (!channel || channel.readyState !== 'open') return false;
  channel.send(JSON.stringify(value));
  return true;
}

function linkinDawStateProject(project) {
  if (!project || typeof project !== 'object') return project;
  if (!Array.isArray(project.tracks)) return project;
  return {
    ...project,
    linkindawStateScope: 'axion-pattern-v1',
    tracks: project.tracks.filter((track) => STATE_TRACK_IDS.has(track?.id)),
  };
}

async function postSignal(message) {
  const res = await fetch(`${signalingBase}/rooms/${encodeURIComponent(roomId)}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(message),
  });
  if (!res.ok) throw new Error(`signal POST ${res.status}: ${await res.text()}`);
  return res.json();
}

async function pollSignal(kind, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${signalingBase}/rooms/${encodeURIComponent(roomId)}/messages?to=browser&after=${after}`);
    if (!res.ok) throw new Error(`signal GET ${res.status}: ${await res.text()}`);
    const data = await res.json();
    for (const message of data.messages || []) {
      after = Math.max(after, message.id || 0);
      if (!kind || message.kind === kind) return message;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timeout waiting for ${kind}`);
}

async function waitForIceGatheringComplete(pc) {
  if (pc.iceGatheringState === 'complete') return;
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 5000);
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

async function connect() {
  if (!enabled) return;
  if (!roomId) {
    warn('missing room id; add ?linkindaw=webrtc&room=<roomId>');
    return;
  }

  closedByAdapter = false;
  const attempt = ++connectAttempt;
  if (reconnectTimer) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  try { if (channel) channel.onclose = null; channel?.close(); } catch {}
  try { peer?.close(); } catch {}
  after = 0;
  peer = new RTCPeerConnection({ iceServers: [] });
  channel = peer.createDataChannel('linkindaw-webapp-adapter');

  channel.onopen = () => {
    log('DataChannel open', { roomId, signalingBase });
    sendJson({ type: 'system', command: 'webapp_ready', value: { app: 'Axion', href: window.location.href } });
  };

  channel.onmessage = (event) => {
    let parsed = null;
    try { parsed = JSON.parse(event.data); } catch {}
    if (!parsed) {
      channel.send('ack:raw:message');
      return;
    }

    dispatchInbound(parsed);
    const ackType = parsed.type || 'unknown';
    const ackCommand = parsed.command || parsed.statusMsg || parsed.id || 'message';
    channel.send(`ack:${ackType}:${ackCommand}`);
  };

  channel.onerror = () => warn('DataChannel error');
  channel.onclose = () => {
    log('DataChannel closed');
    if (!closedByAdapter && attempt === connectAttempt) scheduleReconnect('channel closed');
  };

  peer.onconnectionstatechange = () => log('PeerConnection state', peer.connectionState);

  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  await waitForIceGatheringComplete(peer);
  await postSignal({ from: 'browser', to: 'native', kind: 'offer', sdp: peer.localDescription.sdp });
  const answer = await pollSignal('answer', 30000);
  await peer.setRemoteDescription({ type: 'answer', sdp: answer.sdp });
}

window.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.__linkindawWebRTC) return;

  if (data.type === 'PARAM_CHANGED') {
    sendJson({ type: 'param', id: data.id, value: data.value, source: 'web' });
  } else if (data.type === 'AXION_ENGINE_STATUS') {
    sendJson({ type: 'system', command: 'engine_status', value: data.value });
  } else if (data.type === 'AXION_PROJECT_STATE') {
    sendJson({ type: 'system', command: 'save_axion_state', value: linkinDawStateProject(data.project) });
  }
});

window.__linkinDawWebRTCAdapter = {
  enabled,
  roomId,
  signalingBase,
  connect,
  sendParam(id, value) {
    return sendJson({ type: 'param', id, value, source: 'web' });
  },
  sendAudioBuffer(buffer) {
    if (!channel || channel.readyState !== 'open' || !buffer) return false;
    if (channel.bufferedAmount > 1024 * 1024) return false;
    try {
      channel.send(buffer.slice(0));
      return true;
    } catch (error) {
      warn('audio buffer send failed', error);
      return false;
    }
  },
  close() {
    closedByAdapter = true;
    try { channel?.close(); } catch {}
    try { peer?.close(); } catch {}
  },
  get state() {
    return {
      enabled,
      roomId,
      signalingBase,
      channelState: channel?.readyState || 'none',
      peerState: peer?.connectionState || 'none',
    };
  },
};

if (enabled) {
  connect().catch((error) => {
    warn('connect failed', error);
    scheduleReconnect('connect failed');
  });
}

