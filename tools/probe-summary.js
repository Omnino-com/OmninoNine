#!/usr/bin/env node
// Summarises probe runs from captures/02-probe.log.
//
//   node tools/probe-summary.js [runs-back]    (default 1 = most recent run)
//
// Each reply is paired with the SEND before it, grouped by reply bytes, and
// shown with its differences from the most common reply.

const fs = require('fs');
const path = require('path');

const LOG = path.join(__dirname, '..', 'captures', '02-probe.log');
const runsBack = Number(process.argv[2] || 1);

const lines = fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean);
const starts = lines.map((l, i) => (l.includes(' START ') ? i : -1)).filter((i) => i >= 0);
const from = starts[Math.max(0, starts.length - runsBack)];

let sent = 0;
let lastSend = null;
const pairs = [];
const silent = [];
let pendingSilent = null;

for (const line of lines.slice(from)) {
  const body = line.slice(line.indexOf(' ') + 1);
  if (body.startsWith('START') || body.startsWith('END') || body.startsWith('ERROR') || body.startsWith('STOP')) {
    console.log(body);
  }
  if (body.startsWith('SEND ')) {
    if (pendingSilent) silent.push(pendingSilent);
    lastSend = body.slice(5);
    pendingSilent = lastSend;
    sent += 1;
  } else if (body.startsWith('RECV ')) {
    pairs.push({ send: lastSend, recv: body.slice(5) });
    pendingSilent = null;
  }
}
if (pendingSilent) silent.push(pendingSilent);

const shortSend = (s) => s.split(' ').slice(0, 8).join(' ');
const groups = new Map();
for (const p of pairs) {
  if (!groups.has(p.recv)) groups.set(p.recv, []);
  groups.get(p.recv).push(p.send);
}
const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
const baseline = ordered.length ? ordered[0][0].split(' ') : [];

console.log(`\nsent=${sent} replies=${pairs.length} silent=${silent.length} distinct_replies=${groups.size}`);
ordered.forEach(([recv, sends], i) => {
  const bytes = recv.split(' ');
  const diffs = bytes
    .map((b, idx) => (b !== baseline[idx] ? `[${idx}]${baseline[idx]}->${b}` : null))
    .filter(Boolean);
  console.log(`\nreply ${i + 1} (${sends.length}x): ${bytes.slice(0, 24).join(' ')} ...`);
  if (i > 0) console.log(`  differs from reply 1: ${diffs.join(' ')}`);
  const shown = sends.slice(0, 12).map(shortSend);
  console.log(`  from: ${shown.join(' | ')}${sends.length > 12 ? ` | +${sends.length - 12} more` : ''}`);
});
