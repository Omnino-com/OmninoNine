#!/usr/bin/env node
// Careful output-report prober for the Cloud9 Button Board.
//
// Each report is logged to disk synchronously BEFORE it is sent, so if the board
// misbehaves the last SEND line in the log names the culprit. The run stops on
// the first reply, a write error, or the board disappearing from USB.
//
//   node tools/probe.js --first 0x08 --last 0x08
//   node tools/probe.js --first 0x00 --last 0x7f --skip 0x08 --gap 300
//   node tools/probe.js --first 0x10 --last 0x10 --prefix "01 02" --fill ff
//
// Report layout: [cmd, ...prefix, ...fill] padded to 64 bytes.
// Options:
//   --first / --last   command byte range (required)
//   --skip             comma-separated command bytes to leave out
//   --prefix           hex bytes placed straight after the command byte
//   --base             hex bytes set from offset 0, instead of cmd + prefix
//   --pos              offset of the swept byte when using --base (default 0)
//   --fill             hex byte for the remainder (default 00)
//   --gap              ms to wait for a reaction after each send (default 300)
//   --self-fill        fill each report with its own swept value, so a value the
//                      board displays identifies the command that set it
//   --id-text N        from offset N on, write the swept value as ASCII hex text
//   --nibble low|high  set bytes 1-3 to that nibble of the swept value
//   --keep-going       record replies but don't stop on them
//   --label            free text recorded in the log

const fs = require('fs');
const path = require('path');
const HID = require('node-hid');
const { VENDOR_ID, PRODUCT_ID, REPORT_SIZE } = require('../lib/protocol');

const LOG = path.join(__dirname, '..', 'captures', '02-probe.log');

function parseArgs(argv) {
  const opts = { fill: 0, gap: 300, prefix: [], skip: [], keepGoing: false, label: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--keep-going') opts.keepGoing = true;
    else if (a === '--self-fill') opts.selfFill = true;
    else if (a === '--id-text') opts.idText = Number(argv[++i]);
    else if (a === '--nibble') opts.nibble = argv[++i];
    else if (a === '--first') opts.first = Number(argv[++i]);
    else if (a === '--last') opts.last = Number(argv[++i]);
    else if (a === '--gap') opts.gap = Number(argv[++i]);
    else if (a === '--fill') opts.fill = parseInt(argv[++i], 16);
    else if (a === '--label') opts.label = argv[++i];
    else if (a === '--skip') opts.skip = argv[++i].split(',').map(Number);
    else if (a === '--prefix') opts.prefix = argv[++i].trim().split(/\s+/).filter(Boolean).map((h) => parseInt(h, 16));
    else if (a === '--base') opts.base = argv[++i].trim().split(/\s+/).filter(Boolean).map((h) => parseInt(h, 16));
    else if (a === '--pos') opts.pos = Number(argv[++i]);
    else throw new Error(`unknown option ${a}`);
  }
  if (!Number.isInteger(opts.first) || !Number.isInteger(opts.last)) throw new Error('--first and --last are required');
  return opts;
}

const hex = (buf) => Buffer.from(buf).toString('hex').replace(/(..)/g, '$1 ').trim();
const byteHex = (b) => `0x${b.toString(16).padStart(2, '0')}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(line) {
  const stamped = `${new Date().toISOString()} ${line}`;
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  fs.appendFileSync(LOG, `${stamped}\n`);
  console.log(stamped);
}

function boardPresent() {
  return HID.devices().some((d) => d.vendorId === VENDOR_ID && d.productId === PRODUCT_ID);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const info = HID.devices().find((d) => d.vendorId === VENDOR_ID && d.productId === PRODUCT_ID);
  if (!info) {
    log('ABORT board not found before start');
    process.exit(2);
  }

  const dev = new HID.HID(info.path);
  log(`START ${opts.label ? `"${opts.label}" ` : ''}range=${byteHex(opts.first)}-${byteHex(opts.last)} prefix=[${hex(opts.prefix)}] fill=${byteHex(opts.fill)} gap=${opts.gap}ms`);

  let replies = [];
  let failure = null;
  dev.on('data', (data) => {
    const buf = Buffer.from(data);
    replies.push(buf);
    log(`RECV ${hex(buf)}`);
  });
  dev.on('error', (err) => {
    failure = `device error: ${err.message}`;
    log(`ERROR ${failure}`);
  });

  let sent = 0;
  const responders = [];

  for (let cmd = opts.first; cmd <= opts.last; cmd += 1) {
    if (opts.skip.includes(cmd)) continue;

    const report = Buffer.alloc(REPORT_SIZE, opts.selfFill ? cmd : opts.fill);
    if (opts.base) {
      // --base sets the fixed bytes from offset 0; the swept value goes at --pos.
      Buffer.from(opts.base).copy(report, 0);
      report[opts.pos || 0] = cmd;
    } else {
      report[0] = cmd;
      Buffer.from(opts.prefix).copy(report, 1);
    }
    if (opts.nibble) {
      // Bytes 1-3 carry one nibble of the swept value, so a zone-style command
      // reveals itself by where it draws.
      const n = opts.nibble === 'low' ? cmd & 0x0f : cmd >> 4;
      report[1] = n;
      report[2] = n;
      report[3] = n;
    }
    if (opts.idText !== undefined) {
      // Text payload naming the swept value, e.g. "3C3C3C", so on-screen text
      // identifies the command that drew it.
      const name = cmd.toString(16).toUpperCase().padStart(2, '0');
      for (let i = opts.idText; i < REPORT_SIZE; i += 1) {
        report[i] = name.charCodeAt((i - opts.idText) % 2);
      }
    }

    replies = [];
    log(`SEND ${hex(report)}`);
    try {
      // Leading 0x00 is hidapi's "no report ID" marker; it isn't sent to the board.
      dev.write([0x00, ...report]);
    } catch (err) {
      failure = `write failed on ${byteHex(cmd)}: ${err.message}`;
      log(`ERROR ${failure}`);
      break;
    }
    sent += 1;
    await sleep(opts.gap);

    if (failure) break;
    if (!boardPresent()) {
      failure = `board vanished from USB after ${byteHex(cmd)}`;
      log(`ERROR ${failure}`);
      break;
    }
    if (replies.length) {
      responders.push(byteHex(cmd));
      if (!opts.keepGoing) {
        log(`STOP reply received after ${byteHex(cmd)}`);
        break;
      }
    }
  }

  log(`END sent=${sent} responders=[${responders.join(', ')}] failure=${failure || 'none'} board_present=${boardPresent()}`);
  try { dev.close(); } catch (_) { /* already gone */ }
  process.exit(failure ? 1 : 0);
}

main().catch((err) => {
  log(`FATAL ${err.message}`);
  process.exit(3);
});
