// Sonidos sintetizados con Web Audio (sin archivos externos).
import { S } from './state';

let ctx: AudioContext | null = null;
const ac = () => (ctx ||= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)());

function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.12, at = 0) {
  const c = ac();
  const t = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function knock(gain: number) {
  const c = ac();
  const len = Math.floor(c.sampleRate * 0.05);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6);
  const src = c.createBufferSource();
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 1400;
  const g = c.createGain();
  g.gain.value = gain;
  src.buffer = buf;
  src.connect(f).connect(g).connect(c.destination);
  src.start();
}

export type SoundKind = 'move' | 'capture' | 'check' | 'good' | 'bad' | 'done' | 'goat' | 'goatShort';

/** Balidos de cabra reales (public/sounds/goat*.ogg, CC0 de BigSoundBank). Se cargan una sola vez. */
const goatBufs: Partial<Record<'goat' | 'goat-short', Promise<AudioBuffer | null>>> = {};
function goatFile(name: 'goat' | 'goat-short'): Promise<AudioBuffer | null> {
  return (goatBufs[name] ||= (async () => {
    try {
      const r = await fetch(import.meta.env.BASE_URL + 'sounds/' + name + '.ogg');
      return r.ok ? await ac().decodeAudioData(await r.arrayBuffer()) : null;
    } catch { return null; }
  })());
}
async function playGoat(name: 'goat' | 'goat-short') {
  const buf = await goatFile(name);
  if (!buf) { tone(660, 0.12, 'sine', 0.09); return; }
  const c = ac();
  const src = c.createBufferSource();
  const g = c.createGain();
  g.gain.value = 0.9;
  src.buffer = buf;
  src.connect(g).connect(c.destination);
  src.start();
}

export function sound(kind: SoundKind) {
  if (!S.settings.sound) return;
  try {
    if (kind === 'move') knock(0.5);
    else if (kind === 'capture') { knock(0.9); tone(180, 0.06, 'triangle', 0.08); }
    else if (kind === 'check') { knock(0.6); tone(880, 0.08, 'sine', 0.05); }
    else if (kind === 'good') { tone(660, 0.12, 'sine', 0.09); tone(990, 0.16, 'sine', 0.08, 0.09); }
    else if (kind === 'bad') { tone(220, 0.18, 'sawtooth', 0.05); }
    else if (kind === 'goat') void playGoat('goat');
    else if (kind === 'goatShort') void playGoat('goat-short');
    else if (kind === 'done') { tone(523, 0.12, 'sine', 0.08); tone(659, 0.12, 'sine', 0.08, 0.1); tone(784, 0.22, 'sine', 0.08, 0.2); }
  } catch { /* sin audio */ }
}

export const moveSound = (r: { captured?: boolean; check?: boolean } | null) => r && sound(r.check ? 'check' : r.captured ? 'capture' : 'move');
