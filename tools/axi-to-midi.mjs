import fs from 'node:fs';
import path from 'node:path';

const [, , inputPath, outputPathArg] = process.argv;

if (!inputPath) {
  console.error('Usage: node tools/axi-to-midi.mjs <project.axi> [out.mid]');
  process.exit(1);
}

const project = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const outputPath = outputPathArg || path.join(
  process.cwd(),
  `${path.basename(inputPath, path.extname(inputPath))}.mid`
);

const PPQ = 480;
const DEFAULT_PAGE_DIVS = [4, 4, 4, 4];
const NOTE_MAP = {
  kick: 36,
  snare: 38,
  hatClosed: 42,
  hatOpen: 46,
};

function u16(value) {
  return Buffer.from([(value >> 8) & 0xff, value & 0xff]);
}

function u32(value) {
  return Buffer.from([
    (value >> 24) & 0xff,
    (value >> 16) & 0xff,
    (value >> 8) & 0xff,
    value & 0xff,
  ]);
}

function varLen(value) {
  let buffer = value & 0x7f;
  const bytes = [];
  while ((value >>= 7)) {
    buffer <<= 8;
    buffer |= ((value & 0x7f) | 0x80);
  }
  for (;;) {
    bytes.push(buffer & 0xff);
    if (buffer & 0x80) buffer >>= 8;
    else break;
  }
  return Buffer.from(bytes);
}

function textMeta(type, text) {
  const body = Buffer.from(String(text), 'utf8');
  return Buffer.concat([Buffer.from([0xff, type]), varLen(body.length), body]);
}

function tempoMeta(bpm) {
  const micros = Math.round(60000000 / (Number(bpm) || 120));
  return Buffer.from([0xff, 0x51, 0x03, (micros >> 16) & 0xff, (micros >> 8) & 0xff, micros & 0xff]);
}

function divsFor(track, pageIndex) {
  if (Array.isArray(track.pageDivisions) && Array.isArray(track.pageDivisions[pageIndex])) {
    return track.pageDivisions[pageIndex].map((v, i) => v === 3 ? 3 : (v === 4 ? 4 : DEFAULT_PAGE_DIVS[i]));
  }
  if (Array.isArray(track.beatDivisions)) {
    return track.beatDivisions.map((v, i) => v === 3 ? 3 : (v === 4 ? 4 : DEFAULT_PAGE_DIVS[i]));
  }
  return DEFAULT_PAGE_DIVS;
}

function isEnabledSlot(divs, slotInPage) {
  const beat = Math.floor(slotInPage / 4);
  const slot = slotInPage % 4;
  return !(divs[beat] === 3 && slot === 3);
}

function tickForStep(track, stepIndex) {
  const page = Math.floor(stepIndex / 16);
  const slotInPage = stepIndex % 16;
  const beat = Math.floor(slotInPage / 4);
  const slot = slotInPage % 4;
  const divs = divsFor(track, page);
  let tick = page * 4 * PPQ;
  for (let b = 0; b < beat; b++) tick += PPQ;
  tick += Math.round((slot * PPQ) / divs[beat]);
  return tick;
}

function durationForStep(track, stepIndex, step) {
  const page = Math.floor(stepIndex / 16);
  const slotInPage = stepIndex % 16;
  const beat = Math.floor(slotInPage / 4);
  const div = divsFor(track, page)[beat];
  const slotTicks = Math.round(PPQ / div);
  const gateSteps = Number(step?.gateSteps || 0);
  if (track.id === 'bass808' && gateSteps > 0) return Math.max(20, gateSteps * slotTicks);
  if (track.id === 'bass808') return Math.max(60, slotTicks * 2);
  return Math.max(30, Math.min(90, Math.round(slotTicks * 0.8)));
}

function velocityFor(step, track) {
  const stepVel = Number(step?.velocity ?? 1);
  const trackVol = Number(track?.volume ?? track?.macros?.VOLUME ?? 1);
  return Math.max(1, Math.min(127, Math.round(stepVel * trackVol * 127)));
}

function noteFor(track, step) {
  if (track.id === 'kick') return NOTE_MAP.kick;
  if (track.id === 'snare') return NOTE_MAP.snare;
  if (track.id === 'hat') return step?.hatMode === 'open' ? NOTE_MAP.hatOpen : NOTE_MAP.hatClosed;
  if (track.id === 'bass808') return Math.max(0, Math.min(127, Math.round(Number(step?.note ?? 36))));
  return null;
}

function collectEvents(project) {
  const events = [];
  for (const track of project.tracks || []) {
    if (track.mute) continue;
    for (let i = 0; i < (track.steps || []).length; i++) {
      const step = track.steps[i];
      if (!step?.on) continue;
      const page = Math.floor(i / 16);
      const slotInPage = i % 16;
      const divs = divsFor(track, page);
      if (!isEnabledSlot(divs, slotInPage)) continue;
      const note = noteFor(track, step);
      if (note == null) continue;
      const start = tickForStep(track, i);
      const duration = durationForStep(track, i, step);
      const vel = velocityFor(step, track);
      const sub = Math.max(1, Math.min(8, Math.round(Number(step.sub || 1))));
      const spread = Math.max(1, Math.floor(duration / sub));
      for (let r = 0; r < sub; r++) {
        const t = start + r * spread;
        events.push({ tick: t, bytes: [0x90, note, vel], order: 1 });
        events.push({ tick: t + Math.max(20, Math.floor(spread * 0.75)), bytes: [0x80, note, 0], order: 0 });
      }
    }
  }
  return events.sort((a, b) => a.tick - b.tick || a.order - b.order);
}

function makeTrack(events) {
  const chunks = [];
  let lastTick = 0;
  chunks.push(varLen(0), textMeta(0x03, 'Axion project'));
  chunks.push(varLen(0), tempoMeta(project.bpm || 120));
  chunks.push(varLen(0), Buffer.from([0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08]));
  for (const event of events) {
    chunks.push(varLen(Math.max(0, event.tick - lastTick)), Buffer.from(event.bytes));
    lastTick = event.tick;
  }
  chunks.push(varLen(0), Buffer.from([0xff, 0x2f, 0x00]));
  const body = Buffer.concat(chunks);
  return Buffer.concat([Buffer.from('MTrk'), u32(body.length), body]);
}

const events = collectEvents(project);
const header = Buffer.concat([
  Buffer.from('MThd'),
  u32(6),
  u16(0),
  u16(1),
  u16(PPQ),
]);
const midi = Buffer.concat([header, makeTrack(events)]);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, midi);

console.log(JSON.stringify({
  input: path.resolve(inputPath),
  output: path.resolve(outputPath),
  bpm: project.bpm || 120,
  events: events.length,
  noteOns: events.filter((event) => event.bytes[0] === 0x90).length,
}, null, 2));
