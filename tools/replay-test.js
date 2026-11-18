#!/usr/bin/env node
// Replays a listen.js capture through lib/protocol.js and checks the result.
// Needs no hardware.
//
//   node tools/replay-test.js captures/01-button-map.log

const assert = require('assert');
const fs = require('fs');
const {
  BUTTONS,
  parseStatusReport,
  diffMasks,
  pressedButtons,
  toRgb565,
  encodeZone,
  encodeZoneText,
  encodeTicker,
  encodeDisplay,
  encodeIdentify,
} = require('../lib/protocol');

const reports = fs
  .readFileSync(process.argv[2], 'utf8')
  .split('\n')
  .map((line) => line.match(/^t=[\d.]+ n=\d+ len=\d+ ((?:[0-9a-f]{2} ?)+)$/))
  .filter(Boolean)
  .map((m) => Buffer.from(m[1].replace(/ /g, ''), 'hex'));

assert.strictEqual(BUTTONS.length, 32, 'expected 32 buttons');
assert.strictEqual(new Set(BUTTONS.map((b) => b.bit)).size, 32, 'button bits must be unique');
assert.strictEqual(BUTTONS[10].number, 11);
assert.strictEqual(BUTTONS[10].index, 7, 'button 11 is grid button 7, as in the NineEdit screenshot');
assert.strictEqual(BUTTONS[10].zone, 6, 'and its LCD zone is 6 on the wire, which counts from 0');
assert.deepStrictEqual(
  BUTTONS.filter((b) => b.group === 'grid').map((b) => b.zone),
  Array.from({ length: 24 }, (_, i) => i),
  'grid buttons map onto zones 0-23 in order',
);

let mask = 0;
const events = [];
for (const report of reports) {
  const status = parseStatusReport(report);
  assert.ok(status, 'every captured report should parse');
  assert.strictEqual(status.buildDate, '201803141300');
  assert.strictEqual(status.unitId, '00000000001');
  assert.strictEqual(status.firmware, '0.20');
  events.push(...diffMasks(mask, status.mask));
  mask = status.mask;
}

assert.strictEqual(reports.length, 64, 'expected 32 press/release pairs');
assert.strictEqual(events.length, 64, 'each report should change exactly one button');
assert.strictEqual(mask, 0, 'all buttons should end released');

events.forEach((event, i) => {
  const expected = BUTTONS[Math.floor(i / 2)];
  assert.strictEqual(event.button.number, expected.number, `event ${i}: wrong button`);
  assert.strictEqual(event.pressed, i % 2 === 0, `event ${i}: wrong direction`);
});

// Chords can't be confirmed from this capture, so check the decoding logic directly.
const chord = (1 << 4) | (1 << 1) | (1 << 24);
assert.deepStrictEqual(pressedButtons(chord).map((b) => b.number), [1, 5, 29]);

// Encoders: expected bytes come from reports that were seen working on the panels.
assert.strictEqual(toRgb565('#ff0000'), 0xf800);
assert.strictEqual(toRgb565([0, 255, 0]), 0x07e0);
assert.strictEqual(toRgb565('#0000ff'), 0x001f);

const tile = encodeZone({
  zone: 7,
  lines: ['CUE 8', 'PURPLE', 'LINE 3', '123456789'],
  text: '#ffffff',
  background: [128, 0, 255],
  border: '#ffffff',
});
assert.strictEqual(tile.length, 64);
assert.strictEqual(tile[0], 0x51);
assert.strictEqual(tile[1], 7);
assert.strictEqual(tile.subarray(4, 13).toString('latin1'), 'CUE 8\0\0\0\0');
assert.strictEqual(tile.subarray(31, 40).toString('latin1'), '12345678\0', 'lines are cut to 8 characters');
assert.deepStrictEqual([...tile.subarray(42, 44)], [0xff, 0xff]);
assert.deepStrictEqual([...tile.subarray(46, 48)], [0x1f, 0x80]);
assert.deepStrictEqual([...tile.subarray(50, 52)], [0xff, 0xff]);
assert.strictEqual(encodeZone({ zone: 0, lines: ['café'] }).subarray(4, 8).toString('latin1'), 'caf?');
assert.throws(() => encodeZone({ zone: 24 }), RangeError);
assert.throws(() => encodeZone({ zone: 0, text: 'red' }), TypeError);

assert.deepStrictEqual([...encodeDisplay({ on: true, brightness: 255, page: 13 }).subarray(0, 4)], [0x53, 1, 255, 13]);
assert.deepStrictEqual([...encodeDisplay({ on: false, brightness: 1, page: 11 }).subarray(0, 4)], [0x53, 0, 1, 11]);
assert.throws(() => encodeDisplay({ page: 256 }), RangeError);
assert.strictEqual(encodeIdentify()[0], 0xa5);

const flashingTile = encodeZone({
  zone: 6,
  text: '#ffffff',
  background: '#ff0000',
  border: '#ffffff',
  alternate: { text: '#000000', background: '#ffff00' },
  flash: 5,
});
assert.strictEqual(flashingTile[2], 5, 'flash is byte 2');
assert.deepStrictEqual([...flashingTile.subarray(40, 42)], [0x00, 0x00], 'alternate text');
assert.deepStrictEqual([...flashingTile.subarray(44, 46)], [0xe0, 0xff], 'alternate background');
assert.deepStrictEqual([...flashingTile.subarray(46, 48)], [0x00, 0xf8], 'background');
assert.deepStrictEqual([...flashingTile.subarray(48, 50)], [0xff, 0xff], 'alternate border defaults to border');
assert.strictEqual(encodeZone({ zone: 1 })[2], 0, 'steady by default');
assert.throws(() => encodeZone({ zone: 1, flash: 256 }), RangeError);

const textOnly = encodeZoneText({ zone: 2, lines: ['TEXT', 'ONLY'] });
assert.deepStrictEqual([...textOnly.subarray(0, 4)], [0x61, 2, 0, 0]);
assert.strictEqual(textOnly.subarray(13, 22).toString('latin1'), 'ONLY\0\0\0\0\0');
assert.ok(textOnly.subarray(40).every((b) => b === 0), 'nothing past the text');

const ticker = encodeTicker('HELLO');
assert.deepStrictEqual([...ticker.subarray(0, 4)], [0x54, 0, 1, 0]);
assert.strictEqual(ticker.subarray(4).toString('latin1'), 'HELLO'.padEnd(60, ' '), 'padded with no terminator, keeping the ring intact');
assert.strictEqual(encodeTicker('y'.repeat(70)).subarray(4).toString('latin1'), `${'y'.repeat(48)}${' '.repeat(12)}`, 'only 48 characters fit the ring');
assert.deepStrictEqual([...encodeTicker('').subarray(0, 4)], [0x54, 0, 1, 0], 'the form seen to clear reliably');
assert.ok(encodeTicker('').subarray(4).every((b) => b === 0), 'empty ticker has no text');

console.log(`PASS: ${reports.length} reports decoded to ${events.length} events on ${BUTTONS.length} buttons, in physical order`);
