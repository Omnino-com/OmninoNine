#!/usr/bin/env node
// Live hardware test. Paints all 24 tiles, then reacts to the buttons:
//   grid button   its tile turns white and says PRESSED while held
//   R2 / R3       page number up / down
//   R1            backlight cycles through levels
//   R4            scrolling message on / off
//   left column   shown in the log (and on the ticker)
//
//   node tools/demo.js [seconds]      (default 600)
//
// Every event is printed, so holding several buttons at once can be checked too.

const { Cloud9Board } = require('../lib/board');
const { BUTTONS } = require('../lib/protocol');

const seconds = Number(process.argv[2] || 600);
const PALETTE = [
  ['#c00000', '#ffffff'], ['#008000', '#ffffff'], ['#0000e0', '#ffffff'],
  ['#ffc000', '#000000'], ['#00c0c0', '#000000'], ['#a000a0', '#ffffff'],
];
const LEVELS = [20, 60, 128, 255];

const board = Cloud9Board.open();
let page = 1;
let level = 2;
let ticker = false;

function tile(button, pressed) {
  const [background, text] = PALETTE[button.zone % PALETTE.length];
  return {
    zone: button.zone,
    lines: [`CUE ${button.index}`, `Button ${button.number}`, pressed ? 'PRESSED' : '', `Zone ${button.zone}`],
    text: pressed ? '#000000' : text,
    background: pressed ? '#ffffff' : background,
    border: pressed ? '#ffff00' : '#ffffff',
  };
}

const show = () => board.setDisplay({ on: true, brightness: LEVELS[level], page });

board.setTicker('');
show();
BUTTONS.filter((b) => b.group === 'grid').forEach((b) => board.drawZone(tile(b, false)));

board.on('identify', (info) => console.log(`IDENTIFY ${JSON.stringify(info)}`));
board.identify();

board.on('button', ({ button, pressed, held }) => {
  const heldNames = held.map((b) => b.number).join(',') || '-';
  console.log(`${pressed ? 'DOWN' : 'UP  '} button=${button.number} ${button.name} zone=${button.zone ?? '-'} held=[${heldNames}]`);

  if (button.group === 'grid') {
    board.drawZone(tile(button, pressed));
    return;
  }
  if (!pressed) return;
  if (button.group === 'left') {
    board.setTicker(`${button.name} pressed   `);
  } else if (button.index === 1) {
    level = (level + 1) % LEVELS.length;
    show();
  } else if (button.index === 2) {
    page = (page + 1) % 256;
    show();
  } else if (button.index === 3) {
    page = (page + 255) % 256;
    show();
  } else if (button.index === 4) {
    ticker = !ticker;
    board.setTicker(ticker ? 'Hello from your Cloud9 Button Board   ' : '');
  }
});

board.on('disconnect', (err) => {
  console.log(`DISCONNECTED ${err.message}`);
  process.exit(1);
});

function finish() {
  console.log('DONE');
  board.close();
  process.exit(0);
}
process.on('SIGINT', finish);
process.on('SIGTERM', finish);
setTimeout(finish, seconds * 1000);
console.log(`READY for ${seconds}s`);
