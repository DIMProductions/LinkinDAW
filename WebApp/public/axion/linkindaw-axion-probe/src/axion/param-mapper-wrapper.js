
const mod = (() => {
"use strict";

const ArcanaParamMapper = (() => {
  function clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function nz(v, min = 0.000001) {
    return Math.max(min, Number(v) || 0);
  }

  function getKickParams(v) {
    // v[0]=SHOCK, v[1]=DIVE, v[2]=MASS, v[3]=THROAT, v[4]=DRIVE
    // Indices match ParamKick: K_SHOCK=0, K_DIVE=1, K_MASS=2, K_THROAT=3, K_DRIVE=4, K_CLIP=5
    const p = new Float32Array(64);
    p[0] = clamp01(v[0] ?? 0.35); // K_SHOCK (floor removed; default raised to match prior character)
    p[1] = clamp01(v[1] ?? 0.70); // K_DIVE
    p[2] = clamp01(v[2] ?? 0.78); // K_MASS
    p[3] = clamp01(v[3] ?? 0.14); // K_THROAT (raised to match prior glotGain at default)
    p[4] = clamp01(v[4] ?? 0.36); // K_DRIVE (raised to match prior dirtyMix at default)
    p[5] = 0.12;                   // K_CLIP (fixed density guard)
    // p[6] = K_OUTPUT_LEVEL → set by applyCommandVolume
    return p;
  }

  function getSnareParams(v) {
    // v[0]=SNAP, v[1]=BODY, v[2]=NOISE, v[3]=CRACK, v[4]=TONE
    const s    = clamp01(v[0]);        // SNAP  → attack / snap layer
    const b    = clamp01(v[1]);        // BODY  → body layer
    const y    = clamp01(v[2]);        // NOISE → air / clap spread
    const c    = clamp01(v[3]);        // CRACK → snap + clap layer
    const tone = clamp01(v[4] ?? 0.5); // TONE  → subtle filter offset only

    const p = new Float32Array(64);

    // Body — driven by BODY knob
    p[0]  = lerp(0.16, 0.62, b);                              // S_BODY_GAIN
    p[1]  = lerp(180.0, 260.0, b);                            // S_BODY_HZ
    p[2]  = lerp(280.0, 520.0, b * 0.6 + s * 0.4);           // S_BODY_ATK_HZ
    p[3]  = lerp(22.0, 85.0, b);                              // S_BODY_DECAY_MS
    p[4]  = lerp(800.0, 2800.0, b * 0.6 + tone * 0.4);       // S_BODY_TONE_HZ

    // Attack — driven by SNAP knob
    p[5]  = lerp(0.38, 1.10, s);                              // S_ATTACK_GAIN
    p[6]  = lerp(1.4, 0.35, s);                               // S_ATTACK_MS
    p[7]  = lerp(2.5, 0.6, s);                                // S_ATTACK_WIDTH (ms: wide→narrow as SNAP increases)
    p[8]  = lerp(900.0, 2600.0, s * 0.6 + tone * 0.4);       // S_ATTACK_BPF_HZ (lowered for 1.2kHz drill character)

    // Snap — driven by CRACK knob
    p[9]  = lerp(0.38, 1.50, c * 0.65 + s * 0.35);           // S_SNAP_GAIN
    p[10] = lerp(65.0, 22.0, c);                              // S_SNAP_DECAY_MS
    p[11] = lerp(1800.0, 4500.0, c * 0.6 + tone * 0.4);      // S_SNAP_BPF_HZ
    p[12] = lerp(0.40, 1.20, c);                              // S_SNAP_Q

    // Clap — driven by CRACK knob
    p[13] = lerp(0.30, 1.40, c);                              // S_CLAP_GAIN
    p[14] = lerp(1600.0, 4000.0, c * 0.6 + tone * 0.4);      // S_CLAP_BPF_HZ
    p[15] = lerp(0.50, 1.50, c);                              // S_CLAP_Q
    p[16] = lerp(0.60, 1.60, y);                              // S_CLAP_SPREAD

    // Air — driven by NOISE knob
    p[17] = lerp(0.006, 0.12, y * 0.55 + c * 0.45);          // S_AIR_GAIN
    p[18] = lerp(5000.0, 9000.0, y * 0.5 + tone * 0.5);      // S_AIR_HP_HZ

    // Output
    p[19] = 1.0;                                              // S_OUT_GAIN
    p[20] = lerp(0.06, 0.28, s * 0.5 + c * 0.5);             // S_SOFT_CLIP

    // [21] S_OUTPUT_LEVEL → set by applyCommandVolume
    return p;
  }

function get808Params(macros, midiNote) {
  const shock = 0.15;
  const dive = clamp01(macros[1] ?? 0.00);
  const mass = clamp01(macros[0] ?? 0.85);
  const glide = clamp01(macros[3] ?? 0.30);
  const decay = clamp01(macros[4] ?? 0.68);
  const drive = clamp01(macros[2] ?? 0.32);
  const throat = drive;
  const clip = 0.20;
  const baseFreq = midiNote != null && !Number.isNaN(Number(midiNote))
    ? 440.0 * Math.pow(2, (Number(midiNote) - 69) / 12)
    : lerp(60.0, 36.0, mass);
  const dropShape = Math.pow(dive, 0.85);
  const subShape = Math.pow(mass, 0.8);
  const startRatio = lerp(1.04, 2.65, dropShape);
  const p = new Float32Array(64);
  const mixKey = drive * 0.7 + throat * 0.3;
  const vocalKey = throat * 0.75 + shock * 0.25;
  const sharpKey = throat * 0.7 + shock * 0.3;

  // E_BASE_FREQ
  p[0] = baseFreq;

  // E_START_FREQ
  p[1] = baseFreq * startRatio;

  // E_BODY_DECAY_MS
  p[2] = lerp(540.0, 2600.0, decay);

  // E_PITCH_DROP_MS
  p[3] = lerp(190.0, 34.0, dropShape);

  // E_CLICK_GAIN
  p[4] = lerp(0.05, 0.85, shock);

  // E_CLICK_DECAY_MS
  p[5] = lerp(1.4, 10.0, shock);

  // E_GLOT_GAIN
  p[6] = lerp(0.02, 0.72, vocalKey);

  // E_GLOT_SHARP
  p[7] = lerp(1.6, 6.2, sharpKey);

  // E_GLOT_OQ
  p[8] = lerp(0.52, 0.30, throat);

  // E_SUB_START_MS
  p[9] = lerp(9.0, 3.0, shock);

  // E_SUB_ATTACK_MS
  p[10] = lerp(15.0, 4.0, shock);

  // E_SUB_PHASE_OFFSET
  p[11] = Math.PI / 2;

  // E_AIR_NOISE_GAIN
  p[12] = lerp(0.0, 0.10, throat * 0.7 + shock * 0.3);

  // E_AIR_HP_HZ
  p[13] = lerp(2400.0, 6200.0, throat);

  // E_AIR_DECAY_MS
  p[14] = lerp(28.0, 120.0, throat);

  // E_DRIVE
  p[15] = lerp(1.15, 4.2, drive);

  // E_ASYM_DRIVE
  p[16] = lerp(0.02, 0.32, drive * 0.6 + throat * 0.4);

  // E_TAIL_SINE_MIX
  p[17] = lerp(0.58, 0.99, subShape);

  // E_TRANSIENT_MIX
  p[18] = lerp(0.35, 1.0, shock);

  // E_HARM3_MIX
  p[19] = 0.0;

  // E_POS_DRIVE
  p[20] = p[15];

  // E_NEG_DRIVE
  p[21] = p[15];

  // E_OUTPUT_GAIN
  p[22] = lerp(0.58, 0.96, subShape) * lerp(0.96, 0.84, clip);

  // E_CLICK_FREQ
  p[23] = 850.0;

  // E_RETRIG_ATTACK_MS
  p[24] = 5.5;

  // E_RETRIG_FADE_MS
  p[25] = 4.5;

  // E_RELEASE_HALF_LIFE_SEC
  p[26] = lerp(0.035, 0.42, decay);

  // E_DC_HZ
  p[27] = 20.0;

  // E_TAIL_FADE_MS
  p[28] = lerp(28.0, 240.0, decay);

  // E_CLEAN_SUB_MIX
  p[29] = lerp(0.88, 0.72, mixKey) * lerp(0.82, 1.08, subShape);

  // E_THROAT_AMOUNT
  p[30] = lerp(0.18, 0.86, drive);

  // E_THROAT_SUB_GAIN_DB
  p[31] = lerp(0.18, 1.10, drive);

  // E_THROAT_NASAL_GAIN_DB
  p[32] = lerp(0.28, 1.85, drive);

  // E_THROAT_PRESENCE_GAIN_DB
  p[33] = lerp(0.20, 1.70, drive);

  // E_THROAT_GRIT
  p[34] = lerp(0.12, 0.92, drive);

  // E_THROAT_ASYM
  p[35] = lerp(0.035, 0.145, drive);

  // E_CHOKE_MS
  p[36] = lerp(28.0, 230.0, decay);

  // E_SLIDE_STEPS
  p[37] = 0.0;

  // E_GLIDE_MS
  p[38] = Math.round(10 + Math.pow(glide, 1.7) * 590);

  // E_SYNC16
  p[39] = 1.0;

  // E_ENGINE_MODE: 0 = legacy, 1 = deity8m
  p[40] = 1.0;

  return p;
}
  function getHatParams(v) {
    // v[0]=TONE, v[1]=DECAY (closed), v[2]=METAL, v[3]=OPEN(0/1), v[4]=OPEN_DECAY
    const tone   = clamp01(v[0]);
    const decay  = clamp01(v[1]);
    const metal  = clamp01(v[2]);
    const open   = (v[3] ?? 0) >= 0.5 ? 1.0 : 0.0;
    const openDecay = clamp01(v[4] ?? 0.5);

    const p = new Float32Array(64);
    p[0]  = tone;
    p[1]  = lerp(0.010, 0.120, decay);            // H_DECAY_CLOSED sec
    p[2]  = metal;
    p[3]  = open;
    p[4]  = lerp(0.92, 1.10, 1.0 - open * 0.15); // H_LEVEL
    p[8]  = lerp(0.120, 0.800, openDecay);        // H_DECAY_OPEN sec
    p[9]  = 0.85;                                 // H_STICK_GAIN (raised from 0.55)
    p[16] = lerp(1.2, 2.8, metal);                // H_DRIVE
    return p;
  }

  return {
    getKickParams,
    getSnareParams,
    get808Params,
    getHatParams
  };
})();
return ArcanaParamMapper;
})();
export const ArcanaParamMapper = mod;
