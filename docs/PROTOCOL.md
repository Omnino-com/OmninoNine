# Cloud9 Button Board (model 0301): host protocol

Worked out from this unit. There is no public documentation that we could find.

## USB identity (confirmed)

| Field | Value |
|---|---|
| Vendor / product | `0x2c82` / `0x012d` |
| Strings | "Cloud9 Technologies" / "Cloud9 Button Board" |
| USB serial number | None, so it can't tell two boards apart |
| Speed / power | Full speed (12 Mb/s), 500 mA |
| Interface | HID, usage page `0xFF00`, usage `0x01` |
| Reports | 64 bytes in, 64 bytes out, no report IDs, no feature reports |

macOS binds its own HID driver, so no custom driver is needed.

Only one program can hold the board at a time: with the default hidapi open, a
second attempt fails with "exclusive access and device already open". Close other
tools before running a test.

## Input: status report (confirmed)

Sent only when a button changes state. Nothing is sent while idle, and no init
command is needed.

| Bytes | Example | Meaning |
|---|---|---|
| 0-3 | `88 00 01 03` | Report type `0x88`, then 3 bytes that didn't change (meaning unknown) |
| 4-7 | `00 00 00 10` | Big-endian 32-bit mask of buttons currently held |
| 8-20 | `201803141300` | ASCII, probably firmware build date (2018-03-14 13:00) |
| 21-40 | `00000000001` | ASCII, probably a unit ID. It may be the same on every board |
| 41-63 | `0.20` | ASCII, probably firmware version |

The meanings of bytes 8-63 are inferred from their contents.

## Button map (confirmed by a 32-button capture)

`captures/01-button-map.log`, decoded by `lib/protocol.js`. Button numbers follow
the NineEdit screenshots: "Button 11 · 7" is grid button 7.

| Button | Control | Mask bit (LSB = 0) |
|---|---|---|
| 1-4 | Left column: Handset, Transfer, Hold, Release | 4, 5, 6, 7 |
| 5-10 | Grid 1-6 (left panel, top row) | 1, 13, 9, 21, 17, 29 |
| 11-16 | Grid 7-12 (left panel, bottom row) | 3, 15, 11, 23, 19, 31 |
| 17-22 | Grid 13-18 (right panel, top row) | 0, 12, 8, 20, 16, 28 |
| 23-28 | Grid 19-24 (right panel, bottom row) | 2, 14, 10, 22, 18, 30 |
| 29-32 | Right column, top to bottom | 24, 25, 26, 27 |

Each 4-bit nibble of the mask is one wiring column. That's why the bits look
scrambled, and the regularity suggests the presses were captured in the intended
order.

## Output: commands to the board

All commands are 64-byte reports. The first byte selects the command. Except for
identify, none of them send a reply. Worked out by probing and photographing the
panels; every send is in `captures/02-probe.log`.

The board doesn't require a model header (`a5` alone works), and bytes 0-3 of its
reports (`88 00 01 03`) include the model number, 0x0301, little-endian.

### `0xA5`: identify (confirmed)

Replies with `a5 00 01 03 02 02 00 00`, then the same build date, unit ID and
firmware fields as a status report. All other bytes are ignored. Bytes 4-7
(`02 02 00 00`) aren't a button mask, and their meaning is unknown.

### `0x53`: display state (confirmed)

| Byte | Meaning |
|---|---|
| 1 | 0 = panels off, any other value = on |
| 2 | Backlight, raw 0-255. 0 is dim but readable, 255 is bright |
| 3 | Page number. The board draws `PAGE:nnn` at the top right of the right panel |

Bytes 4-63 had no visible effect. This board was dark when we first found it and
lit up once this command was sent with byte 1 non-zero.

### `0x51`: draw one zone (confirmed)

| Bytes | Meaning |
|---|---|
| 1 | Zone 0-23: left panel top row 0-5, bottom row 6-11; right panel top row 12-17, bottom row 18-23 |
| 2 | Flash. 0 = steady. See below |
| 3 | No visible effect, use 0 |
| 4-39 | Four 9-byte text fields: 8 characters, then a terminator |
| 40-41 | Alternate text colour |
| 42-43 | Text colour |
| 44-45 | Alternate background colour |
| 46-47 | Background colour |
| 48-49 | Alternate border colour |
| 50-51 | Border colour |

Colours are RGB565, little-endian. Bytes 52-63 had no visible effect.

Flash timing was measured with a 16-second, 2-frames-per-second capture
(`captures/photos/flash-timeline.jpg`, driven by `captures/sheets/04-flash.json`):

| Byte 2 | Behaviour |
|---|---|
| 0 | Steady on normal colours, whatever byte 3 holds |
| 1, 2, 3, 5 | Swaps between normal and alternate colours by itself, with no USB traffic. The rhythm varies with the value |
| `20`, `FF` | Sat on the alternate colours for the whole 16 seconds. Could be a very slow flash or a hold |

The exact timing wasn't worked out: 2 frames per second is too slow to measure the
faster rates.

All-zero colours draw black on black, which erases a zone. The panels look blue
at high backlight even where nothing is drawn, probably backlight showing through
black, though that's an inference from photos.

By position, zone n sits above grid button n+1 (button number n+5).

Unexplained: reports filled with one repeated byte (`51 05 05 05 41 41 ...`) also
drew long rows of text across other zones. Normal tiles don't do this, so leave
unused bytes at 0.

### `0x61`: zone text only (confirmed)

Same layout as `0x51` for bytes 1 and 4-39. Replaces a zone's text and keeps its
colours: `61 00 00 00` plus text updated a red tile and it stayed red.

Byte 2 appears to control flash here too: zones sent `61 01 01 01 ...` and
`61 03 03 03 ...` then flashed between their colours and black, their alternates
being black at the time. Keep byte 2 at 0 for steady text.

### `0x54`: scrolling ticker (confirmed)

Text from byte 4 scrolls left along the top of both panels, at about 11 characters
per second. Filmed with `tools/ticker-film.sh`; contact sheets are in
`captures/photos/`.

**To use it, send `54 00 01 00` plus the message, padded with spaces to fill all 60
bytes with no terminator.** The ticker is a 48-character ring, so only the first 48
characters are used. A full ring behaves as one continuous line: the text enters at
the far right of the right panel, crosses it, carries on from the far right of the
left panel, crosses that and repeats. The padding sets the gap between repeats. A
numbered string showed characters 0-47 wrapping straight back to 0.

Changing the message mid-scroll loses about the first 10 characters of the first
pass, though later passes are complete. Clearing first and waiting about 1.2 seconds
avoided that (one film), so the driver's `setTicker` does this. The old text finishes
scrolling first, so a new message took about 5 seconds to appear.

Seen in 4 of 4 films overall.

A message that ends early in a terminator doesn't form a ring and behaves differently:

| Header | Observed |
|---|---|
| `54 00 01 00` + short text | Each panel picks it up at its next pass, about 8.5 seconds after sending, at that panel's left edge. Right panel first, then left, repeating roughly every 8-9 seconds |
| `54 00 01 00`, no text | Clears the ticker. Stayed blank for 9+ seconds |
| `54 01 01 01` + text | Sometimes starts the text at the left edge of both panels, each with its own copy, repeating more often. It also once failed to load at all |
| `54 01 01 01`, no text | Not a reliable clear: it worked once, and failed once |
| `54 01 00 00`, `54 00 00 01` + text | Text isn't loaded. These seem to trigger a pass on the left and right panel respectively |
| `54 00 00 00` | No visible effect |
| Byte 2 = `02` | Text loads, like `01` |
| Byte 2 = `04`, `08` | Text loads and appears at a panel's left edge. These weren't seen sliding in |

Each panel keeps the text it had until its next pass, and text sent during a pass
can briefly merge the first 10 or so old characters with the new ones.

Speed: no control found. It stayed about the same with byte 2 = 1, 2, 4, 8, byte 3 =
8, `FF`, and with non-zero bytes after the text. Bytes after a message's end can be
drawn as characters, so leave them at 0.

Not understood: twice, short terminated messages (`54 00 01 00` and `54 00 02 00`)
also entered from the far right, and replaying the preceding commands didn't
reproduce that. Identical short-message commands don't always behave the same, so
always use the padded form.

The `0x45` label in earlier notes was a misreading: the test text was hex of the
command byte, and scrolling makes `5454` look like `4545`.

### Character set

Bytes `0x01` and `0x03` drew a smiley and a heart, which matches the CP437 PC font.
Only `0x01`, `0x03` and printable ASCII have actually been seen on the panels.

### Other command bytes

Every value from `0x00` to `0xFF` was sent with several payloads. None caused a
disconnect or a visible fault, but only the ones above have a known effect.
Commands that need specific parameters could still have gone unnoticed.

## Not yet known

- The indicator LEDs above the side columns. Sweeps with fills of `00`, `01`, `03`,
  `64` and `FF` didn't light the left pair. The right pair wasn't in the camera's view
- Whether anything survives a power cycle

The display held with no traffic for about 100 seconds, so a keep-alive doesn't
appear to be needed, at least over that time.

Tested only on this one unit, firmware 0.20.
