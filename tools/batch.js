#!/usr/bin/env node
// Sends a list of 0x51 zone reports (or raw reports) in one go, for "test sheets":
// one photo then shows many results. Each report is logged before it is sent.
//
//   node tools/batch.js sheet.json
//
// sheet.json is an array of entries, sent in order:
//   { "zone": 3, "b2": 0, "b3": 0, "lines": ["TOP", "LINE2"], "tail": "54 55 56" }
//   { "raw": "53 01 ff 01" }
//
// "tail" is hex from byte 40 and defaults to the tail of the positional test.

const fs = require('fs');
const path = require('path');
const HID = require('node-hid');
const { VENDOR_ID, PRODUCT_ID, REPORT_SIZE } = require('../lib/protocol');

const LOG = path.join(__dirname, '..', 'captures', '02-probe.log');
const hex = (buf) => Buffer.from(buf).toString('hex').replace(/(..)/g, '$1 ').trim();
const parseHex = (s) => s.trim().split(/\s+/).filter(Boolean).map((h) => parseInt(h, 16));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(line) {
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  fs.appendFileSync(LOG, `${new Date().toISOString()} ${line}\n`);
}

function build(entry) {
  const report = Buffer.alloc(REPORT_SIZE);
  if (entry.raw) {
    Buffer.from(parseHex(entry.raw)).copy(report, 0);
    return report;
  }
  report[0] = 0x51;
  report[1] = entry.zone;
  report[2] = entry.b2 || 0;
  report[3] = entry.b3 || 0;
  (entry.lines || []).slice(0, 4).forEach((line, i) => {
    Buffer.from(line.slice(0, 8), 'latin1').copy(report, 4 + i * 9);
  });
  if (entry.tail !== undefined) {
    Buffer.from(parseHex(entry.tail)).copy(report, 40);
  } else {
    for (let i = 40; i < REPORT_SIZE; i += 1) report[i] = 0x54 + (i - 40);
  }
  return report;
}

async function main() {
  const file = process.argv[2];
  const entries = JSON.parse(fs.readFileSync(file, 'utf8'));
  const info = HID.devices().find((d) => d.vendorId === VENDOR_ID && d.productId === PRODUCT_ID);
  if (!info) throw new Error('board not found');
  const dev = new HID.HID(info.path);
  dev.on('data', (data) => {
    log(`RECV ${hex(data)}`);
    console.log(`RECV ${hex(data).slice(0, 48)}`);
  });
  log(`START batch ${path.basename(file)} entries=${entries.length}`);
  for (const entry of entries) {
    const report = build(entry);
    log(`SEND ${hex(report)}`);
    dev.write([0x00, ...report]);
    await sleep(40);
  }
  await sleep(150);
  const present = HID.devices().some((d) => d.vendorId === VENDOR_ID && d.productId === PRODUCT_ID);
  log(`END batch sent=${entries.length} board_present=${present}`);
  console.log(`sent=${entries.length} board_present=${present}`);
  dev.close();
}

main().catch((err) => {
  log(`FATAL ${err.message}`);
  console.error(err.message);
  process.exit(1);
});
