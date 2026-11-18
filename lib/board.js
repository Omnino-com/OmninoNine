'use strict';
// Driver for one Cloud9 Button Board.
//
//   const board = Cloud9Board.open();
//   board.on('button', ({ button, pressed, held }) => { ... });
//   board.setDisplay({ on: true, brightness: 128, page: 1 });
//   board.drawZone({ zone: 0, lines: ['CUE 1'], background: '#0000ff' });
//
// Events:
//   button      { button, pressed, held }   one per change; `held` lists everything down
//   identify    { unitId, buildDate, firmware }
//   disconnect  Error                       the board went away; this object is finished

const { EventEmitter } = require('events');
const HID = require('node-hid');
const P = require('./protocol');

const IDENTIFY_REPLY = 0xa5;
const TICKER_CLEAR_MS = 1200;

class Cloud9Board extends EventEmitter {
  static list() {
    return HID.devices().filter((d) => d.vendorId === P.VENDOR_ID && d.productId === P.PRODUCT_ID);
  }

  static open(path) {
    const target = path || Cloud9Board.list()[0]?.path;
    if (!target) throw new Error('No Cloud9 Button Board found');
    return new Cloud9Board(new HID.HID(target), target);
  }

  constructor(device, path) {
    super();
    this.device = device;
    this.path = path;
    this.mask = 0;
    this.closed = false;
    device.on('data', (data) => this.#onData(data));
    device.on('error', (err) => this.#fail(err));
  }

  #onData(data) {
    const buf = Buffer.from(data);
    if (buf[0] === IDENTIFY_REPLY) {
      // Same layout as a status report. Bytes 4-7 aren't a button mask here.
      const copy = Buffer.from(buf);
      copy[0] = P.STATUS_REPORT;
      const { unitId, buildDate, firmware } = P.parseStatusReport(copy);
      this.emit('identify', { unitId, buildDate, firmware });
      return;
    }
    const status = P.parseStatusReport(buf);
    if (!status) return;
    const events = P.diffMasks(this.mask, status.mask);
    this.mask = status.mask;
    const held = P.pressedButtons(status.mask);
    for (const { button, pressed } of events) this.emit('button', { button, pressed, held });
  }

  #fail(err) {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.tickerTimer);
    try { this.device.close(); } catch (_) { /* already gone */ }
    this.emit('disconnect', err);
  }

  #send(report) {
    if (this.closed) throw new Error('Board is closed');
    try {
      // Leading 0x00 is hidapi's "no report ID" marker; it isn't sent to the board.
      this.device.write([0x00, ...report]);
    } catch (err) {
      this.#fail(err);
      throw err;
    }
  }

  setDisplay(options) { this.#send(P.encodeDisplay(options)); }

  drawZone(options) { this.#send(P.encodeZone(options)); }

  setZoneText(options) { this.#send(P.encodeZoneText(options)); }

  clearZone(zone) { this.#send(P.encodeZone({ zone, background: '#000000', text: '#000000', border: '#000000' })); }

  clearAllZones() { for (let zone = 0; zone < P.ZONE_COUNT; zone += 1) this.clearZone(zone); }

  // Clears first and waits, because changing a message mid-scroll loses its first
  // few characters. So a new message takes a few seconds to appear, while the old
  // one scrolls away. Only the latest message is kept if calls overlap.
  setTicker(text = '') {
    clearTimeout(this.tickerTimer);
    this.#send(P.encodeTicker(''));
    if (text === '') return;
    this.tickerTimer = setTimeout(() => {
      if (!this.closed) this.#send(P.encodeTicker(text));
    }, TICKER_CLEAR_MS);
  }

  identify() { this.#send(P.encodeIdentify()); }

  close() {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.tickerTimer);
    this.device.close();
  }
}

module.exports = { Cloud9Board };
