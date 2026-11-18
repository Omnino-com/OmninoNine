#!/usr/bin/env node
// Prints a 0x51 zone report as hex, for use with try.sh.
//
//   node tools/zone-hex.js "<b1> <b2> <b3>" "LINE1|LINE2|LINE3|LINE4" [tail-hex]
//
// Lines are NUL-padded into 9-byte fields at bytes 4-39.
// tail-hex fills from byte 40; by default it's the tail of the positional test
// that drew a working tile (0x54, 0x55, ...).

const [head, text, tail] = process.argv.slice(2);
const report = Buffer.alloc(64);
report[0] = 0x51;
head.trim().split(/\s+/).forEach((h, i) => { report[i + 1] = parseInt(h, 16); });
(text || '').split('|').slice(0, 4).forEach((line, i) => {
  Buffer.from(line.slice(0, 8), 'latin1').copy(report, 4 + i * 9);
});
if (tail !== undefined) {
  tail.trim().split(/\s+/).filter(Boolean).forEach((h, i) => { report[40 + i] = parseInt(h, 16); });
} else {
  for (let i = 40; i < 64; i += 1) report[i] = 0x54 + (i - 40);
}
console.log(report.toString('hex').replace(/(..)/g, '$1 ').trim());
