'use strict';
// Cloud9 Button Board (model 0301) - host protocol, as observed on real hardware.
// See docs/PROTOCOL.md for what is confirmed and what is still unknown.

const VENDOR_ID = 0x2c82;
const PRODUCT_ID = 0x012d;
const REPORT_SIZE = 64;
const STATUS_REPORT = 0x88;

// Physical order: left column, left grid, right grid, right column.
// `number` is 1-32, matching "Button 11 · 7" in the NineEdit screenshots.
// `bit` is the position in the big-endian 32-bit mask held in bytes 4-7.
// `zone` is the 0-based LCD zone above a grid button, as used by encodeZone.
// `index` is the 1-based position within the button's group.
const BUTTON_BITS = [
  4, 5, 6, 7, // left column (Handset, Transfer, Hold, Release)
  1, 13, 9, 21, 17, 29, // grid 1-6
  3, 15, 11, 23, 19, 31, // grid 7-12
  0, 12, 8, 20, 16, 28, // grid 13-18
  2, 14, 10, 22, 18, 30, // grid 19-24
  24, 25, 26, 27, // right column (top to bottom)
];

const LEFT_NAMES = ['Handset', 'Transfer', 'Hold', 'Release'];

const BUTTONS = BUTTON_BITS.map((bit, i) => {
  const number = i + 1;
  if (number <= 4) return { number, bit, group: 'left', index: number, name: LEFT_NAMES[i] };
  if (number <= 28) {
    const index = number - 4;
    return { number, bit, group: 'grid', index, zone: index - 1, name: `Grid ${index}` };
  }
  const index = number - 28;
  return { number, bit, group: 'right', index, name: `R${index}` };
});

const BUTTON_BY_BIT = new Map(BUTTONS.map((b) => [b.bit, b]));

function ascii(buf, start, end) {
  const slice = buf.subarray(start, end);
  const nul = slice.indexOf(0);
  return slice.subarray(0, nul === -1 ? slice.length : nul).toString('latin1');
}

// Returns null for anything that isn't a well-formed status report.
function parseStatusReport(data) {
  const buf = Buffer.from(data);
  // 0x88 is a button change. 0xa5 answers the identify command and has the same
  // layout, except bytes 4-7 aren't a button mask.
  if (buf.length !== REPORT_SIZE || buf[0] !== STATUS_REPORT) return null;
  return {
    header: buf.subarray(0, 4).toString('hex'),
    mask: buf.readUInt32BE(4),
    buildDate: ascii(buf, 8, 21),
    unitId: ascii(buf, 21, 41),
    firmware: ascii(buf, 41, 64),
  };
}

function pressedButtons(mask) {
  return BUTTONS.filter((b) => (mask >>> b.bit) & 1);
}

// Edge detection between two masks. Returns events in physical button order.
function diffMasks(prev, next) {
  const changed = (prev ^ next) >>> 0;
  return BUTTONS.filter((b) => (changed >>> b.bit) & 1).map((button) => ({
    button,
    pressed: Boolean((next >>> button.bit) & 1),
  }));
}

// --- Host-to-board commands ---------------------------------------------------

const CMD_ZONE = 0x51;
const CMD_DISPLAY = 0x53;
const CMD_ZONE_TEXT = 0x61;
const CMD_TICKER = 0x54;
const CMD_IDENTIFY = 0xa5;
const TICKER_RING = 48;
const ZONE_COUNT = 24;
const LINE_COUNT = 4;
const LINE_LENGTH = 8;
const LINE_FIELD = 9; // 8 characters plus a terminator
const LINES_OFFSET = 4;
// Each colour has an alternate two bytes before it, used when a zone flashes.
const ALT_TEXT_COLOUR_OFFSET = 40;
const TEXT_COLOUR_OFFSET = 42;
const ALT_BACKGROUND_COLOUR_OFFSET = 44;
const BACKGROUND_COLOUR_OFFSET = 46;
const ALT_BORDER_COLOUR_OFFSET = 48;
const BORDER_COLOUR_OFFSET = 50;

function clampByte(value, name) {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new RangeError(`${name} must be an integer from 0 to 255, got ${value}`);
  }
  return value;
}

// Accepts '#rrggbb' or [r, g, b] and returns a 16-bit RGB565 value.
function toRgb565(colour) {
  let rgb = colour;
  if (typeof colour === 'string') {
    const match = /^#?([0-9a-f]{6})$/i.exec(colour);
    if (!match) throw new TypeError(`bad colour: ${colour}`);
    const n = parseInt(match[1], 16);
    rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  if (!Array.isArray(rgb) || rgb.length !== 3) throw new TypeError(`bad colour: ${colour}`);
  const [r, g, b] = rgb.map((v) => clampByte(v, 'colour channel'));
  return ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
}

// Draws one tile. Zones count from 0 across the left panel's top row, then its
// bottom row, then the same on the right panel. All-black colours erase a zone.
// Only printable ASCII has been tested on the board, so anything else becomes '?'.
function assertZone(zone) {
  if (!Number.isInteger(zone) || zone < 0 || zone >= ZONE_COUNT) {
    throw new RangeError(`zone must be 0-${ZONE_COUNT - 1}, got ${zone}`);
  }
}

function writeLines(report, lines) {
  lines.slice(0, LINE_COUNT).forEach((line, i) => {
    const safe = String(line).slice(0, LINE_LENGTH).replace(/[^\x20-\x7e]/g, '?');
    Buffer.from(safe, 'latin1').copy(report, LINES_OFFSET + i * LINE_FIELD);
  });
}

// `flash` is byte 2: 0 is steady; small values (1-5 tested) make the board swap
// between the normal and `alternate` colours by itself, with no further traffic.
// Larger values (0x20, 0xff) sat on the alternate colours for at least 16 seconds.
function encodeZone({
  zone,
  lines = [],
  text = '#ffffff',
  background = '#000000',
  border = '#ffffff',
  alternate = {},
  flash = 0,
}) {
  assertZone(zone);
  const report = Buffer.alloc(REPORT_SIZE);
  report[0] = CMD_ZONE;
  report[1] = zone;
  report[2] = clampByte(flash, 'flash');
  writeLines(report, lines);
  report.writeUInt16LE(toRgb565(alternate.text ?? text), ALT_TEXT_COLOUR_OFFSET);
  report.writeUInt16LE(toRgb565(text), TEXT_COLOUR_OFFSET);
  report.writeUInt16LE(toRgb565(alternate.background ?? background), ALT_BACKGROUND_COLOUR_OFFSET);
  report.writeUInt16LE(toRgb565(background), BACKGROUND_COLOUR_OFFSET);
  report.writeUInt16LE(toRgb565(alternate.border ?? border), ALT_BORDER_COLOUR_OFFSET);
  report.writeUInt16LE(toRgb565(border), BORDER_COLOUR_OFFSET);
  return report;
}

// Replaces a zone's text and keeps its colours.
function encodeZoneText({ zone, lines = [] }) {
  assertZone(zone);
  const report = Buffer.alloc(REPORT_SIZE);
  report[0] = CMD_ZONE_TEXT;
  report[1] = zone;
  writeLines(report, lines);
  return report;
}

// Scrolling text along the top of both panels. An empty string clears it.
//
// The ticker is a 48-character ring. When the ring is full of text, the message
// slides in from the far right of the right panel, crosses it, continues onto the
// far right of the left panel, crosses that and repeats. A shorter message ends in a
// terminator, which breaks the ring: it then just starts at each panel's left edge.
// So messages are always padded with spaces, which also sets the gap between repeats.
function encodeTicker(text = '') {
  const report = Buffer.alloc(REPORT_SIZE);
  report[0] = CMD_TICKER;
  report[2] = 1;
  const safe = String(text).slice(0, TICKER_RING).replace(/[^\x20-\x7e]/g, '?');
  if (safe !== '') {
    Buffer.from(safe.padEnd(REPORT_SIZE - 4, ' '), 'latin1').copy(report, 4);
  }
  return report;
}

// on=false blanks the panels. brightness is the raw 0-255 backlight level.
// page is drawn by the board itself as PAGE:nnn at the top right.
function encodeDisplay({ on = true, brightness = 255, page = 0 }) {
  const report = Buffer.alloc(REPORT_SIZE);
  report[0] = CMD_DISPLAY;
  report[1] = on ? 1 : 0;
  report[2] = clampByte(brightness, 'brightness');
  report[3] = clampByte(page, 'page');
  return report;
}

function encodeIdentify() {
  const report = Buffer.alloc(REPORT_SIZE);
  report[0] = CMD_IDENTIFY;
  return report;
}

module.exports = {
  VENDOR_ID,
  PRODUCT_ID,
  REPORT_SIZE,
  STATUS_REPORT,
  BUTTONS,
  BUTTON_BY_BIT,
  CMD_ZONE,
  CMD_DISPLAY,
  CMD_ZONE_TEXT,
  CMD_TICKER,
  CMD_IDENTIFY,
  ZONE_COUNT,
  LINE_COUNT,
  LINE_LENGTH,
  parseStatusReport,
  pressedButtons,
  diffMasks,
  toRgb565,
  encodeZone,
  encodeZoneText,
  encodeTicker,
  encodeDisplay,
  encodeIdentify,
};
