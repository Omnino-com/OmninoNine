#!/usr/bin/env node
// Passive listener: opens the Cloud9 Button Board and prints every input report.
// Sends NOTHING to the device. Safe to run at any time.
//
//   node tools/listen.js [seconds]
//
// Repeated identical reports are collapsed; changed bytes are listed so button
// presses are easy to spot in the output.

const HID = require('node-hid');

const VID = 0x2c82;
const PID = 0x012d;
const seconds = Number(process.argv[2] || 0);

const info = HID.devices().find((d) => d.vendorId === VID && d.productId === PID);
if (!info) {
  console.log('NOT_FOUND: Cloud9 Button Board is not connected');
  process.exit(1);
}

let dev;
try {
  dev = new HID.HID(info.path);
} catch (err) {
  console.log(`OPEN_FAILED: ${err.message}`);
  process.exit(1);
}
console.log(`OPEN_OK: ${info.product} (${info.path})`);

const start = Date.now();
const hex = (buf) => Buffer.from(buf).toString('hex').replace(/(..)/g, '$1 ').trim();
let last = null;
let count = 0;

dev.on('data', (data) => {
  count += 1;
  const cur = Buffer.from(data);
  const t = ((Date.now() - start) / 1000).toFixed(3);
  if (last && cur.equals(last)) return;
  const changed = [];
  if (last) {
    for (let i = 0; i < cur.length; i += 1) {
      if (cur[i] !== last[i]) changed.push(`[${i}] ${last[i]}->${cur[i]}`);
    }
  }
  console.log(`t=${t} n=${count} len=${cur.length} ${hex(cur)}`);
  if (changed.length) console.log(`  changed: ${changed.join(' ')}`);
  last = cur;
});

dev.on('error', (err) => {
  console.log(`DEVICE_ERROR: ${err.message}`);
  process.exit(1);
});

function finish() {
  console.log(`DONE: ${count} reports in ${((Date.now() - start) / 1000).toFixed(1)}s`);
  try { dev.close(); } catch (_) { /* already closed */ }
  process.exit(0);
}

process.on('SIGINT', finish);
process.on('SIGTERM', finish);
if (seconds > 0) setTimeout(finish, seconds * 1000);
