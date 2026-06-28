import { ArcanaParamMapper } from './param-mapper-wrapper.js?v=linkindaw-midi-map-20260619';

let audioCtx = null;
let node = null;
export let analyserNode = null;
export let bassAnalyserNode = null;
let masterOutNode = null;
let monitorOutNode = null;
let recordingTapNode = null;
let recordingDCBlockNode = null;
let recordingDestinationNode = null;
let recordingAnalyserNode = null;
let using808MasterFallback = true;
let logged808Fallback = false;
let readyResolve = null;
let readyPromise = null;
let dawReportedSampleRate = null;
let recreatingAudioEngine = null;
let audioArmed = false;
let midiActiveNote = null;
let midiPitchBend = 0;
let midiPitchBendRange = 2;
let midiVelocity = 1;
let external808Params = null;
let external808Macros = null;
let external808Volume = 1;
let masterVolumeValue = 0.841;
const pendingDawMidi = [];
const MIDI_DRUM_MAP = Object.freeze({
  36: { unitType: 0, label: 'Kick' },
  38: { unitType: 1, label: 'Snare' },
  40: { unitType: 1, label: 'Snare' },
  42: { unitType: 3, label: 'Closed Hat', open: false },
  44: { unitType: 3, label: 'Closed Hat', open: false },
  46: { unitType: 3, label: 'Open Hat', open: true },
});
const ARCANA_BUILD_ID = '2026050402';
const ARCANA_WORKLET_ID = 'linkindaw-audio-return-buffer512-20260628';
const DEBUG_AXION_AUDIO = true;
const axionUrlParams = new URLSearchParams(window.location.search);
const DAW_LINKED_MODE = axionUrlParams.get('linkindaw') === 'webrtc' || axionUrlParams.get('webrtc') === '1' || !!axionUrlParams.get('room') || !!axionUrlParams.get('linkindawRoom');
const LOCAL_MONITOR_PARAM = axionUrlParams.get('localMonitor') ?? axionUrlParams.get('monitor');
let localMonitorEnabled = LOCAL_MONITOR_PARAM === '1' || LOCAL_MONITOR_PARAM === 'true'
  ? true
  : !(window.__linkinDawWebRTCAdapter?.enabled === true);
let debugHatTriggerLogged = false;
const ARCANA_WASM_URL = './wasm/arcana_core.wasm?v=axion-kick-duck-20260611j';
const ARCANA_DRUM_WASM_URL = './wasm/arcana_core.wasm?v=axion-kick-duck-20260611j';

function ensureReadyPromise() {
  if (!readyPromise) {
    readyPromise = new Promise((resolve) => { readyResolve = resolve; });
  }
  return readyPromise;
}

export async function initAudioEngine() {
  if (audioCtx && node) {
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    return ensureReadyPromise();
  }
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  ensureReadyPromise();
  await audioCtx.audioWorklet.addModule(`./src/axion/arcana-processor.js?v=${ARCANA_WORKLET_ID}`);
  node = new AudioWorkletNode(audioCtx, 'arcana-processor', {
    numberOfInputs: 0,
    numberOfOutputs: 2,
    outputChannelCount: [2, 2],
  });
  analyserNode = audioCtx.createAnalyser();
  analyserNode.fftSize = 2048;
  bassAnalyserNode = audioCtx.createAnalyser();
  bassAnalyserNode.fftSize = 2048;
  masterOutNode = audioCtx.createGain();
  masterOutNode.gain.value = masterVolumeValue; // -1.5 dB headroom
  monitorOutNode = audioCtx.createGain();
  monitorOutNode.gain.value = localMonitorEnabled ? 1 : 0;
  recordingTapNode = audioCtx.createGain();
  recordingDCBlockNode = audioCtx.createBiquadFilter();
  recordingDCBlockNode.type = 'highpass';
  recordingDCBlockNode.frequency.value = 20;
  recordingDCBlockNode.Q.value = 0.707;
  recordingDestinationNode = audioCtx.createMediaStreamDestination();
  recordingAnalyserNode = audioCtx.createAnalyser();
  recordingAnalyserNode.fftSize = 2048;
  const silentBassTap = audioCtx.createGain();
  silentBassTap.gain.value = 0;
  node.connect(masterOutNode, 0, 0);
  node.connect(recordingTapNode, 0, 0);
  node.connect(bassAnalyserNode, 1, 0);
  bassAnalyserNode.connect(silentBassTap);
  silentBassTap.connect(audioCtx.destination);
  masterOutNode.connect(analyserNode);
  masterOutNode.connect(monitorOutNode);
  monitorOutNode.connect(audioCtx.destination);
  recordingTapNode.connect(recordingDCBlockNode);
  recordingDCBlockNode.connect(recordingAnalyserNode);
  recordingDCBlockNode.connect(recordingDestinationNode);
  if (DEBUG_AXION_AUDIO) {
    console.log('[AXION REC graph]', {
      contextState: audioCtx.state,
      sampleRate: audioCtx.sampleRate,
      masterPath: 'worklet output 0 -> masterOut -> destination + analyser',
      recorderPath: 'worklet output 0 -> recordingTapGain -> highpass(20Hz) -> MediaStreamDestination + recordingAnalyser',
      recorderTracks: recordingDestinationNode.stream.getAudioTracks().length,
      masterGain: masterOutNode.gain.value,
      monitorGain: monitorOutNode.gain.value,
      localMonitorEnabled,
      recordingTapGain: recordingTapNode.gain.value,
      recordingHighpassHz: recordingDCBlockNode.frequency.value,
    });
  }
  node.port.onmessage = (e) => {
    if (e.data?.type === 'AUDIO_BUFFER') {
      if (window.__linkinDawWebRTCAdapter?.sendAudioBuffer?.(e.data.buffer) === true) {
        node?.port?.postMessage({ type: 'RETURN_BUFFER', buffer: e.data.buffer }, [e.data.buffer]);
      } else {
        window.parent.postMessage(e.data, '*', [e.data.buffer]);
      }
    } else if (e.data?.type === 'ready') {
      readyResolve?.();
    } else if (e.data?.type === 'axion_debug') {
      if (e.data.detail?.hasBassStem) using808MasterFallback = false;
      if (DEBUG_AXION_AUDIO) console.log(e.data.message, e.data.detail || '');
    } else if (e.data?.type === 'phase_lock') {
      const value = Number(e.data.value || 0);
      const state = value > 0.8 ? 'LOCKED' : (value > 0 ? 'SEEKING' : 'IDLE');
      document.dispatchEvent(new CustomEvent('arcana:phase-lock', {
        detail: { value, lockedValue: value, state, fSmooth: Number(e.data.fSmooth || 0) }
      }));
    }
  };
  const res = await fetch(ARCANA_WASM_URL, { cache: 'no-store' });
  const drumRes = await fetch(ARCANA_DRUM_WASM_URL, { cache: 'no-store' });
  const wasmBinary = await res.arrayBuffer();
  const drumWasmBinary = await drumRes.arrayBuffer();
  node.port.postMessage({ type: 'load', wasmBinary, drumWasmBinary });
  await ensureReadyPromise();
  if (audioCtx.state === 'suspended') await audioCtx.resume();
  return readyPromise;
}

async function closeAudioEngine() {
  const ctx = audioCtx;
  try { node?.disconnect(); } catch {}
  try { masterOutNode?.disconnect(); } catch {}
  try { monitorOutNode?.disconnect(); } catch {}
  try { recordingTapNode?.disconnect(); } catch {}
  try { recordingDCBlockNode?.disconnect(); } catch {}
  try { analyserNode?.disconnect(); } catch {}
  try { bassAnalyserNode?.disconnect(); } catch {}

  node = null;
  analyserNode = null;
  bassAnalyserNode = null;
  masterOutNode = null;
  monitorOutNode = null;
  recordingTapNode = null;
  recordingDCBlockNode = null;
  recordingDestinationNode = null;
  recordingAnalyserNode = null;
  readyResolve = null;
  readyPromise = null;
  using808MasterFallback = true;
  logged808Fallback = false;

  if (ctx && ctx.state !== 'closed') {
    try { await ctx.close(); } catch {}
  }
  if (audioCtx === ctx) audioCtx = null;
}

function noteDawSampleRate(sampleRate) {
  dawReportedSampleRate = Number.isFinite(Number(sampleRate)) ? Number(sampleRate) : null;
  if (DEBUG_AXION_AUDIO && audioCtx) {
    console.info('[AXION] DAW sample rate noted; engine stays on browser AudioContext rate', {
      dawReportedSampleRate,
      audioContextSampleRate: audioCtx.sampleRate,
    });
  }
}

export async function resumeAudio() {
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') await audioCtx.resume();
}

export function isAudioEngineArmed() {
  return audioArmed && !!audioCtx && audioCtx.state === 'running' && !!node;
}

export async function armAudioEngine() {
  await initAudioEngine();
  await resumeAudio();

  if (!audioCtx || audioCtx.state !== 'running' || !node) {
    throw new Error(`Audio engine is not running (${audioCtx?.state || 'no-context'})`);
  }

  audioArmed = true;
  window.parent.postMessage({ type: 'AXION_ENGINE_STATUS', value: 'streaming' }, '*');
  window.dispatchEvent(new CustomEvent('axion:engine-status', {
    detail: { value: 'streaming', contextState: audioCtx.state, sampleRate: audioCtx.sampleRate }
  }));
  flushPendingDawMidi();
}

export function triggerArcana(unitType, params, seed = 12345, meta = null) {
  if (!node) return;
  let payloadParams = params;
  if (unitType === 3 && meta && params && typeof params.length === 'number') {
    payloadParams = new Float32Array(params);
    if (Number.isFinite(meta.pan)) payloadParams[17] = Math.max(-1, Math.min(1, Number(meta.pan)));
    if (Number.isFinite(meta.width)) payloadParams[18] = Math.max(0, Math.min(1, Number(meta.width)));
    payloadParams[19] = meta.choke === false ? 0 : 1;
    if (Number.isFinite(meta.spread)) payloadParams[20] = Math.max(0, Math.min(1, Number(meta.spread)));
  }
  if (DEBUG_AXION_AUDIO && unitType === 3 && !debugHatTriggerLogged) {
    debugHatTriggerLogged = true;
    console.log('[AXION] audio-engine triggerArcana -> Worklet', {
      unitType,
      seed,
      meta,
      paramPan17: payloadParams?.[17],
      paramWidth18: payloadParams?.[18],
      paramChoke19: payloadParams?.[19],
      paramSpread20: payloadParams?.[20],
      paramLevel4: payloadParams?.[4],
    });
  }
  node.port.postMessage({ type: 'trig', unitType, params: payloadParams, seed, meta });
}

export function setMacroParam(unitType, paramType, value) {
  if (!node) return;
  node.port.postMessage({ type: 'set_param', unitType, paramType, value });
}

export function setUnitParams(unitType, params, meta = null) {
  if (!node || !params || typeof params.length !== 'number') return;
  const payloadParams = new Float32Array(params);
  if (DEBUG_AXION_AUDIO) {
    console.log('[AXION engine setUnitParams]', {
      unitType,
      meta,
    });
  }
  node.port.postMessage({ type: 'set_unit_params', unitType, params: payloadParams, meta });
}

function makeMidiParams(unitType, midiNote, velocity = 1, options = {}) {
  const v = Math.max(0, Math.min(1, Number(velocity) || 0));
  if (unitType === 0) {
    const params = ArcanaParamMapper.getKickParams([0.55, 0.46, 0.78, 0.18, 0.36]);
    params[6] = v;
    return params;
  }
  if (unitType === 1) {
    const params = ArcanaParamMapper.getSnareParams([0.62, 0.55, 0.58, 0.54, 0.50]);
    params[21] = v;
    return params;
  }
  if (unitType === 3) {
    const open = options.open ? 1 : 0;
    const params = ArcanaParamMapper.getHatParams([0.55, 0.48, 0.62, open, open ? 0.72 : 0.36]);
    params[3] = open;
    params[4] = (params[4] || 1) * v;
    params[19] = open ? 0 : 1;
    return params;
  }

  const params = ArcanaParamMapper.get808Params([0.85, 0.00, 0.32, 0.30, 0.68], midiNote);
  return params;
}

export function setExternal808Params(params, macros = null, volume = 1) {
  external808Params = params ? new Float32Array(params) : null;
  external808Macros = macros ? { ...macros } : null;
  external808Volume = Math.max(0, Math.min(1, Number(volume) || 0));
  if (DEBUG_AXION_AUDIO) console.log('[AXION external 808 params]', { activeNote: midiActiveNote, pitchBend: midiPitchBend, velocity: midiVelocity, hasParams: !!external808Params, hasMacros: !!external808Macros, volume: external808Volume });
  if (node && midiActiveNote != null) {
    noteOn808(midiActiveNote + midiPitchBend * midiPitchBendRange, null, 12345, false, midiVelocity);
  }
}

export function noteOn808(midi, params, seed = 12345, retrig = true, velocity = 1) {
  if (!node) return;
  if (typeof params === 'boolean') {
    retrig = params;
    params = null;
  }
  const velocityNorm = Math.max(0, Math.min(1, Number(velocity) || 0));
  let payloadParams = params ? new Float32Array(params) : null;
  if (!payloadParams && external808Macros) {
    payloadParams = ArcanaParamMapper.get808Params([
      external808Macros.SUB ?? 0.15,
      external808Macros.DROP ?? 0.0,
      external808Macros.DIRT ?? 0.85,
      external808Macros.GLIDE ?? 0.30,
      external808Macros.DECAY ?? 0.68,
    ], midi);
    payloadParams[22] = (payloadParams[22] || 1) * external808Volume;
  }
  if (!payloadParams) payloadParams = external808Params ? new Float32Array(external808Params) : makeMidiParams(2, midi, velocityNorm);
  if (DEBUG_AXION_AUDIO) console.log('[AXION engine noteOn808]', { midi, targetHz: 440 * Math.pow(2, (Number(midi) - 69) / 12), retrig, velocity: velocityNorm, outputGain: payloadParams?.[22], hasExternalMacros: !!external808Macros });
  node.port.postMessage({ type: 'note_on_808', midi, params: payloadParams, seed, retrig, velocity: velocityNorm });
}

export function glide808(midi, glideMs = 120, params = null, curve = 1) {
  if (!node) return;
  if (params != null && typeof params.length !== 'number') {
    curve = params === 'Linear' || params === 0 ? 0 : 1;
    params = null;
  }
  if (DEBUG_AXION_AUDIO) console.log('[AXION engine glide808]', { midi, targetHz: 440 * Math.pow(2, (Number(midi) - 69) / 12), glideMs, curve, outputGain: params?.[22] });
  node.port.postMessage({ type: 'glide_808', midi, glideMs, params, curve });
}

export function noteOff808(isChoke = false) {
  if (!node) return;
  node.port.postMessage({ type: 'note_off_808', isChoke });
}

async function handleDawMidi(data) {
  if (!isAudioEngineArmed()) {
    pendingDawMidi.push(data);
    while (pendingDawMidi.length > 256) pendingDawMidi.shift();
    window.dispatchEvent(new CustomEvent('axion:audio-arm-required'));
    window.parent.postMessage({ type: 'AXION_ENGINE_STATUS', value: 'waiting' }, '*');
    return;
  }

  const rawStatus = Number(data.status ?? 0);
  const statusMsg = Number(data.statusMsg ?? (rawStatus > 0x0F ? rawStatus >> 4 : rawStatus));
  const channel = Number(data.channel ?? (rawStatus & 0x0F)) & 0x0F;
  const status = rawStatus > 0x0F ? rawStatus : ((statusMsg & 0x0F) << 4) | channel;
  const command = status & 0xF0;
  const data1 = Number(data.data1 ?? data.note ?? 0);
  const data2 = Number(data.data2 ?? data.velocity ?? 0);

  if (DEBUG_AXION_AUDIO) {
    console.log('[AXION MIDI in]', { rawStatus, status, command, channel, data1, data2, payload: data });
  }

  if (command === 0x90 && data2 > 0) {
    if (DAW_LINKED_MODE) {
      if (DEBUG_AXION_AUDIO) console.log('[AXION MIDI ignored in native 808 mode]', { data1, data2, payload: data });
      return;
    }
    midiVelocity = Math.max(0, Math.min(1, Number(data.velocityNorm ?? data2 / 127) || 0));
    const mapped = DAW_LINKED_MODE ? null : MIDI_DRUM_MAP[data1];
    if (mapped) {
      triggerArcana(mapped.unitType, makeMidiParams(mapped.unitType, data1, midiVelocity, mapped), 12345, mapped);
      return;
    }

    midiActiveNote = data1;
    noteOn808(data1 + midiPitchBend * midiPitchBendRange, null, 12345, true, midiVelocity);
  } else if (command === 0x80 || (command === 0x90 && data2 === 0)) {
    if (midiActiveNote === data1) {
      midiActiveNote = null;
      noteOff808(false);
    }
  } else if (command === 0xE0) {
    const raw14 = ((Number(data.data2 || 0) & 0x7F) << 7) | (Number(data.data1 || 0) & 0x7F);
    midiPitchBend = Math.max(-1, Math.min(1, (raw14 - 8192) / 8192));
    if (midiActiveNote != null) {
      glide808(midiActiveNote + midiPitchBend * midiPitchBendRange, 20, null, 0);
    }
  } else if (command === 0xB0) {
    document.dispatchEvent(new CustomEvent('axion:midi-cc', {
      detail: {
        cc: Number(data.cc ?? data1),
        value: data2,
        valueNorm: Math.max(0, Math.min(1, Number(data.valueNorm ?? data2 / 127) || 0)),
        channel: Number(data.channel ?? (status & 0x0F)),
      }
    }));
  }
}

function flushPendingDawMidi() {
  if (!isAudioEngineArmed() || pendingDawMidi.length === 0) return;
  const queued = pendingDawMidi.splice(0, pendingDawMidi.length);
  if (DEBUG_AXION_AUDIO) console.log('[AXION MIDI flush]', { count: queued.length });
  for (const data of queued) {
    void handleDawMidi(data);
  }
}

export function getAudioContext() { return audioCtx; }
export function getArcanaAnalyser() { return analyserNode; }
function analyserRms(analyser) {
  if (!analyser) return null;
  const data = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(data);
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / data.length);
}
function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
export function getRecordingGraphDiagnostics() {
  return {
    contextState: audioCtx?.state || null,
    sampleRate: audioCtx?.sampleRate || null,
    masterRms: analyserRms(analyserNode),
    recordingRms: analyserRms(recordingAnalyserNode),
    recorderTrackCount: recordingDestinationNode?.stream?.getAudioTracks?.().length || 0,
    masterGain: masterOutNode?.gain?.value ?? null,
    monitorGain: monitorOutNode?.gain?.value ?? null,
    localMonitorEnabled,
    recordingTapGain: recordingTapNode?.gain?.value ?? null,
    recordingHighpassHz: recordingDCBlockNode?.frequency?.value ?? null,
  };
}
export function resetRecordingBus() {
  if (!audioCtx || !recordingTapNode) return getRecordingGraphDiagnostics();
  const now = audioCtx.currentTime;
  recordingTapNode.gain.cancelScheduledValues(now);
  recordingTapNode.gain.setValueAtTime(1, now);
  return getRecordingGraphDiagnostics();
}
export async function releaseRecordingBusForStop({ fadeMs = 80, tailMs = 180 } = {}) {
  if (!audioCtx || !recordingTapNode) return { before: getRecordingGraphDiagnostics(), after: getRecordingGraphDiagnostics(), fadeMs, tailMs, totalMs: fadeMs + tailMs };
  const before = getRecordingGraphDiagnostics();
  const now = audioCtx.currentTime;
  const fadeSec = Math.max(0.01, fadeMs / 1000);
  recordingTapNode.gain.cancelScheduledValues(now);
  recordingTapNode.gain.setValueAtTime(recordingTapNode.gain.value, now);
  recordingTapNode.gain.linearRampToValueAtTime(0, now + fadeSec);
  await waitMs(fadeMs + tailMs);
  const after = getRecordingGraphDiagnostics();
  return { before, after, fadeMs, tailMs, totalMs: fadeMs + tailMs };
}
export function setMasterVolume(value) {
  masterVolumeValue = Math.max(0, Math.min(1, Number(value) || 0));
  if (masterOutNode && audioCtx) {
    const now = audioCtx.currentTime;
    masterOutNode.gain.cancelScheduledValues(now);
    masterOutNode.gain.setTargetAtTime(masterVolumeValue, now, 0.01);
  }
}

export async function getMasterRecordingStream() {
  await initAudioEngine();
  return recordingDestinationNode?.stream || null;
}
export function get808AnalyserOrFallback() {
  if (bassAnalyserNode && !using808MasterFallback) return bassAnalyserNode;
  if (!logged808Fallback) {
    logged808Fallback = true;
    console.info('[AXION] 808 Analyzer using master fallback; no 808 stem available');
  }
  return analyserNode;
}

window.addEventListener('message', (event) => {
  if (event.data?.type === 'RETURN_BUFFER') {
    if (node && node.port) {
      node.port.postMessage(event.data, [event.data.buffer]);
    }
  } else if (event.data?.type === 'MIDI_MESSAGE') {
    void handleDawMidi(event.data.payload || {});
  } else if (event.data?.type === 'SET_SAMPLERATE') {
    noteDawSampleRate(event.data.value);
  } else if (event.data?.type === 'SET_LOCAL_MONITOR') {
    localMonitorEnabled = !!event.data.enabled;
    if (monitorOutNode && audioCtx) {
      const now = audioCtx.currentTime;
      monitorOutNode.gain.cancelScheduledValues(now);
      monitorOutNode.gain.setTargetAtTime(localMonitorEnabled ? 1 : 0, now, 0.01);
    }
  }
});
