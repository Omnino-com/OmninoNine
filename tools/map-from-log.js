#!/usr/bin/env node
// Turns a listen.js capture into a button map.
//
//   node tools/map-from-log.js captures/01-button-map.log
//
// Assumes buttons were pressed one at a time in this order:
//   left column (4), left grid (12), right grid (12), right column (4)
// and prints which bit of the 32-bit mask (bytes 4-7) each press set.

const fs = require('fs');

const file = process.argv[2];
const lines = fs.readFileSync(file, 'utf8').split('\n');

const names = [
  'L1 Handset', 'L2 Transfer', 'L3 Hold', 'L4 Release',
  ...Array.from({ length: 24 }, (_, i) => `Grid ${i + 1}`),
  'R1', 'R2', 'R3', 'R4',
];

const presses = [];
let prevMask = 0;
let chord = 0;
let reports = 0;

for (const line of lines) {
  const m = line.match(/^t=([\d.]+) n=(\d+) len=(\d+) ((?:[0-9a-f]{2} ?)+)$/);
  if (!m) continue;
  reports += 1;
  const bytes = m[4].trim().split(' ').map((h) => parseInt(h, 16));
  const mask = ((bytes[4] << 24) | (bytes[5] << 16) | (bytes[6] << 8) | bytes[7]) >>> 0;
  const rising = (mask & ~prevMask) >>> 0;
  if (rising) {
    if (rising & (rising - 1)) chord += 1;
    presses.push({ t: Number(m[1]), mask: rising });
  }
  prevMask = mask;
}

const seen = new Map();
presses.forEach((p, i) => {
  if (!seen.has(p.mask)) seen.set(p.mask, []);
  seen.get(p.mask).push(i);
});

console.log(`reports=${reports} presses=${presses.length} unique_bits=${seen.size} multi_bit_rises=${chord}`);
console.log('order  name          mask        byte  bit  bit#(LSB=0)');
presses.forEach((p, i) => {
  const bitNo = 31 - Math.clz32(p.mask);
  const byteIdx = 7 - Math.floor(bitNo / 8);
  const hex = p.mask.toString(16).padStart(8, '0');
  const dup = seen.get(p.mask).length > 1 ? '  DUP' : '';
  console.log(
    `${String(i + 1).padStart(5)}  ${(names[i] || '?').padEnd(12)}  0x${hex}  [${byteIdx}]   0x${(p.mask >>> (8 * (7 - byteIdx)))
      .toString(16)
      .padStart(2, '0')} ${String(bitNo).padStart(4)}${dup}`,
  );
});

const all = [...seen.keys()].reduce((a, b) => (a | b) >>> 0, 0);
const missing = [];
for (let b = 0; b < 32; b += 1) if (!(all & (1 << b))) missing.push(b);
console.log(`bits never seen: ${missing.length ? missing.join(', ') : 'none'}`);
