# OmninoNine

Software for the **Cloud9 Technologies Button Board (model 0301)**, a 32-button
panel with 24 text and colour LCD tiles. There's no public documentation for the
board, so the USB protocol was worked out by probing it. See
[docs/PROTOCOL.md](docs/PROTOCOL.md).

## What's here

| Path | What it is |
| --- | --- |
| `companion-modules/cloud9-button-board/` | Bitfocus Companion surface module, for using the board as a Companion control surface |
| `lib/` | Node driver: reads button presses, draws the tiles, sets the backlight and page number, runs the ticker |
| `docs/PROTOCOL.md` | The board's USB protocol |
| `tools/` | Scripts used to probe and test the board (`demo.js` is a live hardware test) |
| `captures/` | Logs and photos from probing the board |
| `packaging/` | The user README and extras that go into the release zip |
| `scripts/package-companion.sh` | Builds the release zip |

## Using the board with Companion

Get the release zip and follow the `README.md` inside it. It's the same file as
[packaging/README.md](packaging/README.md). The module loads into Companion 5.1+ as a
developer module.

## Building the release zip

You need Node 22.21+ (or 26.5+) and npm.

```sh
cd companion-modules/cloud9-button-board
npm install            # first time only
cd ../..
scripts/package-companion.sh
```

This builds and tests the module, then writes
`release/OmninoNine-cloud9-companion-v<version>.zip`. To release a new version, bump
`version` in both `companion-modules/cloud9-button-board/package.json` and
`companion/manifest.json`. The script stops if the two don't match.

## Working on the module

```sh
cd companion-modules/cloud9-button-board
npm run dev    # rebuild on save
npm test
```

Point Companion's **Developer Modules Path** (Advanced Settings → Developer) at this
repo's `companion-modules/` folder. Companion restarts the module whenever `dist/`
changes.

## Using the driver directly

```sh
npm install
node tools/demo.js     # paints the tiles and reacts to the buttons
```

```js
const { Cloud9Board } = require('./lib/board');
const board = Cloud9Board.open();
board.on('button', ({ button, pressed }) => console.log(button, pressed));
board.drawZone({ zone: 0, lines: ['CUE 1'], background: '#0000ff' });
```

Only one program can use the board at a time.
